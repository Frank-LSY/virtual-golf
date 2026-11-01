import * as THREE from 'three';
import {surfaceAt,random,distance,heightAt,landValue} from '../shared/courses.js';
import {courseToLocal,localToCourse} from '../shared/course-layout.js';
import {courseGround,courseHeight} from '../shared/course-tour.js';
import {courseStyle} from '../shared/course-styles.js';
import {treeSpecies} from '../shared/trees.js';

export function roadMesh(tour,route,color='#cbbd98',width=3.2){
 const positions=[],indices=[];let slot=0;
 for(let j=1;j<route.length;j++){const a=route[j-1],b=route[j],length=distance(a,b),n=Math.max(1,Math.ceil(length/4)),dx=(b.z-a.z)/(length||1)*width/2,dz=-(b.x-a.x)/(length||1)*width/2;
  for(let k=0;k<=n;k++){const t=k/n,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;for(const sign of [-1,1]){const p={x:x+dx*sign,z:z+dz*sign};positions.push(p.x,courseHeight(tour,p)+.12,p.z);}if(k<n){const i=slot+k*2;indices.push(i,i+2,i+1,i+1,i+2,i+3);}}slot+=(n+1)*2;
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return new THREE.Mesh(g,new THREE.MeshStandardMaterial({color,roughness:1,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
}
export class CourseLandscape extends THREE.Group {
 constructor(tour,{activeIndex=null}={}){
  super();this.tour=tour;const c=tour.course,b=tour.bounds,spanX=b.maxX-b.minX,spanZ=b.maxZ-b.minZ,step=8,nx=Math.ceil(spanX/step),nz=Math.ceil(spanZ/step);
  const geo=new THREE.PlaneGeometry(spanX,spanZ,nx,nz);geo.rotateX(-Math.PI/2);geo.translate(tour.center.x,0,tour.center.z);const p=geo.attributes.position,colors=[],style=courseStyle(c.id),palette={fairway:new THREE.Color(c.fairway),tee:new THREE.Color(c.fairway),green:new THREE.Color(c.green),rough:new THREE.Color(c.grass),sand:new THREE.Color(style.sand),water:new THREE.Color(c.water),out:new THREE.Color(c.ground)},index=[];
  const lies=[];for(let i=0;i<p.count;i++){const q={x:p.getX(i),z:p.getZ(i)},g=courseGround(tour,q),lie=g?surfaceAt(g.h,g.q.x,g.q.z):'out';lies.push(g?.h.index);p.setY(i,g?heightAt(g.h,g.q.x,g.q.z):0);const color=(palette[lie]||palette.out).clone();color.multiplyScalar(1+Math.sin(q.x*.03+q.z*.02)*.025);colors.push(color.r,color.g,color.b);}
  const ix=geo.index.array;for(let i=0;i<ix.length;i+=3){const ids=[ix[i],ix[i+1],ix[i+2]];if(activeIndex!==null){const center={x:ids.reduce((s,j)=>s+p.getX(j),0)/3,z:ids.reduce((s,j)=>s+p.getZ(j),0)/3},q=courseToLocal(tour.placements[activeIndex],center);if(landValue(tour.holes[activeIndex],q.x,q.z)<1.2)continue;}index.push(...ids);}
  geo.setIndex(index);geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();this.add(new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1})));
  const coast=style.backdrop==='coast',base=new THREE.Mesh(new THREE.PlaneGeometry(spanX+1800,spanZ+1800),new THREE.MeshStandardMaterial({color:c.ground,roughness:1}));base.rotation.x=-Math.PI/2;base.position.set(tour.center.x,-8,tour.center.z);this.add(base);
  // 0.27.1 海岸：陆地外面一圈白沙滩（宽 70 米），再往外是海。只铺在球场边界之外的“回”字形四条上——
  // 0.27.0 把沙滩和海做成整片平面垫在陆地下面，球洞里低于 -0.35 米的地方（果岭边的洼地、沙坑）会被沙滩平面盖住。
  if(coast){frame(this,b,0,70,-.3,new THREE.MeshStandardMaterial({color:style.sand,roughness:1}));frame(this,b,70,1000,-.7,new THREE.MeshStandardMaterial({color:c.water,roughness:.25,metalness:.15}));}
  // 0.22：远景装饰树（别的球洞的树、林地填充树）不再落进当前球洞的场地范围——
  // 它们没有碰撞、也不会随镜头淡化，以前会出现在球道、果岭甚至发球台后的镜头位置上挡住视线。
  const active=activeIndex===null?null:tour.holes[activeIndex],clear=q=>{if(!active)return true;const l=courseToLocal(tour.placements[activeIndex],q);return landValue(active,l.x,l.z)>=1.25;};
  // 0.27.1 别的球洞的树、林地填充树也不落到任何一洞的球道 / 果岭 / 沙坑 / 水 / 发球台上（相邻球洞的场地会交叠，
  // 一洞长草上的树可能正好在另一洞的果岭上，远看就是果岭上长了棵树）。
  const onPlay=(q,r)=>{for(let k=0;k<=8;k++){const a=k/8*Math.PI*2,rr=k===8?0:r,x=q.x+Math.cos(a)*rr,z=q.z+Math.sin(a)*rr;for(const h of tour.holes){const l=courseToLocal(h.placement,{x,z});if(Math.abs(l.x)>110||l.z<-60||l.z>h.length+65)continue;if(!['rough','out'].includes(surfaceAt(h,l.x,l.z)))return true;}}return false;},spot=(q,scale)=>clear(q)&&!onPlay(q,3.4*scale);
  const entries=[];for(const h of tour.holes){if(h.index===activeIndex)continue;h.trees.filter((_,i)=>i%3===0).forEach(t=>{const q=localToCourse(h.placement,t);if(spot(q,t.scale))entries.push({...q,y:courseHeight(tour,q),scale:t.scale});});}
  if(['pine','rainforest'].includes(c.id)){const rng=random(1654);for(let i=0;i<480;i++){const q={x:tour.center.x+(rng()-.5)*spanX*.64,z:tour.center.z+(rng()-.5)*spanZ*.64},g=courseGround(tour,q),scale=.9+rng()*.8;if((!g||g.q.z<0||g.q.z>g.h.length||Math.abs(g.q.x)>80)&&spot(q,scale))entries.push({...q,y:courseHeight(tour,q),scale,filler:true});}}
  const dummy=new THREE.Object3D();this.foliage=farTrees(this,entries,treeSpecies(c.id),style);
  for(const h of tour.holes){if(h.index===activeIndex)continue;const q=localToCourse(h.placement,h.pin);if(!clear(q))continue;const pole=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,4,5),new THREE.MeshBasicMaterial({color:'#fff9db'}));pole.position.set(q.x,courseHeight(tour,q)+2,q.z);this.add(pole);}
  const look=HOUSE[c.id]||HOUSE.sunny,house=new THREE.Group(),wall=new THREE.Mesh(new THREE.BoxGeometry(16,5,11),new THREE.MeshStandardMaterial({color:look[0]})),roof=new THREE.Mesh(new THREE.ConeGeometry(13,5,4),new THREE.MeshStandardMaterial({color:look[1]}));wall.position.y=2.5;roof.position.y=6.5;roof.rotation.y=Math.PI/4;roof.scale.z=.75;house.add(wall,roof);house.position.set(tour.clubhouse.x,courseHeight(tour,tour.clubhouse),tour.clubhouse.z);this.add(house);
  if(tour.reserve?.type==='lake'){const r=tour.reserve,lake=new THREE.Mesh(new THREE.CircleGeometry(1,64),new THREE.MeshStandardMaterial({color:c.water,roughness:.35,metalness:.1}));lake.rotation.x=-Math.PI/2;lake.scale.set(r.rx,r.rz,1);lake.position.set(r.x,.08,r.z);this.add(lake);}
  if(c.id==='desert'){const rocks=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:'#b47e58',roughness:1}),32),rng=random(1234);for(let i=0;i<32;i++){const a=i/32*Math.PI*2,r=Math.min(spanX,spanZ)*(.15+rng()*.1);dummy.position.set(tour.center.x+Math.cos(a)*r,2,tour.center.z+Math.sin(a)*r);dummy.scale.set(7+rng()*9,3+rng()*6,6+rng()*8);dummy.rotation.set(.2,rng()*6,.1);dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);}this.add(rocks);}
  // 0.27 远景：每座球场一圈自己的风景。
  backdrop(this,tour,style,clear);
 }
 dispose(){const geometries=new Set(),materials=new Set();this.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of o.material?Array.isArray(o.material)?o.material:[o.material]:[])materials.add(m);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.removeFromParent();}
}
const HOUSE={orchard:['#f3e6cc','#b8452f'],sunny:['#e8dfc6','#5e7865'],pine:['#c9a77a','#4b5d4f'],desert:['#ecd0a6','#a66f48'],coast:['#ffffff','#2f5f8f'],rainforest:['#dccaa3','#a8833f']};
const M=(color,o={})=>new THREE.MeshStandardMaterial({color,roughness:1,...o});
// 矩形边界外一圈“回”字形的水平面：从边界外 inner 米到 outer 米，高度 y。四条互不重叠。
function frame(group,b,inner,outer,y,material){
 const x0=b.minX-outer,x1=b.maxX+outer,z0=b.minZ-outer,z1=b.maxZ+outer,ix0=b.minX-inner,ix1=b.maxX+inner,iz0=b.minZ-inner,iz1=b.maxZ+inner;
 for(const [ax,bx,az,bz] of [[x0,x1,iz1,z1],[x0,x1,z0,iz0],[x0,ix0,iz0,iz1],[ix1,x1,iz0,iz1]]){const m=new THREE.Mesh(new THREE.PlaneGeometry(bx-ax,bz-az),material);m.rotation.x=-Math.PI/2;m.position.set((ax+bx)/2,y,(az+bz)/2);m.userData.backdrop='frame';group.add(m);}
}
function place(geometry,material,items,fn){const mesh=new THREE.InstancedMesh(geometry,material,items.length),d=new THREE.Object3D();items.forEach((it,i)=>{d.position.set(0,0,0);d.rotation.set(0,0,0);d.scale.set(1,1,1);fn(d,it,i);d.updateMatrix();mesh.setMatrixAt(i,d.matrix);if(it.color)mesh.setColorAt(i,new THREE.Color(it.color));});return mesh;}
// 远处的树：与球洞里同一树种的简化剪影（树干 + 树冠）。
// 0.27 优化：林地填充树（远处成片的那 480 棵）用最简的 20 面叶团，别的球洞里的树保留 80 面。
function farTrees(group,entries,species,style){
 if(!entries.length)return null;const near=entries.filter(t=>!t.filler),fill=entries.filter(t=>t.filler);let first=null;
 for(const [list,detail] of [[near,1],[fill,0]])if(list.length){const m=farTreeSet(group,list,species,style,detail);first??=m;}
 return first;
}
function farTreeSet(group,entries,species,style,detail){
 const leaves=style.leaves,color=(i)=>new THREE.Color(leaves[i%leaves.length]).multiplyScalar(.92+(i%3)*.05);
 const crownGeo=species==='pine'?new THREE.ConeGeometry(3.5,11,detail?7:5):new THREE.IcosahedronGeometry(4,detail),shape={round:[1,1,1,5,0],pine:[1,1,1,5,0],apple:[.75,.68,.75,3.4,2.2],palm:[.95,.32,.95,9.5,9],windswept:[1.25,.5,.95,4.6,4],canopy:[1.35,.55,1.35,9.6,8.5]}[species]||[1,1,1,5,0];
 const crowns=place(crownGeo,M('#ffffff'),entries,(d,t,i)=>{d.position.set(t.x+(species==='windswept'?1.4*t.scale:0),t.y+shape[3]*t.scale,t.z);d.scale.set(shape[0]*t.scale,shape[1]*t.scale*(species==='round'||species==='pine'?1:1),shape[2]*t.scale);d.rotation.y=i*2.4;});entries.forEach((_,i)=>crowns.setColorAt(i,color(i)));group.add(crowns);
 if(shape[4]>0){const trunks=place(new THREE.CylinderGeometry(.35,.5,1,6),M(style.trunk),entries,(d,t)=>{d.position.set(t.x,t.y+shape[4]*t.scale/2,t.z);d.scale.set(t.scale*(species==='palm'?.7:1),shape[4]*t.scale,t.scale*(species==='palm'?.7:1));});group.add(trunks);}
 return crowns;
}
// 0.27.1 球场里面的装饰（凉亭）找一块不压任何球洞场地的空地：从会所旁开始螺旋向外找。
function freeSpot(tour,from,radius,start){const free=q=>tour.holes.every(h=>{const l=courseToLocal(h.placement,q);return Math.abs(l.x)>110||l.z<-60||l.z>h.length+65||[[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius]].every(([dx,dz])=>landValue(h,l.x+dx,l.z+dz)>=1.2);});
 for(let r=start;r<start+160;r+=4)for(let k=0;k<24;k++){const a=k/24*Math.PI*2,q={x:from.x+Math.cos(a)*r,z:from.z+Math.sin(a)*r};if(free(q))return q;}return {x:from.x+start,z:from.z};}
