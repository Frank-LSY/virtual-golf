// 0.27 球洞里的地面点缀（只是画面，不参与物理，都放在长草与界外，离球道、果岭、发球台有余量）：
// 苹果园——果箱与干草捆；公园——花坛与长椅；松林——树桩与蘑菇；沙漠——仙人掌与风滚草；
// 海岸——防沙栅栏与浮木；雨林——蕨类与大叶植物。
import * as THREE from 'three';
import {heightAt,surfaceAt,routeDistance,distance,random,landValue} from '../shared/courses.js';

// 0.27.1 整个占地（中心 + 半径 foot 的一圈 8 个点，再外扩 1 米余量）都必须是长草，才放点缀——
// 只检查中心时，原木、栅栏、花坛的边缘会搭到沙坑、球道或果岭上。也避开岩石与树干。
export function footClear(h,x,z,foot){for(let k=0;k<=8;k++){const a=k/8*Math.PI*2,r=k===8?0:foot+1,px=x+Math.cos(a)*r,pz=z+Math.sin(a)*r;if(surfaceAt(h,px,pz)!=='rough')return false;}return true;}
const obstacles=h=>[...(h.trees||[]).map(t=>({x:t.x,z:t.z,r:1.2*t.scale+1})),...(h.rocks||[]).map(r=>({x:r.x,z:r.z,r:1.6*Math.max(r.sx,r.sz)+1}))];
function spots(h,count,{minRoute=10,out=false,seed=0,tries=1600,away=[],foot=1}={}){
 const rng=random(h.seed+7717+seed),list=[],block=[...obstacles(h),...away];
 for(let i=0;i<tries&&list.length<count;i++){
  const x=(rng()-.5)*190,z=-30+rng()*(h.length+70);if(surfaceAt(h,x,z)!=='rough')continue;const land=landValue(h,x,z);if(out?land<.86:land>.82)continue;
  if(routeDistance(h,x,z)<h.width+minRoute+foot||distance({x,z},h.pin)<h.greenRadius+9+foot||Math.hypot(x,z)<14+foot)continue;
  if(!footClear(h,x,z,foot))continue;if(block.some(t=>Math.hypot(t.x-x,t.z-z)<(t.r||3)+foot))continue;
  const a=rng()*Math.PI*2,p={x,z,y:heightAt(h,x,z),r:rng(),a,foot};list.push(p);block.push({x,z,r:foot});
 }
 return list;
}
// 贴合地形的圆盘（花坛）：每个顶点都放在地面上方 5 厘米，不会一半埋进土里、一半悬空。
function groundDisc(h,x,z,r,color){const g=new THREE.CircleGeometry(r,24,0).rotateX(-Math.PI/2),p=g.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,heightAt(h,x+p.getX(i),z+p.getZ(i))+.05);g.computeVertexNormals();const m=new THREE.Mesh(g,mat(color));m.position.set(x,0,z);m.receiveShadow=true;m.userData.noOutline=true;m.userData.spots=[{x,z,foot:r}];return m;}
function instanced(geometry,material,items,place,{outline=true}={}){const mesh=new THREE.InstancedMesh(geometry,material,items.length),d=new THREE.Object3D();mesh.userData.spots=[];items.forEach((it,i)=>{place(d,it,i);d.updateMatrix();mesh.setMatrixAt(i,d.matrix);mesh.userData.spots.push({x:d.position.x,z:d.position.z,foot:it.foot??.6,matrix:d.matrix.clone()});if(it.color)mesh.setColorAt(i,new THREE.Color(it.color));});mesh.castShadow=true;mesh.receiveShadow=true;if(!outline)mesh.userData.noOutline=true;return mesh;}
const mat=(color,o={})=>new THREE.MeshStandardMaterial({color,roughness:.9,...o});

