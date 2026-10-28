import {COURSE_DESIGNS} from './course-designs.js';

const cache=new Map(),tau=Math.PI*2;
const point=(x,z)=>({x,z}),dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
// 从用户提供的示意图抽象出发球台/果岭关系；并非测绘坐标。
const orchardPairs=[[[390,210],[590,276]],[[552,345],[598,501]],[[818,443],[774,169]],[[711,62],[672,445]],[[760,443],[706,632]],[[658,674],[431,631]],[[342,677],[266,510]],[[330,285],[406,532]],[[515,546],[450,342]]];
const orchard=COURSE_DESIGNS.find(c=>c.id==='orchard');
orchardPairs.forEach(([a,b],i)=>orchard.holes[i][2]=Math.round(Math.hypot(b[0]-a[0],b[1]-a[1])*.52));

export function localToCourse(placement,p){const s=Math.sin(placement.heading),c=Math.cos(placement.heading);return {x:placement.tee.x+p.x*c+p.z*s,z:placement.tee.z-p.x*s+p.z*c};}
export function courseToLocal(placement,p){const s=Math.sin(placement.heading),c=Math.cos(placement.heading),x=p.x-placement.tee.x,z=p.z-placement.tee.z;return {x:x*c-z*s,z:x*s+z*c};}
export function courseLayout(id){
 if(cache.has(id))return cache.get(id);
 const c=COURSE_DESIGNS.find(c=>c.id===id)||COURSE_DESIGNS[0];let placements;
 if(c.routing==='orchard')placements=orchardPairs.map(([a,b],i)=>{const tee=point((a[0]-560)*.52,(440-a[1])*.52),heading=Math.atan2(b[0]-a[0],a[1]-b[1]);return {index:i,tee,heading,length:c.holes[i][2]};});
 else if(c.routing==='woodland'){
  // 林地采用去回交错的走廊，短洞连接长洞，外侧绕行后沿内侧返回会所。
  placements=[[0,0,0],[60,295,90],[235,265,180],[200,-95,236],[-240,-280,0],[-180,75,0],[-240,260,0],[-205,635,90],[-105,585,180]].map(([x,z,degrees],i)=>({index:i,tee:point(x,z),heading:degrees*Math.PI/180,length:c.holes[i][2]}));
 }
 else {
  // 以各洞长度解出不交叉的闭合环线，转角和洞长不同，围合主题自然保留地。
  const gap=c.id==='coast'?100:88,sides=c.holes.map(h=>h[2]+gap),max=Math.max(...sides);let lo=max/2+1,hi=sides.reduce((a,b)=>a+b,0);
  for(let n=0;n<64;n++){const r=(lo+hi)/2,sum=sides.reduce((s,l)=>s+2*Math.asin(l/(2*r)),0);if(sum>tau)lo=r;else hi=r;}
  const radius=(lo+hi)/2,rotation=({park:2.4,woodland:2.9,desert:3.5,links:1.6,tropical:2.1})[c.routing];let a=rotation;
  const stretch=({park:[1.12,.88],woodland:[.82,1.2],desert:[1.32,.76],links:[1.48,.67],tropical:[.9,1.16]})[c.routing];
  const vertices=sides.map(length=>{const p=point(Math.cos(a)*radius*stretch[0],Math.sin(a)*radius*stretch[1]);a+=2*Math.asin(length/(2*radius));return p;});
  if(c.routing==='woodland'||c.routing==='tropical'){vertices[4].x*=.66;vertices[4].z*=.66;}
  // 保留真实米制洞长，放松节点得到狭长海岸、内凹林谷和宽扁绿洲的不同轮廓。
  for(let iteration=0;iteration<400;iteration++)for(let i=0;i<9;i++){const p=vertices[i],q=vertices[(i+1)%9],d=dist(p,q),f=(d-sides[i])/(2*d),dx=(q.x-p.x)*f,dz=(q.z-p.z)*f;p.x+=dx;p.z+=dz;q.x-=dx;q.z-=dz;}
  placements=vertices.map((start,i)=>{const end=vertices[(i+1)%9],heading=Math.atan2(end.x-start.x,end.z-start.z),tee=point(start.x+Math.sin(heading)*gap/2,start.z+Math.cos(heading)*gap/2);return {index:i,tee,heading,length:c.holes[i][2]};});
 }
 for(const p of placements)p.green=localToCourse(p,point(0,p.length));
 const all=placements.flatMap(p=>[p.tee,p.green]),bounds={minX:Math.min(...all.map(p=>p.x))-95,maxX:Math.max(...all.map(p=>p.x))+95,minZ:Math.min(...all.map(p=>p.z))-95,maxZ:Math.max(...all.map(p=>p.z))+95};
 const clubhouse=c.id==='orchard'?point(-172,91):localToCourse(placements[0],point(-65,-35));
 const center=point((bounds.minX+bounds.maxX)/2,(bounds.minZ+bounds.maxZ)/2),reserve=c.id==='sunny'?{type:'lake',x:center.x,z:center.z,rx:(bounds.maxX-bounds.minX)*.14,rz:(bounds.maxZ-bounds.minZ)*.16}:null;
 const layout={courseId:c.id,placements,bounds,clubhouse,center,reserve};cache.set(id,layout);return layout;
}
export function courseSummary(c){return {par:c.holes.reduce((s,h)=>s+h[1],0),length:c.holes.reduce((s,h)=>s+h[2],0),holes:c.holes.length};}
export function challengeLabel(value){return ['','舒缓','轻松','策略','挑战','考验'][value]||'策略';}
