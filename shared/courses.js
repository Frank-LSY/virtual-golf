export const COURSES = [
  { id: 'sunny', name: '晴空公园', subtitle: '宽阔球道，慢慢找到节奏。', chineseName: '晴空公园', difficulty: '入门', location: '公园球场 · 阳光正好', color: '#718f42', sky: '#d4e5e2', grass: '#7fa75d', fairway: '#a5c779', green: '#bdd68c', trees: '#45765b', water: '#79b5bb', width: 24, greenRadius: 15, slope: 0.009, elevation: 2.4, wind: [0.5, 2.8],
    holes: [ ['晨光初现',3,135,0],['归途漫漫',4,285,25],['湖畔轻风',3,155,-18],['三叶草弯',4,310,-45],['周日漫步',5,420,35],['小小果园',3,165,10],['垂柳依依',4,325,-35],['金色时光',4,340,40],['归家果岭',5,445,-25] ] },
  { id: 'coast', name: '海岸林克斯', subtitle: '迎着海风，挑战更大胆的线路。', chineseName: '海岸林克斯', difficulty: '进阶', location: '海岸球场 · 向风而行', color: '#568e9b', sky: '#c4e1e7', grass: '#8dba9e', fairway: '#bdd39c', green: '#cbe3ae', trees: '#426d69', water: '#65aebb', width: 17, greenRadius: 12, slope: 0.017, elevation: 3.8, wind: [2.5, 5.5],
    holes: [ ['海盐与天空',3,150,-12],['岬角远望',4,300,38],['越过蔚蓝',3,175,15],['浮木之岸',5,440,-35],['沙丘漫步',4,325,45],['海湾回声',3,160,-20],['水手转弯',4,355,-42],['涨潮时分',5,470,30],['最后一缕光',4,360,-25] ] },
  { id: 'pine', name: '山谷松林', subtitle: '穿过松林，找到自己的路线。', chineseName: '山谷松林', difficulty: '困难', location: '山谷球场 · 松林之间', color: '#476d58', sky: '#d2deda', grass: '#5e8c67', fairway: '#8fb371', green: '#b1c986', trees: '#2f5e4c', water: '#739e9b', width: 13, greenRadius: 10, slope: 0.025, elevation: 7.5, wind: [1.8, 6],
    holes: [ ['走入松林',3,170,22],['山间折返',4,335,-55],['远眺台',3,190,-10],['穿越山脊',5,470,60],['林间窄道',4,345,-48],['静水深流',3,180,15],['山顶之上',5,485,-55],['回声山谷',4,370,50],['归来之路',4,390,-30] ] }
];

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const distance = (a, b) => Math.hypot(a.x-b.x, a.z-b.z);
export function random(seed) { let a = seed >>> 0; return () => { a += 0x6D2B79F5; let t=a; t=Math.imul(t ^ t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; }; }
export function makeHole(courseId='sunny', index=0, seed=1) {
  const course = COURSES.find(c=>c.id===courseId) || COURSES[0];
  const [name,par,length,bend] = course.holes[index];
  const rng = random(seed+index*7919+COURSES.indexOf(course)*1223);
  const points=[{x:0,z:0},{x:bend*0.45,z:length*0.27},{x:bend,z:length*0.58},{x:bend*0.4,z:length*0.83},{x:0,z:length}];
  const pin={x:(rng()-.5)*course.greenRadius*.65,z:length+(rng()-.5)*course.greenRadius*.5};
  const hazards=[{type:'sand',x:course.greenRadius+5,z:length-13,rx:8,rz:13,angle:-.5}];
  if (index>0 || course.id!=='sunny') hazards.push({type:'sand',x:bend- course.width-3,z:length*.58,rx:8,rz:16,angle:.5});
  if (index===2 || index===5 || course.id==='coast') hazards.push({type:'water',x:-course.width-22,z:length*.65,rx:20,rz:length*.18,angle:-.15});
  if (course.id==='pine') hazards.push({type:'sand',x:-course.greenRadius-4,z:length+4,rx:6,rz:10,angle:.3});
  const angle = course.id==='coast' ? Math.PI*.5+(rng()-.5)*.8 : rng()*Math.PI*2;
  const speed = course.wind[0]+rng()*(course.wind[1]-course.wind[0]);
  const hole={courseId:course.id,index,name,par,length,bend,points,pin,tee:{x:0,z:0},hazards,seed:seed+index*7919,wind:{x:Math.sin(angle)*speed,z:Math.cos(angle)*speed,speed},width:course.width,greenRadius:course.greenRadius,slope:course.slope*(index%2===0?1:-1),elevation:course.elevation,bounds:{minX:-105,maxX:105,minZ:-55,maxZ:length+60}};
  hole.route=Array.from({length:81},(_,i)=>routeAt(hole,i/80));
  hole.trees=makeTrees(hole);
  return hole;
}
export function routeAt(h,t){
  const n=h.points.length-1,v=clamp(t,0,.999999)*n,i=Math.floor(v),u=v-i;
  const a=h.points[Math.max(0,i-1)],b=h.points[i],c=h.points[Math.min(n,i+1)],d=h.points[Math.min(n,i+2)];
  const axis=k=>.5*((2*b[k])+(-a[k]+c[k])*u+(2*a[k]-5*b[k]+4*c[k]-d[k])*u*u+(-a[k]+3*b[k]-3*c[k]+d[k])*u*u*u);
  return {x:axis('x'),z:axis('z')};
}
export function routeDistance(h,x,z){
  let best=Infinity;
  for(let i=1;i<h.route.length;i++) {const a=h.route[i-1],b=h.route[i],dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1);best=Math.min(best,Math.hypot(x-a.x-t*dx,z-a.z-t*dz));}
  return best;
}
export function ellipseValue(p,x,z){const c=Math.cos(p.angle||0),s=Math.sin(p.angle||0),dx=x-p.x,dz=z-p.z; return ((dx*c+dz*s)/p.rx)**2+((-dx*s+dz*c)/p.rz)**2;}
export function landValue(h,x,z){ return (x/98)**4+((z-h.length/2)/(h.length/2+48))**6; }
export function surfaceAt(h,x,z){
  if(h.practice){if(!Number.isFinite(x+z)||x<h.bounds.minX||x>h.bounds.maxX||z<h.bounds.minZ||z>h.bounds.maxZ)return 'out';return h.putting?'green':Math.abs(x)<76?'fairway':'rough';}
  if(landValue(h,x,z)>1 || !Number.isFinite(x+z)) return 'out';
  for(const p of h.hazards) if(ellipseValue(p,x,z)<1) return p.type;
  if(Math.hypot(x,z-h.length)<h.greenRadius) return 'green';
  if(Math.abs(x)<5 && Math.abs(z)<4) return 'tee';
  if(routeDistance(h,x,z)<h.width*(.86+.14*Math.sin(z*.035))) return 'fairway';
  return 'rough';
}
export function heightAt(h,x,z){
  if(h.practice)return 3;
  const base=3+Math.sin(z*.027)*h.elevation+Math.sin(x*.045+z*.012)*h.elevation*.45;
  const greenBase=3+Math.sin(h.length*.027)*h.elevation+Math.sin(h.length*.012)*h.elevation*.45;
  const g=clamp((Math.hypot(x,z-h.length)-h.greenRadius)/12,0,1);
  let y=base*g+(greenBase+(x-h.pin.x)*h.slope+(z-h.pin.z)*h.slope*.65)*(1-g);
  for(const p of h.hazards) if(p.type==='water'){const e=ellipseValue(p,x,z); if(e<1.6)y=y*clamp((e-.85)/.75,0,1)-.4*(1-clamp((e-.85)/.75,0,1));}
  const edge=clamp((landValue(h,x,z)-.72)/.35,0,1);y=y*(1-edge)-7*edge;
  return y;
}
export function slopeAt(h,x,z){ const e=.3;return {x:(heightAt(h,x+e,z)-heightAt(h,x-e,z))/(2*e),z:(heightAt(h,x,z+e)-heightAt(h,x,z-e))/(2*e)}; }
export function makeTrees(h){
  const rng=random(h.seed+4583),trees=[];
  for(let i=0;i<900 && trees.length<(h.courseId==='pine'?105:h.courseId==='coast'?34:70);i++){
    const x=(rng()-.5)*184,z=-25+rng()*(h.length+60),lie=surfaceAt(h,x,z);
    if(lie==='rough'&&routeDistance(h,x,z)>h.width+10&&landValue(h,x,z)<.8&&distance({x,z},h.pin)>h.greenRadius+10)trees.push({x,z,scale:.8+rng()*.8,rotation:rng()*Math.PI*2});
  }return trees;
}
export function clubFor(h,ball){
 const lie=surfaceAt(h,ball.x,ball.z),d=distance(ball,h.pin);
 if(lie==='green')return {id:'putter',name:'推杆',mode:'果岭推杆',range:28,speed:5.4,loft:0};
 if(lie==='sand')return {id:'wedge',name:'沙坑杆',mode:'沙坑救球',range:55,speed:25,loft:56};
 if(d<35)return {id:'chip',name:'劈起杆',mode:'短距离切球',range:38,speed:18,loft:40};
 if(d<90)return {id:'wedge',name:'沙坑杆',mode:'攻果岭',range:85,speed:29,loft:50};
 if(d<185)return {id:'iron',name:'7 号铁杆',mode:'攻果岭',range:165,speed:39,loft:37};
 return {id:'driver',name:'一号木杆',mode:'远距离击球',range:265,speed:51,loft:28};
}