export function courseDecor(h){
 if(h.practice)return null;const g=new THREE.Group(),trees=(h.trees||[]).map(t=>({x:t.x,z:t.z,r:3*t.scale+1}));g.userData.courseDecor=h.courseId;
 if(h.courseId==='orchard'){
  // 果箱（两层）与干草捆
  const crates=spots(h,10,{minRoute:12,away:trees,foot:.8}),hay=spots(h,8,{minRoute:14,out:true,seed:2,foot:1});
  g.add(instanced(new THREE.BoxGeometry(.9,.55,.6),mat('#b07a45'),crates.flatMap(c=>[{...c,k:0},{...c,k:1}]),(d,c)=>{d.position.set(c.x+(c.k?.08:0),c.y+.28+c.k*.56,c.z);d.rotation.set(0,c.a+(c.k?.3:0),0);d.scale.setScalar(1);}));
  g.add(instanced(new THREE.BoxGeometry(.7,.3,.5),mat('#d8402e',{roughness:.5}),crates.filter(c=>c.r>.3),(d,c)=>{d.position.set(c.x+.08,c.y+1.2,c.z);d.rotation.set(0,c.a+.3,0);d.scale.set(.95,.4,.8);}));
  g.add(instanced(new THREE.CylinderGeometry(.75,.75,1.4,14).rotateZ(Math.PI/2),mat('#e2c46a'),hay,(d,c)=>{d.position.set(c.x,c.y+.75,c.z);d.rotation.set(0,c.a,0);}));
 }else if(h.courseId==='sunny'){
  // 发球台后方的两座花坛与长椅，果岭外侧再加两座小花坛
  const block=obstacles(h),beds=[{x:-11,z:-10},{x:11,z:-10},{x:h.pin.x-h.greenRadius-10,z:h.pin.z+6},{x:h.pin.x+h.greenRadius+10,z:h.pin.z+4}].filter(b=>footClear(h,b.x,b.z,2.7)&&!block.some(t=>Math.hypot(t.x-b.x,t.z-b.z)<t.r+2.7)),rng=random(h.seed+42),flowers=[],colors=['#ff5d6c','#ffd23f','#ff9fd0','#9b7bff','#ffffff','#ff8a3d'];
  for(const [bi,b] of beds.entries())for(let k=0;k<70;k++){const a=rng()*Math.PI*2,r=Math.sqrt(rng())*2.3,x=b.x+Math.cos(a)*r,z=b.z+Math.sin(a)*r;flowers.push({x,z,y:heightAt(h,x,z),color:colors[(bi+Math.floor(r*1.6))%colors.length]});}
  for(const b of beds)g.add(groundDisc(h,b.x,b.z,2.6,'#7a5a3a'));
  g.add(instanced(new THREE.IcosahedronGeometry(.17,0),mat('#ffffff',{roughness:.6}),flowers,(d,f)=>{d.position.set(f.x,f.y+.22,f.z);},{outline:false}));
  const benches=[{x:-6,z:-13},{x:6,z:-13}].filter(b=>footClear(h,b.x,b.z,1.2)&&!block.some(t=>Math.hypot(t.x-b.x,t.z-b.z)<t.r+1.2)).map(b=>({...b,y:heightAt(h,b.x,b.z),foot:1.2}));
  g.add(instanced(new THREE.BoxGeometry(2.2,.12,.6),mat('#c98a4b'),benches,(d,b)=>{d.position.set(b.x,b.y+.5,b.z);}));
  g.add(instanced(new THREE.BoxGeometry(2.2,.5,.1),mat('#c98a4b'),benches,(d,b)=>{d.position.set(b.x,b.y+.85,b.z-.3);}));
  g.add(instanced(new THREE.BoxGeometry(.1,.5,.5),mat('#45505a'),benches.flatMap(b=>[{...b,x:b.x-.95},{...b,x:b.x+.95}]),(d,b)=>{d.position.set(b.x,b.y+.25,b.z);}));
 }else if(h.courseId==='pine'){
  // 树桩、蘑菇
  const stumps=spots(h,12,{minRoute:12,away:trees,foot:.8}),shrooms=spots(h,28,{minRoute:11,seed:3,foot:.4});
  g.add(instanced(new THREE.CylinderGeometry(.55,.7,.6,10),mat('#8a6644'),stumps,(d,c)=>{d.position.set(c.x,c.y+.3,c.z);d.scale.setScalar(.8+c.r*.6);}));
  g.add(instanced(new THREE.SphereGeometry(.28,10,6,0,Math.PI*2,0,Math.PI/2),mat('#e2543f',{roughness:.6}),shrooms,(d,c)=>{d.position.set(c.x,c.y+.18,c.z);d.scale.set(1,.8,1);},{outline:false}));
  g.add(instanced(new THREE.CylinderGeometry(.08,.1,.2,6),mat('#f4ead6'),shrooms,(d,c)=>{d.position.set(c.x,c.y+.09,c.z);},{outline:false}));
 }else if(h.courseId==='desert'){
  // 树形仙人掌（主干 + 一两只举起的手臂），界外更多；风滚草
  const cacti=[...spots(h,14,{minRoute:14,away:trees,foot:1.5}),...spots(h,22,{minRoute:12,out:true,seed:4,foot:1.5})],parts=[];
  for(const c of cacti){const s=.8+c.r*.7,H=3.2*s;parts.push({x:c.x,z:c.z,y:c.y+H/2,sx:1,sy:H/1.6,rz:0,ry:0});
   for(const side of c.r>.45?[-1,1]:[c.r>.2?1:-1]){const ay=c.y+H*(.42+side*.06),ax=c.x+Math.cos(c.a)*side*.55*s,az=c.z+Math.sin(c.a)*side*.55*s;parts.push({x:ax,z:az,y:ay,sx:.72,sy:.45*s,rz:Math.PI/2,ry:-c.a});parts.push({x:c.x+Math.cos(c.a)*side*.95*s,z:c.z+Math.sin(c.a)*side*.95*s,y:ay+.55*s,sx:.72,sy:.75*s,rz:0,ry:0});}}
  g.add(instanced(new THREE.CapsuleGeometry(.36,1.6,4,10),mat('#3f8a4a'),parts,(d,p)=>{d.position.set(p.x,p.y,p.z);d.rotation.set(0,p.ry,p.rz);d.scale.set(p.sx,p.sy,p.sx);}));
  const weeds=spots(h,10,{minRoute:12,seed:5,foot:.6});g.add(instanced(new THREE.IcosahedronGeometry(.55,1),mat('#a9884f',{wireframe:true}),weeds,(d,c)=>{d.position.set(c.x,c.y+.5,c.z);d.rotation.set(c.a,c.a*2,0);},{outline:false}));
 }else if(h.courseId==='coast'){
  // 防沙栅栏（成排的木桩）与浮木
  const fences=spots(h,7,{minRoute:14,out:true,seed:6,foot:3.8}),posts=[];for(const f of fences)for(let k=-4;k<=4;k++){const x=f.x+Math.cos(f.a)*k*.9,z=f.z+Math.sin(f.a)*k*.9;posts.push({x,z,y:heightAt(h,x,z),r:f.r,foot:.2});}
  g.add(instanced(new THREE.BoxGeometry(.12,1.1,.12),mat('#b89b74'),posts,(d,p)=>{d.position.set(p.x,p.y+.5,p.z);d.rotation.set((p.r-.5)*.2,0,0);},{outline:false}));
  const logs=spots(h,8,{minRoute:12,seed:7,foot:1.7});g.add(instanced(new THREE.CylinderGeometry(.18,.24,3,8).rotateZ(Math.PI/2),mat('#cbbba0'),logs,(d,c)=>{d.position.set(c.x,c.y+.2,c.z);d.rotation.set(0,c.a,0);}));
 }else if(h.courseId==='rainforest'){
  // 蕨类（一丛 6 片拱起的羽叶）与大叶植物
  const ferns=spots(h,46,{minRoute:10,seed:8,foot:1.6}),fronds=[];for(const f of ferns){const s=.9+f.r*.9;for(let k=0;k<6;k++)fronds.push({x:f.x,z:f.z,y:f.y,a:f.a+k*1.047,s,foot:1.6,color:k%2?'#2f8f45':'#3fa04e'});}
  const fernMesh=instanced(frondGeometry(),mat('#ffffff',{side:THREE.DoubleSide}),fronds,(d,f)=>{d.position.set(f.x,f.y+.05,f.z);d.rotation.set(0,f.a,.85);d.scale.set(1.6*f.s,1.5*f.s,1.4*f.s);});fernMesh.userData.noOutline=true;g.add(fernMesh);
  const leaves=spots(h,18,{minRoute:12,seed:9,away:trees,foot:1.5});const big=instanced(new THREE.CircleGeometry(1,12),mat('#2c8a45',{side:THREE.DoubleSide}),leaves.flatMap(l=>[0,1,2].map(k=>({...l,k}))),(d,l)=>{d.position.set(l.x,l.y+.9+l.k*.25,l.z);d.rotation.set(-1.0+l.k*.25,l.a+l.k*2.1,0);d.scale.set(.9,1.4,1);});big.userData.noOutline=true;g.add(big);
 }

 birds(g,h);
 // 球停在点缀物旁边时，把它附近（含镜头所在的球后方）的点缀暂时收起，免得果箱、仙人掌挡在镜头前。
 const zero=new THREE.Matrix4().makeScale(0,0,0);
 g.userData.clearAround=(ball,radius=9)=>{for(const mesh of g.children){const spots=mesh.userData.spots;if(!spots)continue;let dirty=false;spots.forEach((sp,i)=>{const hide=Math.hypot(sp.x-ball.x,sp.z-ball.z)<radius;if(hide!==!!sp.hidden){sp.hidden=hide;mesh.setMatrixAt(i,hide?zero:sp.matrix);dirty=true;}});if(dirty)mesh.instanceMatrix.needsUpdate=true;}};
 return g.children.length?g:null;
}
// 0.27 天上的“生气”：海岸的海鸥成群盘旋、雨林的彩色鹦鹉、沙漠与松林高空的鹰、公园的小鸟、果园的蝴蝶。
const BIRDS={coast:{n:12,colors:['#eef2f5','#cdd6dd'],y:[12,30],r:[16,40],size:2.6,speed:[.25,.42],flap:5,near:true},rainforest:{n:7,colors:['#e8432f','#2f6fe8','#ffcf3a','#3fbf5a'],y:[14,30],r:[18,40],size:1.1,speed:[.35,.55],flap:7},desert:{n:2,colors:['#4a3a2c'],y:[60,80],r:[60,90],size:2.4,speed:[.12,.18],flap:1.2},pine:{n:2,colors:['#3b3330'],y:[65,85],r:[60,95],size:2.6,speed:[.1,.16],flap:1},sunny:{n:6,colors:['#3d3f4a','#5a5d68'],y:[16,28],r:[20,40],size:.8,speed:[.4,.6],flap:9},orchard:{n:10,colors:['#ffffff','#ffe066','#ffb3c7'],y:[1.2,3.2],r:[3,7],size:.28,speed:[.5,.9],flap:14}};
function birds(g,h){
 const cfg=BIRDS[h.courseId];if(!cfg)return;const rng=random(h.seed+919),geo=new THREE.BufferGeometry();
 geo.setAttribute('position',new THREE.Float32BufferAttribute([0,0,.35, -1,1,-.25, 0,0,-.2, 0,0,.35, 0,0,-.2, 1,1,-.25],3));geo.computeVertexNormals();
 const mesh=new THREE.InstancedMesh(geo,new THREE.MeshBasicMaterial({color:'#ffffff',side:THREE.DoubleSide}),cfg.n);mesh.userData.noOutline=true;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
 const lerp=(a,t)=>a[0]+(a[1]-a[0])*t,list=Array.from({length:cfg.n},(_,i)=>({cx:(rng()-.5)*90,cz:cfg.near?20+rng()*Math.min(120,h.length*.6):h.length*(.25+rng()*.6),cy:lerp(cfg.y,rng()),r:lerp(cfg.r,rng()),w:lerp(cfg.speed,rng())*(rng()<.5?-1:1),ph:rng()*6.28,fl:cfg.flap*(.8+rng()*.4)}));
 list.forEach((b,i)=>mesh.setColorAt(i,new THREE.Color(cfg.colors[i%cfg.colors.length])));
 const d=new THREE.Object3D();g.userData.animate=t=>{list.forEach((b,i)=>{const a=b.ph+t*b.w;d.position.set(b.cx+Math.cos(a)*b.r,b.cy+Math.sin(t*.7+b.ph)*1.2,b.cz+Math.sin(a)*b.r);d.rotation.set(0,-a+(b.w>0?0:Math.PI),Math.sin(a)*.25);const flap=Math.sin(t*b.fl+b.ph);d.scale.set(cfg.size,cfg.size*(flap*.55+.15),cfg.size);d.updateMatrix();mesh.setMatrixAt(i,d.matrix);});mesh.instanceMatrix.needsUpdate=true;};
 g.userData.animate(0);g.add(mesh);
}
// 0.27 棕榈叶：一条中脊折起的长叶，先略微上扬再下垂（单位长度，沿 +x）。
let frondCache=null;
export function frondGeometry(){
 if(frondCache)return frondCache.clone();const seg=10,positions=[],indices=[];
 for(let i=0;i<=seg;i++){const t=i/seg,x=t,y=.22*t-.95*t*t,w=.2*Math.pow(Math.sin(Math.PI*Math.min(1,t*1.08)),.65)+.015;positions.push(x,y+.05*w,0, x,y-.06*w,w, x,y-.06*w,-w);if(i<seg){const a=i*3,b=a+3;indices.push(a,b,a+1, a+1,b,b+1, a,a+2,b, a+2,b+2,b);}}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();frondCache=g;return g.clone();
}
