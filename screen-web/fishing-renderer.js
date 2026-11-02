// 体感钓鱼 · 湖面画面（卡通着色）。所有钓手站在同一座栈桥上、看同一片湖，但每格只显示自己的竿、线、浮漂和鱼
// （每位钓手的物体放在自己的图层上）。1 人全屏、2 人上下、3–4 人四宫格、5–6 人六宫格；3 人和 5 人时空出的一格是排行榜。
import * as THREE from 'three';
import {WATERS,WEEDS,FISH,REEDS_AT,DEEP_AT,polar,zoneFrame,clamp,lerp} from '../shared/fishing/rules.js';
import {ROD_TIP} from '../shared/fishing/angler.js';
const INK='#22264a',UP=new THREE.Vector3(0,1,0);
const HAND=new THREE.Vector3(.35,1.35,.35);

export class FishingScene {
 constructor(canvas){
  this.canvas=canvas;const r=this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});this.dpr=Math.min(1.5,window.devicePixelRatio||1);r.setPixelRatio(this.dpr);r.outputColorSpace=THREE.SRGBColorSpace;r.toneMapping=THREE.NoToneMapping;r.shadowMap.enabled=true;r.shadowMap.type=THREE.PCFSoftShadowMap;r.shadowMap.autoUpdate=false;
  this.scene=new THREE.Scene();this.scene.background=this.sky('#69bdf5','#c9ecff','#fff2d4');this.scene.fog=new THREE.Fog('#d4efff',70,190);
  this.scene.add(new THREE.HemisphereLight('#ffffff','#9bb878',1.8));this.sun=new THREE.DirectionalLight('#fff3dc',2.3);this.sun.position.set(-20,30,18);this.sun.castShadow=true;this.sun.shadow.mapSize.set(1024,1024);Object.assign(this.sun.shadow.camera,{left:-22,right:22,top:22,bottom:-22,near:1,far:90});this.sun.shadow.bias=-.0008;this.scene.add(this.sun,this.sun.target);this.sun.target.position.set(0,0,-8);
  this.gradient=this.toonRamp();this.views=new Map();this.pulses=[];this.time=0;this.build();this.overview=null;
 }
 toonRamp(){const d=new Uint8Array([95,95,95,255,180,180,180,255,255,255,255,255]),t=new THREE.DataTexture(d,3,1,THREE.RGBAFormat);t.minFilter=t.magFilter=THREE.NearestFilter;t.needsUpdate=true;return t;}
 sky(a,b,c){const cv=document.createElement('canvas');cv.width=2;cv.height=256;const x=cv.getContext('2d'),g=x.createLinearGradient(0,0,0,256);g.addColorStop(0,a);g.addColorStop(.55,b);g.addColorStop(1,c);x.fillStyle=g;x.fillRect(0,0,2,256);const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;return t;}
 mat(color,extra={}){return new THREE.MeshToonMaterial({color,gradientMap:this.gradient,...extra});}
 hull(mesh,scale=1.06,color=INK){const m=new THREE.Mesh(mesh.geometry,new THREE.MeshBasicMaterial({color,side:THREE.BackSide}));m.scale.setScalar(scale);mesh.add(m);return m;}
 label(text,{color=INK,background='#ffffff',width=3.4}={}){const c=document.createElement('canvas');c.width=512;c.height=112;const x=c.getContext('2d');x.fillStyle=INK;x.beginPath();x.roundRect(4,10,504,96,30);x.fill();x.fillStyle=background;x.beginPath();x.roundRect(4,2,504,92,28);x.fill();x.lineWidth=7;x.strokeStyle=INK;x.stroke();x.fillStyle=color;x.textAlign='center';x.textBaseline='middle';x.font='900 40px "PingFang SC","Microsoft YaHei",sans-serif';x.fillText(text,256,49);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false}));s.scale.set(width,width*112/512,1);s.userData.canvas=c;return s;}
 waterTexture(){const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');x.fillStyle='#3aa7cf';x.fillRect(0,0,256,256);x.strokeStyle='rgba(255,255,255,.28)';x.lineWidth=3;x.lineCap='round';let s=11;const r=()=>{s=(s*16807)%2147483647;return s/2147483647;};for(let i=0;i<46;i++){const px=r()*256,py=r()*256,l=10+r()*26;x.beginPath();x.moveTo(px,py);x.quadraticCurveTo(px+l/2,py-4,px+l,py);x.stroke();}const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(26,26);t.colorSpace=THREE.SRGBColorSpace;return t;}
 build(){
  const S=this.scene;
  // 湖水与岸
  this.water=new THREE.Mesh(new THREE.PlaneGeometry(320,320),this.mat('#ffffff',{map:this.waterTexture()}));this.water.rotation.x=-Math.PI/2;this.water.position.set(0,0,-80);this.water.receiveShadow=true;S.add(this.water);
  const shore=new THREE.Mesh(new THREE.PlaneGeometry(320,120),this.mat('#8fcf5e'));shore.rotation.x=-Math.PI/2;shore.position.set(0,.18,60.6);shore.receiveShadow=true;S.add(shore);
  const sand=new THREE.Mesh(new THREE.BoxGeometry(320,.4,2.2),this.mat('#f1d9a0'));sand.position.set(0,-.02,.9);sand.receiveShadow=true;S.add(sand);
  // 浅湾（浅色水）与睡莲
  const sc=polar(9,-30);const shallow=new THREE.Mesh(new THREE.CircleGeometry(7.5,48),new THREE.MeshBasicMaterial({color:'#7fd9cf',transparent:true,opacity:.45,depthWrite:false}));shallow.rotation.x=-Math.PI/2;shallow.position.set(sc.x-1.5,.02,sc.z+1.5);S.add(shallow);
  const lily=this.mat('#5bbf5a');for(let i=0;i<9;i++){const a=i*2.4,rr=4.2+(i%3)*1.1,pad=new THREE.Mesh(new THREE.CylinderGeometry(.55+(i%2)*.2,.55+(i%2)*.2,.05,14,1,false,0,Math.PI*1.8),lily);pad.position.set(sc.x+Math.cos(a)*rr,.04,sc.z+Math.sin(a)*rr*.7);pad.rotation.y=a;S.add(pad);if(i%3===0){const fl=new THREE.Mesh(new THREE.SphereGeometry(.18,10,8),this.mat('#ffb3d1'));fl.position.set(pad.position.x,.15,pad.position.z);S.add(fl);}}
  // 芦苇（实例化）
  const stalk=new THREE.CylinderGeometry(.03,.05,1,5);stalk.translate(0,.5,0);const count=WEEDS.reduce((n,w)=>n+Math.round(w.r*w.r*14),0);this.reeds=new THREE.InstancedMesh(stalk,this.mat('#8fb847'),count);this.reedTops=new THREE.InstancedMesh(new THREE.CylinderGeometry(.07,.07,.32,6),this.mat('#8a5a2b'),count);
  const dummy=new THREE.Object3D();let k=0,seed=7;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};this.reedData=[];
  for(const w of WEEDS){const n=Math.round(w.r*w.r*14);for(let i=0;i<n;i++){const a=rnd()*Math.PI*2,d=Math.sqrt(rnd())*w.r,h=1.4+rnd()*1.1;this.reedData.push({x:w.x+Math.cos(a)*d,z:w.z+Math.sin(a)*d,h,ph:rnd()*6});k++;}}
  this.placeReeds(0);S.add(this.reeds,this.reedTops);
  // 深水浮标
  const dz=DEEP_AT,dc=polar(dz.distance,dz.angle);for(let i=0;i<6;i++){const a=i/6*Math.PI*2,b=new THREE.Mesh(new THREE.SphereGeometry(.32,14,10),this.mat(i%2?'#ff7a3d':'#ffffff'));b.position.set(dc.x+Math.cos(a)*(dz.radius+1.2),.1,dc.z+Math.sin(a)*(dz.radius+1.2));this.hull(b,1.1);S.add(b);}
  // 0.29 整片湖都能钓：每片水域一块标牌（浅水 / 芦苇边 / 开阔水 / 深潭），不再画钓区圈。
   const SIGNS={shallow:{distance:8.5,angle:-34},reeds:{distance:REEDS_AT.distance-4,angle:REEDS_AT.angle+6},open:{distance:16,angle:-12},deep:{distance:DEEP_AT.distance,angle:DEEP_AT.angle}};
   this.zoneMarks=WATERS.map(w=>{const at=SIGNS[w.id],c=polar(at.distance,at.angle),g=new THREE.Group();g.position.set(c.x,.03,c.z);const sign=this.label(w.name,{background:w.color,color:'#ffffff',width:2.6+at.distance*.05});sign.position.set(0,1.4+at.distance*.05,0);g.add(sign);S.add(g);return {zone:w,group:g,sign};});
  // 远岸：小山、树、云
  const hill=this.mat('#7cc36a'),hill2=this.mat('#a7d98a'),trunk=this.mat('#8a5a2b'),leaf=this.mat('#3f9c5a'),leaf2=this.mat('#5cb85c');
  for(let i=0;i<16;i++){const x=-120+i*16+(i%3)*4,h=10+(i*7%9)*2.4,m=new THREE.Mesh(new THREE.SphereGeometry(h,18,12,0,Math.PI*2,0,Math.PI/2),i%2?hill:hill2);m.scale.set(1.7,.55,1);m.position.set(x,-.5,-118-(i%4)*8);S.add(m);}
  const treeAt=(x,z,s=1)=>{const t=new THREE.Mesh(new THREE.CylinderGeometry(.18*s,.28*s,1.6*s,7),trunk);t.position.set(x,.8*s,z);const c=new THREE.Mesh(new THREE.ConeGeometry(1.3*s,3*s,8),(x+z)%2>0?leaf:leaf2);c.position.set(x,2.9*s,z);c.castShadow=true;this.hull(c,1.05);S.add(t,c);};
  for(let i=0;i<40;i++){const a=-1.25+i*.064,d=88+(i*13%11);treeAt(Math.sin(a)*d,-Math.cos(a)*d*.95,1.6+(i%4)*.3);}
  for(let i=0;i<10;i++){treeAt(-14-i*4.5,4+(i%3)*3,1.2);treeAt(14+i*4.5,4+(i%2)*3.5,1.2);}
  const cloud=this.mat('#ffffff');for(let i=0;i<12;i++){const g=new THREE.Group();for(let j=0;j<4;j++){const p=new THREE.Mesh(new THREE.SphereGeometry(1,12,9),cloud);p.scale.set(3+j%2*1.6,1.8,2.4);p.position.set(j*3-4.5,(j%2)*.8,0);g.add(p);}g.position.set(-110+i*20,34+(i%3)*6,-150-(i%4)*10);S.add(g);}
  // 栈桥
  const plank=this.mat('#c98f52'),post=this.mat('#8a5a2b');const deck=new THREE.Mesh(new THREE.BoxGeometry(2.6,.18,6),plank);deck.position.set(0,.55,1.4);deck.castShadow=deck.receiveShadow=true;this.hull(deck,1.02);S.add(deck);
  for(let i=0;i<8;i++){const l=new THREE.Mesh(new THREE.BoxGeometry(2.62,.02,.05),post);l.position.set(0,.65,-1.4+i*.75);S.add(l);}
  for(const x of [-1.2,1.2])for(const z of [-1.4,1.4,4]){const p=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,1.6,8),post);p.position.set(x,0,z);S.add(p);}
 }
 placeReeds(t){const d=new THREE.Object3D();this.reedData.forEach((r,i)=>{const sway=Math.sin(t*1.3+r.ph)*.06;d.position.set(r.x,0,r.z);d.rotation.set(sway,0,sway*.6);d.scale.set(1,r.h,1);d.updateMatrix();this.reeds.setMatrixAt(i,d.matrix);d.position.set(r.x+Math.sin(sway)*r.h,r.h-.1,r.z);d.scale.set(1,1,1);d.updateMatrix();this.reedTops.setMatrixAt(i,d.matrix);});this.reeds.instanceMatrix.needsUpdate=true;this.reedTops.instanceMatrix.needsUpdate=true;}
 // ---------- 每位钓手的物体（只在自己的图层显示）----------
 view(a){
  if(this.views.has(a.id))return this.views.get(a.id);const layer=1+a.slot,g=new THREE.Group(),set=o=>{o.traverse(x=>x.layers.set(layer));return o;};
  const rod=new THREE.Mesh(new THREE.BufferGeometry(),this.mat('#6b3f1d'));const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({length:18},()=>new THREE.Vector3())),new THREE.LineBasicMaterial({color:'#ffffff'}));line.frustumCulled=false;
  const bob=new THREE.Group(),top=new THREE.Mesh(new THREE.SphereGeometry(.16,14,10,0,Math.PI*2,0,Math.PI/2),this.mat('#ff4d4d')),bot=new THREE.Mesh(new THREE.SphereGeometry(.16,14,10,0,Math.PI*2,Math.PI/2,Math.PI/2),this.mat('#ffffff'));this.hull(top,1.15);this.hull(bot,1.15);const stick=new THREE.Mesh(new THREE.CylinderGeometry(.02,.02,.3,5),this.mat('#ffd23f'));stick.position.y=.25;bob.add(top,bot,stick);
  const fish=new THREE.Mesh(new THREE.SphereGeometry(1,16,10),new THREE.MeshBasicMaterial({color:'#123a52',transparent:true,opacity:.42,depthWrite:false}));fish.scale.set(.25,.06,.6);
  const fan=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({color:a.color,transparent:true,opacity:.28,side:THREE.DoubleSide,depthWrite:false}));fan.renderOrder=3;
  const target=new THREE.Mesh(new THREE.RingGeometry(.55,.75,32),new THREE.MeshBasicMaterial({color:a.color,transparent:true,opacity:.9,side:THREE.DoubleSide,depthWrite:false}));target.rotation.x=-Math.PI/2;
  g.add(rod,line,bob,fish,fan,target);set(g);this.scene.add(g);
  const camera=new THREE.PerspectiveCamera(50,1,.1,400);camera.layers.enable(layer);const v={id:a.id,slot:a.slot,g,rod,line,bob,fish,fan,target,camera,look:new THREE.Vector3(0,0,-12),eye:new THREE.Vector3(0,3,4),fishPos:new THREE.Vector3(),bobPos:new THREE.Vector3(),aim:0,snap:true,layer,rodKey:'',fanKey:''};this.views.set(a.id,v);return v;
 }
 reset(){for(const v of this.views.values()){v.g.traverse(o=>{o.geometry?.dispose?.();});v.g.removeFromParent();}this.views.clear();}
 event(e,state){
  const v=this.views.get(e.id);if(!v)return;
  if(e.kind==='splash'||e.kind==='dash'||e.kind==='landed'||e.kind==='hook'){const at=e.kind==='splash'?new THREE.Vector3(e.x,0,e.z):v.fishPos.clone();this.pulse(at,v.layer,e.kind==='dash'?'#ffffff':e.kind==='landed'?'#ffd23f':'#e8fbff',e.kind==='dash'?1.6:1);}
  if(e.kind==='telegraph')this.pulse(v.fishPos.clone(),v.layer,'#7fd3ff',1.3,1.1);
 }
 pulse(at,layer,color,size=1,life=.7){const m=new THREE.Mesh(new THREE.TorusGeometry(.5,.06,6,28),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9,depthWrite:false}));m.rotation.x=Math.PI/2;m.position.set(at.x,.05,at.z);m.layers.set(layer);this.scene.add(m);this.pulses.push({m,age:0,size,life});}
 static layout(n,W,H){const cols=n<=1?1:n===2?1:n<=4?2:3,rows=n<=1?1:2,w=Math.floor(W/cols),h=Math.floor(H/rows),out=[];for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)out.push({x:c*w,y:r*h,w:c===cols-1?W-c*w:w,h:r===rows-1?H-r*h:h});return out;}
 draw(state,time){
  if(!this.renderer||!state)return;const canvas=this.canvas,W=Math.max(1,canvas.clientWidth),H=Math.max(1,canvas.clientHeight);
  const n=state.anglers.length,ratio=n>=5?Math.min(1.15,this.dpr):n>=3?Math.min(1.3,this.dpr):this.dpr;if(ratio!==this.ratio){this.ratio=ratio;this.renderer.setPixelRatio(ratio);this.width=null;}
  if(W!==this.width||H!==this.height){this.width=W;this.height=H;this.renderer.setSize(W,H,false);}
  const dt=this.last===undefined?1/60:clamp(time-this.last,0,.1);this.last=time;this.time+=dt;
  this.water.material.map.offset.x=(this.water.material.map.offset.x+dt*.012)%1;this.water.material.map.offset.y=(this.water.material.map.offset.y+dt*.02)%1;if(Math.floor(this.time*20)!==this.reedFrame){this.reedFrame=Math.floor(this.time*20);this.placeReeds(this.time);}
  
  const ids=new Set(state.anglers.map(a=>a.id));for(const [id,v] of this.views)if(!ids.has(id)){v.g.removeFromParent();this.views.delete(id);}
  for(const a of state.anglers)this.update(this.view(a),a,dt);
  for(let i=this.pulses.length-1;i>=0;i--){const p=this.pulses[i];p.age+=dt;const k=p.age/p.life;p.m.scale.setScalar(1+k*3*p.size);p.m.material.opacity=Math.max(0,.9*(1-k));if(k>=1){p.m.geometry.dispose();p.m.material.dispose();p.m.removeFromParent();this.pulses.splice(i,1);}}
  this.renderer.shadowMap.needsUpdate=true;const rects=FishingScene.layout(n,W,H);this.renderer.setScissorTest(true);
  state.anglers.forEach((a,i)=>{const v=this.views.get(a.id),rect=rects[i];if(!v||!rect)return;const cam=v.camera,aspect=rect.w/rect.h;cam.fov=aspect>2.4?36:aspect>1.9?42:aspect<.9?60:50;cam.aspect=aspect;cam.updateProjectionMatrix();this.renderer.setViewport(rect.x,H-rect.y-rect.h,rect.w,rect.h);this.renderer.setScissor(rect.x,H-rect.y-rect.h,rect.w,rect.h);this.renderer.render(this.scene,cam);});
  // 3 人 / 5 人时空出的一格：俯瞰湖面（排行榜叠在上面）。
  if(n===3||n===5){const rect=rects[n];if(rect){this.overview??=new THREE.PerspectiveCamera(45,1,.1,400);const c=this.overview;c.layers.disableAll();c.layers.enable(0);c.aspect=rect.w/rect.h;c.updateProjectionMatrix();c.position.set(0,34,14);c.lookAt(0,0,-16);this.renderer.setViewport(rect.x,H-rect.y-rect.h,rect.w,rect.h);this.renderer.setScissor(rect.x,H-rect.y-rect.h,rect.w,rect.h);this.renderer.render(this.scene,c);}}
  this.renderer.setScissorTest(false);
 }
 update(v,a,dt){
  const k=1-Math.exp(-dt/.08);
  // 浮漂与鱼：快照约 20 Hz，这里平滑插值。
  if(a.bobber){const t=new THREE.Vector3(a.bobber.x,a.bobber.y,a.bobber.z);if(v.bobHidden||a.phase==='flight'&&v.bobPos.distanceTo(t)>6)v.bobPos.copy(t);else v.bobPos.lerp(t,a.phase==='flight'?.5:k);v.bobHidden=false;}else v.bobHidden=true;
  if(a.fish){const t=new THREE.Vector3(a.fish.x,0,a.fish.z);if(!v.fishShown)v.fishPos.copy(t);else v.fishPos.lerp(t,k);v.fishShown=true;}else v.fishShown=false;
  const lure=['lure','bite'].includes(a.phase),fight=a.phase==='fight';
  let bobY=0;if(lure){bobY=Math.sin(this.time*2.2+a.slot)*.03;if(a.fish&&a.fish.A>.55)bobY-=.05*Math.abs(Math.sin(this.time*14));if(a.phase==='bite')bobY=-.22+Math.sin(this.time*20)*.04;}
  v.bob.visible=!v.bobHidden&&!fight;v.bob.position.set(v.bobPos.x,a.phase==='flight'||a.phase==='reel'?v.bobPos.y:bobY,v.bobPos.z);
  v.fish.visible=v.fishShown;if(v.fishShown){const sz=a.fight?clamp(.7+a.fight.kg*.12,.7,1.8):({big:1.6,carp:1.3,perch:1.15,golden:1,chest:1.4,boot:1})[a.fish.type]||.85,dash=fight&&a.fight?.behavior==='dash';v.fish.position.set(v.fishPos.x,-.25,v.fishPos.z);v.fish.scale.set(.32*sz,.06,.8*sz*(dash?1.25:1));const dx=v.fishPos.x-HAND.x,dz=v.fishPos.z-HAND.z;v.fish.rotation.y=Math.atan2(dx,dz)+(lure?Math.sin(this.time*3)*.3:0);v.fish.material.opacity=lure?.18+.3*(a.fish.A||0):.45;}
  // 瞄准扇区：准备时变亮并闪动。
  // 瞄准线：水面上一串虚线（每 2 米一段，越远越宽），准备时闪动。
  const aiming=['aim','armed'].includes(a.phase);v.fan.visible=aiming;if(aiming){const key=Math.round(a.aim*4);if(key!==v.fanKey){v.fanKey=key;const pts=[],idx=[],dir=polar(1,a.aim),side={x:-dir.z,z:dir.x};let n=0;for(let d=5;d<31;d+=2){const w=.08+d*.012,p0=polar(d,a.aim),p1=polar(d+1.1,a.aim);pts.push(p0.x+side.x*w,.05,p0.z+side.z*w,p0.x-side.x*w,.05,p0.z-side.z*w,p1.x+side.x*w,.05,p1.z+side.z*w,p1.x-side.x*w,.05,p1.z-side.z*w);idx.push(n,n+1,n+2,n+1,n+3,n+2);n+=4;}v.fan.geometry.dispose();v.fan.geometry=new THREE.BufferGeometry();v.fan.geometry.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));v.fan.geometry.setIndex(idx);}v.fan.material.opacity=a.phase==='armed'?.65+.3*Math.sin(this.time*10):.7;}
  v.target.visible=a.phase==='flight'&&!!a.target;if(a.target)v.target.position.set(a.target.x,.05,a.target.z);
  // 竿：随抬放 / 侧倾和张力弯曲。
  const look=fight||lure?Math.atan2(v.fishShown&&fight?v.fishPos.x:v.bobPos.x,-(fight&&v.fishShown?v.fishPos.z:v.bobPos.z))*180/Math.PI:a.aim;v.aim+=(look-v.aim)*k;
  const pitch=clamp(38+(a.pose?.p||0)*1.1,-5,85),roll=a.pose?.r||0,T=a.fight?.T||0,yaw=v.aim*Math.PI/180,el=pitch*Math.PI/180,L=2.6,dir=new THREE.Vector3(Math.sin(yaw)*Math.cos(el),Math.sin(el),-Math.cos(yaw)*Math.cos(el));
  const tip=HAND.clone().addScaledVector(dir,L);tip.x+=roll*.012;const bend=fight?T*1.1:lure?.1:0,toward=(fight?v.fishPos:v.bobPos).clone().sub(tip).setY(-1.5).normalize();const mid=HAND.clone().addScaledVector(dir,L*.55),tipB=tip.clone().addScaledVector(toward,bend*.9);
  const key=[tipB.x,tipB.y,tipB.z].map(x=>x.toFixed(2)).join();if(key!==v.rodKey){v.rodKey=key;v.rod.geometry.dispose();v.rod.geometry=new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(HAND,mid,tipB),12,.035,6,false);}
  v.tip=tipB;
  // 线：竿尖 → 浮漂 / 鱼；张力低时下垂。
  const end=fight?new THREE.Vector3(v.fishPos.x,-.05,v.fishPos.z):!v.bobHidden?v.bob.position.clone().setY(v.bob.position.y+.12):null;v.line.visible=!!end&&['flight','lure','bite','fight','reel'].includes(a.phase);
  if(v.line.visible){const pos=v.line.geometry.attributes.position,d=tipB.distanceTo(end),sag=fight?(1-T)*.12*d:a.phase==='flight'?.02*d:.06*d;for(let i=0;i<18;i++){const u=i/17,p=tipB.clone().lerp(end,u);p.y-=Math.sin(u*Math.PI)*sag;pos.setXYZ(i,p.x,p.y,p.z);}pos.needsUpdate=true;v.line.material.color.set(fight&&T>.85?'#ff6b6b':'#ffffff');}
  // 镜头：站在栈桥上方往目标看；目标从瞄准方向平滑移到浮漂、鱼。
  const goal=fight?v.fishPos.clone():lure||a.phase==='reel'?v.bobPos.clone().setY(0):a.phase==='flight'&&a.target?new THREE.Vector3(a.target.x,0,a.target.z):(()=>{const p=polar(14,a.aim);return new THREE.Vector3(p.x,0,p.z);})();
  if(v.snap){v.look.copy(goal);v.snap=false;}else v.look.lerp(goal,1-Math.exp(-dt/(a.phase==='flight'?.35:.6)));
  const far=clamp(v.look.distanceTo(HAND)/30,0,1),back=new THREE.Vector3(v.look.x,0,v.look.z).normalize();const eye=new THREE.Vector3(-back.x*(3.4+far*1.2),2.6+far*2.2,-back.z*(3.4+far*1.2)+.6);v.eye.lerp(eye,1-Math.exp(-dt/.5));v.camera.position.copy(v.eye);v.camera.lookAt(v.look.x*.92,0,v.look.z*.92);
 }
 dispose(){this.reset();this.renderer?.dispose();this.renderer=null;}
}