// 远景沿着“球场外接矩形向外扩 m 米”的椭圆排布：大球场、小球场都贴着边界一圈。
function ringOf(c,hx,hz){return (rng,n,mIn,mOut,jitter=.3)=>Array.from({length:n},(_,i)=>{const a=(i+rng()*jitter)/n*Math.PI*2,m=mIn+rng()*(mOut-mIn);return {x:c.x+Math.cos(a)*(hx+m),z:c.z+Math.sin(a)*(hz+m),a,m,k:rng()};});}
// 0.27.1 远景物体整个落在球场边界之外：按它的水平半径往外推，保证离边界至少 12 米（以前大山、沙丘的底座会伸进球场）。
function outside(c,hx,hz,b){return (p,r)=>{const need=r+12;let m=p.m;for(let k=0;k<40;k++){const x=c.x+Math.cos(p.a)*(hx+m),z=c.z+Math.sin(p.a)*(hz+m),gap=Math.max(b.minX-x,x-b.maxX,b.minZ-z,z-b.maxZ);if(gap>=need){p.x=x;p.z=z;p.m=m;return p;}m+=Math.max(2,need-gap);}return p;};}
// 远山、台地、天际线不受雾影响，颜色预先混入一点天色，远近层次靠颜色而不是雾（否则大球场上会被雾完全吃掉）。
const haze=(color,style,t=.3)=>new THREE.Color(color).lerp(new THREE.Color(style.fog[0]),t);
const far=(color,style,t)=>new THREE.MeshStandardMaterial({color:haze(color,style,t),roughness:1,fog:false});
function backdrop(group,tour,style,clear){
 const c=tour.center,b=tour.bounds,hx=(b.maxX-b.minX)/2,hz=(b.maxZ-b.minZ)/2,ring=ringOf(c,hx,hz),out=outside(c,hx,hz,b),rng=random(421+style.label.length*97),kind=style.backdrop,add=(m,tag='far')=>{m.userData.backdrop=tag;group.add(m);return m;};
 if(kind==='mountains'){
  // 雪山：远处一圈蓝灰色山峰，山顶积雪；近一点是深绿的林丘。
  const peaks=ring(rng,18,280,430).map(p=>out(p,170+p.k*110));add(place(new THREE.ConeGeometry(1,1,7),far('#5f7d96',style,.28),peaks,(d,p)=>{const h=230+p.k*170;d.position.set(p.x,h/2-12,p.z);d.scale.set(170+p.k*110,h,170+p.k*110);d.rotation.y=p.a*3;}));
  add(place(new THREE.ConeGeometry(1,1,7),far('#ffffff',style,.08),peaks,(d,p)=>{const h=230+p.k*170;d.position.set(p.x,h*.84-12,p.z);d.scale.set((170+p.k*110)*.33,h*.33,(170+p.k*110)*.33);d.rotation.y=p.a*3;}));
  const hills=ring(rng,26,110,200).map(p=>out(p,80+p.k*50));add(place(new THREE.ConeGeometry(1,1,8),far('#2f6450',style,.18),hills,(d,p)=>{const h=70+p.k*55;d.position.set(p.x,h/2-6,p.z);d.scale.set(80+p.k*50,h,80+p.k*50);}));
 }else if(kind==='mesas'){
  // 红岩台地：平顶、三层岩色；近处是沙丘和散落的仙人掌。
  const mesas=ring(rng,16,210,380).map(p=>out(p,(48+p.k*55)*1.06));const strata=['#b85a33','#d98a52','#c56b3d'];
  strata.forEach((col,j)=>add(place(new THREE.CylinderGeometry(1,1.06,1,8),far(col,style,.18),mesas,(d,p)=>{const H=70+p.k*80,w=48+p.k*55;d.position.set(p.x,H*(j+.5)/3-4,p.z);d.scale.set(w*(1-j*.04),H/3,w*.8*(1-j*.04));d.rotation.y=p.a*2;})));
  const dunes=ring(rng,20,50,140).map(p=>out(p,60+p.k*50));add(place(new THREE.SphereGeometry(1,16,8,0,Math.PI*2,0,Math.PI/2),M(style.sand),dunes,(d,p)=>{d.position.set(p.x,-2,p.z);d.scale.set(60+p.k*50,10+p.k*12,35+p.k*25);d.rotation.y=p.a;}));
  const cacti=ring(rng,46,12,110,1).map(p=>out(p,2.5));add(place(new THREE.CapsuleGeometry(.5,3,4,8),M('#3f8a4a'),cacti,(d,p)=>{const s=1.2+p.k*1.4;d.position.set(p.x,s*2.2,p.z);d.scale.set(s,s,s);}));
 }else if(kind==='coast'){
  // 海岸：沙滩边的红白灯塔、海上的白帆、几块奶白色礁岩。
  const corner={x:b.minX-28,z:b.minZ-28},tower=new THREE.Group();for(let j=0;j<6;j++){const seg=new THREE.Mesh(new THREE.CylinderGeometry(3.4-j*.28,3.6-j*.28,4.2,16),M(j%2?'#d8423a':'#ffffff'));seg.position.y=2.1+j*4.2;tower.add(seg);}
  const lamp=new THREE.Mesh(new THREE.CylinderGeometry(2.2,2.2,2.6,12),M('#fff3a6',{emissive:'#ffe27a',emissiveIntensity:.6}));lamp.position.y=27.4;const cap=new THREE.Mesh(new THREE.ConeGeometry(2.8,3.2,12),M('#d8423a'));cap.position.y=30.3;tower.add(lamp,cap);tower.position.set(corner.x,-.3,corner.z);add(tower);
  const rocks=ring(rng,16,25,70,1).map(p=>out(p,18));add(place(new THREE.DodecahedronGeometry(1,0),M('#cfc6b2',{flatShading:true}),rocks,(d,p)=>{d.position.set(p.x,0,p.z);d.scale.set(8+p.k*10,5+p.k*7,7+p.k*8);d.rotation.set(.2,p.a,.1);}));
  const boats=ring(rng,10,120,360,1);add(place(new THREE.ConeGeometry(6,22,3),M('#ffffff'),boats,(d,p)=>{d.position.set(p.x,11.5,p.z);d.scale.set(.25,1,1);d.rotation.y=p.a;}));
  // 海上风车：高高的白塔，叶片慢慢转，从球场里多数方向都能看见海的方向。
  const turbines=ring(rng,9,170,300,.4),blades=[];for(const p of turbines){const t=new THREE.Group(),tower=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.8,70,10),M('#f6f8fa')),hub=new THREE.Mesh(new THREE.BoxGeometry(3,3,6),M('#f6f8fa')),rotor=new THREE.Group();tower.position.y=35;hub.position.set(0,71,0);rotor.position.set(0,71,3.2);for(let k=0;k<3;k++){const blade=new THREE.Mesh(new THREE.BoxGeometry(1.6,30,.4),M('#ffffff'));blade.position.y=15;const arm=new THREE.Group();arm.rotation.z=k*Math.PI*2/3;arm.add(blade);rotor.add(arm);}t.add(tower,hub,rotor);t.position.set(p.x,-.7,p.z);t.lookAt(c.x,-.7,c.z);t.rotateY(Math.PI);blades.push({rotor,speed:.25+p.k*.2});add(t);}
  group.animate=time=>{for(const b of blades)b.rotor.rotation.z=time*b.speed;};
  add(place(new THREE.BoxGeometry(9,1.6,3),M('#2f5f8f'),boats,(d,p)=>{d.position.set(p.x,.2,p.z);d.rotation.y=p.a+Math.PI/2;}));
  // 沙滩上一排排彩色海滨小屋（四座一组），从球场里大多数方向都能看到海边的味道。
  const huts=ring(rng,9,32,48,.5).map(p=>out(p,12)).flatMap((p,i)=>[0,1,2,3].map(k=>({...p,x:p.x+Math.cos(p.a+Math.PI/2)*(k-1.5)*6,z:p.z+Math.sin(p.a+Math.PI/2)*(k-1.5)*6,color:['#ff6f61','#ffd166','#4fc3f7','#7ed6a5','#ffffff','#b39ddb'][(i+k)%6]})));
  add(place(new THREE.BoxGeometry(4,4,4),M('#ffffff'),huts,(d,p)=>{d.position.set(p.x,1.7,p.z);d.rotation.y=-p.a;}));
  add(place(new THREE.ConeGeometry(3.4,2.4,4),M('#f4efe6'),huts.map(({color,...h})=>h),(d,p)=>{d.position.set(p.x,4.9,p.z);d.rotation.y=-p.a+Math.PI/4;}));
 }else if(kind==='jungle'){
  // 雨林：一圈长满植被的火山峰，其中一座挂着瀑布；山脚是更密的林冠。
  const peaks=ring(rng,12,170,320).map(p=>out(p,120+p.k*90));add(place(new THREE.ConeGeometry(1,1,9),far('#3f7a52',style,.3),peaks,(d,p)=>{const h=200+p.k*160;d.position.set(p.x,h/2-12,p.z);d.scale.set(120+p.k*90,h,120+p.k*90);d.rotation.y=p.a;}));
  add(place(new THREE.CylinderGeometry(.55,1,1,9),far('#2b5e40',style,.3),peaks,(d,p)=>{const h=200+p.k*160;d.position.set(p.x,h*.9-12,p.z);d.scale.set((120+p.k*90)*.22,h*.2,(120+p.k*90)*.22);d.rotation.y=p.a;}));
  const fall=peaks.reduce((a,p)=>p.k>a.k?p:a,peaks[0]),h=200+fall.k*160,dir={x:c.x-fall.x,z:c.z-fall.z},len=Math.hypot(dir.x,dir.z),fx=fall.x+dir.x/len*(120+fall.k*90)*.42,fz=fall.z+dir.z/len*(120+fall.k*90)*.42;
  const water=new THREE.Mesh(new THREE.PlaneGeometry(18,h*.55),new THREE.MeshBasicMaterial({color:'#eaf8ff',transparent:true,opacity:.92,side:THREE.DoubleSide,fog:false}));water.position.set(fx,h*.3-12,fz);water.lookAt(c.x,h*.3-12,c.z);water.userData.noOutline=true;add(water);
  const splash=new THREE.Mesh(new THREE.SphereGeometry(16,12,8),new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.55,fog:false}));splash.position.set(fx,-6,fz);splash.scale.y=.45;splash.userData.noOutline=true;add(splash);
 }else if(kind==='orchard'){
  // 果园：球场外一行行矮苹果树、红色谷仓和圆筒粮仓。
  const trees=[],out=(x,z)=>Math.max(Math.abs(x-c.x)-hx,Math.abs(z-c.z)-hz);for(let gx=-Math.ceil((hx+150)/16);gx<=Math.ceil((hx+150)/16);gx++)for(let gz=-Math.ceil((hz+150)/13);gz<=Math.ceil((hz+150)/13);gz++){const x=c.x+gx*16,z=c.z+gz*13,o=out(x,z);if(o>15&&o<145&&clear({x,z}))trees.push({x,z,k:rng()});}
  add(place(new THREE.IcosahedronGeometry(3,0),M('#ffffff'),trees.map((t,i)=>({...t,color:style.leaves[i%style.leaves.length]})),(d,t)=>{d.position.set(t.x,4.2,t.z);d.scale.set(1,.85,1);}));
  add(place(new THREE.CylinderGeometry(.35,.45,3,6),M(style.trunk),trees,(d,t)=>{d.position.set(t.x,1.4,t.z);}));
  const barns=ring(rng,4,60,110,.6).map(p=>out(p,20));for(const p of barns){const barn=new THREE.Group(),body=new THREE.Mesh(new THREE.BoxGeometry(18,10,12),M('#c0392b')),roof=new THREE.Mesh(new THREE.CylinderGeometry(8.5,8.5,18.4,4,1,false,Math.PI/4,Math.PI/2*2),M('#f4ecdf'));body.position.y=5;roof.rotation.z=Math.PI/2;roof.position.y=10;roof.scale.set(1,1,.8);const silo=new THREE.Mesh(new THREE.CylinderGeometry(3.4,3.4,16,14),M('#d9d2c2'));silo.position.set(13,8,0);const dome=new THREE.Mesh(new THREE.SphereGeometry(3.4,14,8,0,Math.PI*2,0,Math.PI/2),M('#9aa3a8'));dome.position.set(13,16,0);barn.add(body,roof,silo,dome);barn.position.set(p.x,0,p.z);barn.rotation.y=-p.a;add(barn);}
 }else{
  // 公园：远处一段彩色城市天际线，会所旁一座小凉亭，湖心一座喷泉。
  const sky=[];const arc=ring(rng,44,300,380,.2).filter(p=>p.a>Math.PI*.1&&p.a<Math.PI*1.3);const cols=['#d9e6f2','#f2dfd0','#e6e0f5','#d6efe3','#f5ecd0','#c9d8ea'];
  for(const p of arc)for(let k=0;k<2;k++)sky.push({...p,x:p.x+(k-.5)*30*Math.cos(p.a+1.57),z:p.z+(k-.5)*30*Math.sin(p.a+1.57),h:40+rng()*110,w:18+rng()*20,color:cols[Math.floor(rng()*cols.length)]});
  add(place(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:'#ffffff',roughness:1,fog:false}),sky.map(p=>({...p,color:haze(p.color,style,.25)})),(d,p)=>{d.position.set(p.x,p.h/2-4,p.z);d.scale.set(p.w,p.h*1.4,p.w*.8);d.rotation.y=-p.a;}));
  const club=tour.clubhouse,gz=new THREE.Group(),roof=new THREE.Mesh(new THREE.ConeGeometry(5,2.6,6),M('#ffffff'));roof.position.y=4.4;gz.add(roof);for(let j=0;j<6;j++){const post=new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,3.2,6),M('#ffffff'));post.position.set(Math.cos(j/6*Math.PI*2)*4,1.6,Math.sin(j/6*Math.PI*2)*4);gz.add(post);}const spot=freeSpot(tour,club,6,22);gz.position.set(spot.x,courseHeight(tour,spot),spot.z);add(gz,'inside');
  if(tour.reserve?.type==='lake'){const r=tour.reserve,f=new THREE.Group(),basin=new THREE.Mesh(new THREE.CylinderGeometry(3.2,3.6,.8,20),M('#e9e4d8')),jet=new THREE.Mesh(new THREE.ConeGeometry(1.2,6,12),new THREE.MeshBasicMaterial({color:'#f3fbff',transparent:true,opacity:.8}));jet.position.y=3.2;jet.userData.noOutline=true;f.add(basin,jet);f.position.set(r.x,.3,r.z);add(f,'inside');}
 }
}
