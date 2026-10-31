// 云端滚球 · 多人对战画面（0.24）：无尽云路按块搭建、身后一格格崩塌坠落；1 人全屏、2 人上下分屏、3–4 人四宫格
// （3 人时第四格是俯瞰全场）。每格一个跟随镜头，所有人在同一条赛道上，能看见彼此的球和名字。
// 每一格赛道（约 3 米）合并成一个网格（车道 + 护栏 + 箭头，顶点着色）+ 一个路面 + 一层描边，绘制调用少，四分屏也流畅。
import * as THREE from 'three';
import {cameraPose} from '../shared/maze/camera.js';
import {PHYSICS,clamp} from '../shared/maze/physics.js';
import {roadFrame,obstaclePose,sweeperPose} from '../shared/maze/levels.js';
import {ENDLESS,STAGES,stageBlend} from '../shared/maze/endless.js';
const INK='#22264a',UP=new THREE.Vector3(0,1,0);
const TOPS={normal:'#fff1cf',ice:'#c9f1ff',fluff:'#fff4fb',platform:'#fff8e6'};
// 赛道颜色随难度从青绿 → 橙 → 紫。
const BAND=['#24b8c2','#2fbf71','#ff9f43','#ef6f6c','#a46cf0','#6c63ff'];
const GOLD='#ffce62',WHITE='#fffdf6';

// 把多个几何体（已经变换到世界坐标）合并成一个带顶点颜色的几何体。
function merge(parts){
 let count=0;const geoms=parts.map(({geometry,color})=>{const g=geometry.index?geometry:geometry.toNonIndexed();if(!g.attributes.normal)g.computeVertexNormals();count+=g.attributes.position.count;return {g,color:new THREE.Color(color)};});
 const pos=new Float32Array(count*3),nor=new Float32Array(count*3),col=new Float32Array(count*3),idx=[];let o=0;
 for(const {g,color} of geoms){const p=g.attributes.position,n=g.attributes.normal;for(let i=0;i<p.count;i++){pos.set([p.getX(i),p.getY(i),p.getZ(i)],(o+i)*3);nor.set([n.getX(i),n.getY(i),n.getZ(i)],(o+i)*3);col.set([color.r,color.g,color.b],(o+i)*3);}if(g.index)for(const k of g.index.array)idx.push(k+o);else for(let i=0;i<p.count;i++)idx.push(o+i);o+=p.count;g.dispose();}
 const out=new THREE.BufferGeometry();out.setAttribute('position',new THREE.BufferAttribute(pos,3));out.setAttribute('normal',new THREE.BufferAttribute(nor,3));out.setAttribute('color',new THREE.BufferAttribute(col,3));out.setIndex(idx);return out;
}
function pipe(a,b,radius,segments=8){const d=new THREE.Vector3(b.x-a.x,b.y-a.y,b.z-a.z),len=d.length();if(len<1e-4)return null;const g=new THREE.CylinderGeometry(radius,radius,len,segments);const m=new THREE.Matrix4().compose(new THREE.Vector3((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2),new THREE.Quaternion().setFromUnitVectors(UP,d.normalize()),new THREE.Vector3(1,1,1));g.applyMatrix4(m);return g;}
// 带厚度的地面板：顶面一圈 + 底面一圈（共享顶点，描边沿法线外推时不会裂开）。
function slab(points,depth){const n=points.length,pos=[],idx=[];for(const q of points)pos.push(q.x,q.y,q.z);for(const q of points)pos.push(q.x,q.y-depth,q.z);for(let i=1;i<n-1;i++)idx.push(0,i,i+1);for(let i=1;i<n-1;i++)idx.push(n,n+i+1,n+i);for(let i=0;i<n;i++){const j=(i+1)%n;idx.push(i,n+i,j,j,n+i,n+j);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return g;}
function quad(points,lift=.008){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points.flatMap(q=>[q.x,q.y+lift,q.z]),3));g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();return g;}

export class VersusScene {
 constructor(canvas){
  this.canvas=canvas;const r=this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});r.setPixelRatio(Math.min(1.5,window.devicePixelRatio||1));this.dpr=Math.min(1.5,window.devicePixelRatio||1);r.outputColorSpace=THREE.SRGBColorSpace;r.toneMapping=THREE.NoToneMapping;r.shadowMap.enabled=true;r.shadowMap.type=THREE.PCFSoftShadowMap;r.shadowMap.autoUpdate=false;
  this.scene=new THREE.Scene();this.skyCanvas=document.createElement('canvas');this.skyCanvas.width=2;this.skyCanvas.height=256;this.skyTex=new THREE.CanvasTexture(this.skyCanvas);this.skyTex.colorSpace=THREE.SRGBColorSpace;this.scene.background=this.skyTex;this.scene.fog=new THREE.Fog(STAGES[0].fog,60,175);this.hemi=new THREE.HemisphereLight('#ffffff','#a8a0e0',1.9);this.scene.add(this.hemi);this.paintSky(STAGES[0].sky.map(c=>new THREE.Color(c)));
  this.sun=new THREE.DirectionalLight('#fff3dc',2.4);this.sun.castShadow=true;this.sun.shadow.mapSize.set(1536,1536);Object.assign(this.sun.shadow.camera,{left:-38,right:38,top:38,bottom:-38,near:1,far:110});this.sun.shadow.bias=-.0008;this.sun.shadow.normalBias=.03;this.scene.add(this.sun,this.sun.target);
  this.gradient=this.toonRamp();this.track=new THREE.Group();this.scene.add(this.track);this.pieces=new Map();this.tops=[];this.tiles=[];this.items=[];this.pulses=[];this.balls=new Map();this.views=[];
  this.mats={top:{normal:this.material(TOPS.normal),platform:this.material(TOPS.platform),ice:this.material(TOPS.ice,{map:this.stripeTexture('#c9f1ff','#e9fbff',6,.6)}),fluff:this.material(TOPS.fluff,{map:this.stripeTexture('#fff4fb','#ffe3f1',10,0)})},body:this.material('#ffffff',{vertexColors:true}),ink:new THREE.MeshBasicMaterial({color:INK,side:THREE.BackSide}),boost:new THREE.MeshBasicMaterial({map:this.chevronTexture(),transparent:true,opacity:.95})};
  for(const k of ['ice','fluff'])this.mats.top[k].map.repeat.set(1.2,1.2);
  this.mats.ink.onBeforeCompile=sh=>{sh.vertexShader=sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed+=normalize(normal)*0.07;');};
  this.decor=this.makeWorld();this.overview=new THREE.PerspectiveCamera(50,1,.1,300);this.overviewFollow=new THREE.Vector3();this.raycaster=new THREE.Raycaster();this.lastTime=null;this.version=null;
  this.overview.layers.enableAll();
 }
 // 赛段主题：天空渐变、雾色、天光强度和阳光颜色随进程平滑过渡（见 shared/maze/endless.js 的 STAGES）。
 paintSky(colors){const x=this.skyCanvas.getContext('2d'),g=x.createLinearGradient(0,0,0,256);g.addColorStop(0,colors[0].getStyle());g.addColorStop(.55,colors[1].getStyle());g.addColorStop(1,colors[2].getStyle());x.fillStyle=g;x.fillRect(0,0,2,256);this.skyTex.needsUpdate=true;}
 theme(game){const {index,next,blend}=stageBlend(game.progress||0),a=STAGES[index],b=STAGES[next],mix=(u,v)=>new THREE.Color(u).lerp(new THREE.Color(v),blend),sky=a.sky.map((c,i)=>mix(c,b.sky[i])),key=sky.map(c=>c.getHexString()).join();if(key!==this.skyKey){this.skyKey=key;this.paintSky(sky);}this.scene.fog.color.copy(mix(a.fog,b.fog));this.hemi.intensity=a.hemi+(b.hemi-a.hemi)*blend;this.sun.color.copy(mix(a.sun,b.sun));}
 toonRamp(){const data=new Uint8Array([90,90,90,255,175,175,175,255,255,255,255,255]),t=new THREE.DataTexture(data,3,1,THREE.RGBAFormat);t.minFilter=t.magFilter=THREE.NearestFilter;t.needsUpdate=true;return t;}
 skyTexture(top,mid,bottom){const c=document.createElement('canvas');c.width=2;c.height=256;const x=c.getContext('2d'),g=x.createLinearGradient(0,0,0,256);g.addColorStop(0,top);g.addColorStop(.55,mid);g.addColorStop(1,bottom);x.fillStyle=g;x.fillRect(0,0,2,256);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
 material(color,extra={}){return new THREE.MeshToonMaterial({color,gradientMap:this.gradient,...extra});}
 stripeTexture(a,b,stripes=8,angle=0){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');x.fillStyle=a;x.fillRect(0,0,128,128);x.fillStyle=b;x.translate(64,64);x.rotate(angle);for(let i=-stripes;i<stripes;i++)x.fillRect(i*128/stripes,-128,64/stripes,256);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;return t;}
 chevronTexture(){const c=document.createElement('canvas');c.width=128;c.height=256;const x=c.getContext('2d');x.fillStyle='#ff9f1c';x.fillRect(0,0,128,256);for(let k=0;k<2;k++){x.fillStyle='#ffe066';x.beginPath();const y=k*128+20;x.moveTo(14,y+86);x.lineTo(64,y+20);x.lineTo(114,y+86);x.lineTo(114,y+112);x.lineTo(64,y+46);x.lineTo(14,y+112);x.closePath();x.fill();x.lineWidth=6;x.strokeStyle=INK;x.stroke();}const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;return t;}
 label(text,color,{width=3,ink=INK,background='#ffffff'}={}){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=112;const c=canvas.getContext('2d');c.fillStyle=INK;c.beginPath();c.roundRect(4,10,504,96,30);c.fill();c.fillStyle=background;c.beginPath();c.roundRect(4,2,504,92,28);c.fill();c.lineWidth=7;c.strokeStyle=INK;c.stroke();c.fillStyle=color||ink;c.textAlign='center';c.textBaseline='middle';c.font='900 40px "PingFang SC","Microsoft YaHei",sans-serif';c.fillText(text,256,49);const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false}));s.scale.set(width,width*112/512,1);return s;}
 // 远处的浮岛和云：跟着镜头循环摆放，赛道再长也一直有景。
 makeWorld(){
  const group=new THREE.Group(),list=[];this.scene.add(group);let seed=9137;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const palette=['#c9c3ff','#a6e3ff','#ffd1e8','#c8f5d2','#ffe7a8'];for(let i=0;i<60;i++){const radius=2+random()*5,mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius*.55,1.2+random()*1.6,7),this.material(palette[i%5]));mesh.position.set((random()-.5)*220,-12-random()*10,40-random()*260);mesh.rotation.y=random()*Math.PI;const ink=new THREE.Mesh(mesh.geometry,new THREE.MeshBasicMaterial({color:'#7d7fb8',side:THREE.BackSide}));ink.scale.setScalar(1.05);mesh.add(ink);group.add(mesh);list.push(mesh);}
  const cloud=this.material('#ffffff');for(let i=0;i<24;i++){const g=new THREE.Group();for(let j=0;j<4;j++){const puff=new THREE.Mesh(new THREE.SphereGeometry(1,14,10),cloud);puff.scale.set(2.4+j%2*1.4,1.5+(j%3)*.35,2);puff.position.set(j*2.4-3.6,(j%2)*.6,0);g.add(puff);}g.position.set((random()-.5)*200,-2-random()*10,40-random()*260);g.scale.setScalar(.7+random());group.add(g);list.push(g);}
  return list;
 }
 // ---------- 赛道块 ----------
 reset(game){
  for(const entry of this.pieces.values())this.disposeGroup(entry.group);this.pieces.clear();this.tops=[];this.tiles=[];this.items=[];
  for(const p of this.pulses)this.disposeGroup(p.mesh);this.pulses=[];
  for(const b of this.balls.values())this.disposeGroup(b.group);this.balls.clear();
  // 三四分屏时略降分辨率，集成显卡也流畅。
  this.renderer.setPixelRatio(game.players.length>=3?Math.min(1.25,this.dpr):this.dpr);this.width=null;
  for(const p of game.players)this.balls.set(p.id,this.makeBall(p));
  this.views=game.players.map(p=>({id:p.id,camera:this.makeCamera(p.slot),follow:new THREE.Vector3(),snap:true,heading:0,watch:p.id}));
  this.version=game.version;this.sync(game);
 }
 makeCamera(slot){const c=new THREE.PerspectiveCamera(52,1,.1,280);c.layers.enableAll();c.layers.disable(1+slot);return c;}
 makeBall(p){
  const c=document.createElement('canvas');c.width=512;c.height=256;const x=c.getContext('2d'),colors=[p.color,'#fffaf0',p.color,'#fffaf0',p.color,'#fffaf0'];for(let i=0;i<6;i++){x.fillStyle=colors[i];x.fillRect(i*512/6,0,512/6+1,256);}x.strokeStyle=INK;x.lineWidth=5;for(let i=0;i<6;i++){x.beginPath();x.moveTo(i*512/6,0);x.lineTo(i*512/6,256);x.stroke();}x.fillStyle='#fffaf0';x.beginPath();x.arc(256,128,34,0,7);x.fill();x.stroke();x.fillStyle=INK;x.font='900 40px sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(String(p.slot+1),256,130);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;const group=new THREE.Group(),ball=new THREE.Mesh(new THREE.SphereGeometry(PHYSICS.radius,36,24),this.material('#ffffff',{map:tex}));ball.castShadow=true;const ink=new THREE.Mesh(ball.geometry,new THREE.MeshBasicMaterial({color:INK,side:THREE.BackSide}));ink.scale.setScalar(1.08);ball.add(ink);group.add(ball);
  const sc=document.createElement('canvas');sc.width=sc.height=64;const s=sc.getContext('2d'),g=s.createRadialGradient(32,32,2,32,32,32);g.addColorStop(0,'rgba(34,38,74,.5)');g.addColorStop(1,'rgba(34,38,74,0)');s.fillStyle=g;s.fillRect(0,0,64,64);const shadow=new THREE.Mesh(new THREE.PlaneGeometry(1.65,1.65),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(sc),transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;group.add(shadow);
  const tag=this.label(`${p.slot+1}P ${p.name}`,INK,{width:2.6,background:p.color});tag.layers.set(1+p.slot);group.add(tag);
  // 每个球头上有一个小箭头，远处也认得出是谁。
  const cone=new THREE.Mesh(new THREE.ConeGeometry(.22,.42,4),new THREE.MeshBasicMaterial({color:p.color}));cone.rotation.x=Math.PI;cone.layers.set(1+p.slot);group.add(cone);
  this.scene.add(group);return {group,ball,shadow,tag,cone};
 }
 sync(game){
  for(const piece of game.track.pieces)if(piece.walls&&!this.pieces.has(piece.index))this.pieces.set(piece.index,this.buildPiece(piece));
 }
 colorFor(d){const t=clamp(d,0,1)*(BAND.length-1),i=Math.floor(t);return new THREE.Color(BAND[i]).lerp(new THREE.Color(BAND[Math.min(BAND.length-1,i+1)]),t-i).getStyle();}
 buildPiece(piece){
  const group=new THREE.Group(),entry={group,tiles:[],index:piece.index};this.track.add(group);const side=this.colorFor(piece.d);
  for(const f of piece.floors){
   if(f.road){const r=f.road,fr=f.frame,{v0,n,tl}=f.tiles,w=r.width/2,kind=r.surface||'normal';
    for(let i=0;i<n;i++){const a0=v0+i*tl,a1=a0+tl,P=(a,s)=>({x:r.a.x+fr.forward.x*a+fr.right.x*w*s,y:r.a.y+fr.slope*a,z:r.a.z+fr.forward.z*a+fr.right.z*w*s});
     const top=[P(a0,1),P(a1,1),P(a1,-1),P(a0,-1)],parts=[{geometry:slab(top,.7),color:side}];
     if(r.rails)parts.push(...this.rails(piece,f,a0,a1,side));else for(const s of [-1,1]){const g=pipe({...P(a0,s),y:P(a0,s).y+.03},{...P(a1,s),y:P(a1,s).y+.03},.06);if(g)parts.push({geometry:g,color:GOLD});}
     for(let d=6;d<fr.length-3;d+=8)if(d>=a0&&d<a1){const shape=new THREE.Shape();shape.moveTo(-.34,-.2);shape.lineTo(0,.26);shape.lineTo(.34,-.2);shape.lineTo(0,-.05);shape.closePath();const g=new THREE.ShapeGeometry(shape);g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-Math.PI/2,0,-fr.heading,'YXZ')));const c=P(d,0);g.translate(c.x,c.y+.025,c.z);parts.push({geometry:g,color:kind==='ice'?'#7fd6f7':'#ffffff'});}
     const tile=this.tile(group,parts,quad(top),kind,r.s0+a1);
     for(const b of piece.boostZones)if(b.road===r){const t0=b.t0*fr.length,t1=b.t1*fr.length,lo=Math.max(a0,t0),hi=Math.min(a1,t1);if(hi-lo>.2){const bw=b.width,len=hi-lo,c=P((lo+hi)/2,0),m=new THREE.Mesh(new THREE.PlaneGeometry(bw,len),this.mats.boost);m.position.set(c.x,c.y+.03,c.z);m.rotation.order='YXZ';m.rotation.set(-Math.PI/2+Math.atan(fr.slope),-fr.heading,0);tile.group.add(m);}}
    }}
   else{const p=f.platform,kind=p.surface||'platform',top=f.polygon.map(q=>({x:q.x,y:p.y,z:q.z})),parts=[{geometry:slab(top,.7),color:side}];
    const pillar=new THREE.CylinderGeometry(p.size*.36,p.size*.16,1.4,7);pillar.translate(p.x,p.y-1.45,p.z);parts.push({geometry:pillar,color:side});
    if(p.rails)parts.push(...this.rails(piece,f,null,null,side));
    if(piece.kind==='start')for(let x=-4;x<=4;x++)for(let z=0;z<2;z++){const g=new THREE.BoxGeometry(.72,.02,.72);g.translate(p.x+x*.72,p.y+.024,p.z+z*.72-1.4);parts.push({geometry:g,color:(x+z)%2===0?WHITE:INK});}
    if(kind==='fluff')for(let i=0;i<7;i++){const g=new THREE.SphereGeometry(.4+(i%3)*.08,10,7);g.scale(1,.6,1);const a=i/7*Math.PI*2;g.translate(p.x+Math.cos(a)*(p.size/2-.6),p.y+.1,p.z+Math.sin(a)*(p.size/2-.6));parts.push({geometry:g,color:'#ffffff'});}
    this.tile(group,parts,quad(top),kind,piece.sc+p.size/2);}
  }
  // 机关：移动挡块、弹射柱、风车、路牌。随所在的格子一起塌下去。
  for(const {o,level} of piece.obstaclePoses){const body=new THREE.Mesh(new THREE.BoxGeometry(o.width,o.height,o.depth),this.material('#ff6b6b'));body.castShadow=true;const g=new THREE.Group();body.position.y=o.height/2;g.add(body);this.hull(body,1.07);for(const y of [.35,.8]){const stripe=new THREE.Mesh(new THREE.BoxGeometry(o.width+.02,.14,o.depth+.02),this.material(GOLD));stripe.position.y=y;g.add(stripe);}group.add(g);const pose=obstaclePose(level,o,0),f=piece.floors.find(f=>f.road?.id===o.roadId);this.items.push({group:g,piece:piece.index,s:f.edge(pose.x,pose.z),update:(time)=>{const q=obstaclePose(level,o,time);g.position.set(q.x,q.y,q.z);g.rotation.y=Math.atan2(q.forward.x,q.forward.z);}});}
  for(const u of piece.bumpers){const g=new THREE.Group();g.position.set(u.x,u.y,u.z);const body=new THREE.Mesh(new THREE.CylinderGeometry(u.radius,u.radius*1.08,u.height*.75,24),this.material('#ff5fa2'));body.position.y=u.height*.375;body.castShadow=true;this.hull(body,1.08);g.add(body);const cap=new THREE.Mesh(new THREE.SphereGeometry(u.radius*1.12,24,12,0,Math.PI*2,0,Math.PI/2),this.material('#fffaf0'));cap.position.y=u.height*.75;this.hull(cap,1.07);g.add(cap);group.add(g);const item={group:g,piece:piece.index,s:piece.s1,bumper:u,pulse:0};item.update=(time,dt)=>{item.pulse=Math.max(0,item.pulse-dt*4);const s=1+.22*Math.sin(item.pulse*Math.PI);g.scale.set(s,1/s,s);};this.items.push(item);}
  for(const s of piece.sweepers){const g=new THREE.Group();g.position.set(s.x,s.y,s.z);const post=new THREE.Mesh(new THREE.CylinderGeometry(s.post,s.post*1.15,1.5,16),this.material('#7b6cf6'));post.position.y=.75;this.hull(post,1.1);g.add(post);const arm=new THREE.Group();arm.position.y=.5;g.add(arm);const bar=new THREE.Mesh(new THREE.BoxGeometry(s.length*2,.32,s.width),this.material('#ffffff',{map:this.stripeTexture('#ff6b6b','#ffffff',4,0)}));bar.material.map.repeat.set(s.length*2/1.2,1);bar.castShadow=true;this.hull(bar,1.06);arm.add(bar);for(const e of [-s.length,s.length]){const tip=new THREE.Mesh(new THREE.SphereGeometry(.24,12,8),this.material('#ffd43b'));tip.position.x=e;this.hull(tip,1.12);arm.add(tip);}const ring=new THREE.Mesh(new THREE.RingGeometry(s.length+.15,s.length+.3,64),new THREE.MeshBasicMaterial({color:'#ff6b6b',transparent:true,opacity:.35,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.03;g.add(ring);group.add(g);this.items.push({group:g,piece:piece.index,s:piece.s1,update:time=>{arm.rotation.y=-sweeperPose(s,time).angle;}});}
  for(const sign of piece.signs){const sp=this.label(sign.text,INK,{width:4.2});sp.position.set(sign.x,sign.y+2.2,sign.z);group.add(sp);const f=piece.floors.find(f=>f.road)||piece.floors[0];this.items.push({group:sp,piece:piece.index,s:f.edge(sign.x,sign.z)});}
  return entry;
 }
 hull(mesh,scale){const m=new THREE.Mesh(mesh.geometry,new THREE.MeshBasicMaterial({color:INK,side:THREE.BackSide}));m.scale.setScalar(scale);mesh.add(m);}
 // 护栏：取这块地面的护栏线段，裁到 [a0, a1] 这一格（平台整块时不裁）。
 rails(piece,f,a0,a1,color){
  const out=[];for(const w of piece.walls){if(w.floor!==f)continue;let A=w.a,B=w.b;
   if(a0!==null){const ua=f.along(A.x,A.z),ub=f.along(B.x,B.z),lo=Math.max(a0,Math.min(ua,ub)),hi=Math.min(a1,Math.max(ua,ub));if(hi-lo<.05)continue;const P=u=>{const t=(u-ua)/((ub-ua)||1);return {x:A.x+(B.x-A.x)*t,y:A.y+(B.y-A.y)*t,z:A.z+(B.z-A.z)*t};};A=P(lo);B=P(hi);}
   const lift=(p,h)=>({x:p.x,y:p.y+h,z:p.z}),g1=pipe(lift(A,.5),lift(B,.5),.12),g2=pipe(lift(A,.94),lift(B,.94),.16,10);if(g1)out.push({geometry:g1,color:GOLD});if(g2)out.push({geometry:g2,color});
   const len=Math.hypot(B.x-A.x,B.z-A.z),n=Math.max(1,Math.ceil(len/2.6));for(let i=0;i<=n;i++){const t=i/n,p={x:A.x+(B.x-A.x)*t,y:A.y+(B.y-A.y)*t,z:A.z+(B.z-A.z)*t},g=pipe(p,lift(p,1.02),.1,6);if(g)out.push({geometry:g,color:WHITE});}
  }return out;
 }
 tile(group,parts,topGeometry,kind,s){
  const g=new THREE.Group(),geometry=merge(parts),bodyMat=this.mats.body.clone(),body=new THREE.Mesh(geometry,bodyMat);body.castShadow=true;body.receiveShadow=true;g.add(body);const ink=new THREE.Mesh(geometry,this.mats.ink);g.add(ink);
  const topMat=this.mats.top[kind].clone(),top=new THREE.Mesh(topGeometry,topMat);top.receiveShadow=true;g.add(top);group.add(g);this.tops.push(top);
  const tile={group:g,s,top,bodyMat,topMat,state:'solid',vy:0,spin:new THREE.Vector3((Math.random()-.5)*1.4,(Math.random()-.5)*.6,(Math.random()-.5)*1.4),age:0};this.tiles.push(tile);return tile;
 }
 disposeGroup(group){const g=new Set(),m=new Set();group.traverse(o=>{if(o.geometry)g.add(o.geometry);for(const x of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){if(x!==this.mats?.ink&&x!==this.mats?.boost)m.add(x);}});for(const x of g)x.dispose();for(const x of m){if(x.map&&!Object.values(this.mats?.top||{}).some(t=>t.map===x.map)&&x.map!==this.mats?.boost?.map)x.map.dispose();x.dispose();}group.removeFromParent();}
 event(e,game){
  if(e.kind==='bump'){let best=null,d=Infinity;for(const x of this.items)if(x.bumper){const k=Math.hypot(x.bumper.x-e.x,x.bumper.z-e.z);if(k<d){d=k;best=x;}}if(best)best.pulse=1;}
  if(e.kind==='clash'){const p=game.players.find(p=>p.id===e.ids[0]),ring=new THREE.Mesh(new THREE.TorusGeometry(.6,.08,8,32),new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.95,depthWrite:false}));ring.rotation.x=Math.PI/2;ring.position.set(e.x,(p?.ball.y||6)-.2,e.z);this.scene.add(ring);this.pulses.push({mesh:ring,age:0,strength:e.strength});}
 }
 // 崩塌：前沿前方 warn 米内的格子会抖动发红，被越过就往下掉，3 秒后移除。
 collapse(game,dt){
  const front=game.front,pulse=.5+.5*Math.sin(performance.now()/90);
  this.tiles=this.tiles.filter(t=>{
   if(t.state!=='fall'&&front>=t.s){t.state='fall';t.vy=-.5;this.tops.splice(this.tops.indexOf(t.top),1);}
   if(t.state==='fall'){t.age+=dt;t.vy-=20*dt;t.group.position.y+=t.vy*dt;t.group.rotation.x+=t.spin.x*dt*.3;t.group.rotation.z+=t.spin.z*dt*.3;if(t.age>3){this.disposeGroup(t.group);return false;}return true;}
   const lead=t.s-front;if(lead<ENDLESS.warn&&game.collapsing){const k=1-lead/ENDLESS.warn;t.state='warn';t.bodyMat.emissive.setRGB(.9*k*pulse,.12*k*pulse,.05*k*pulse);t.topMat.emissive.setRGB(.7*k*pulse,.08*k*pulse,0);t.group.position.set((Math.random()-.5)*.08*k,(Math.random()-.5)*.05*k,(Math.random()-.5)*.08*k);}
   else if(t.state==='warn'){t.state='solid';t.bodyMat.emissive.setRGB(0,0,0);t.topMat.emissive.setRGB(0,0,0);t.group.position.set(0,0,0);}
   return true;});
  this.items=this.items.filter(x=>{if(!x.falling&&front>=x.s){x.falling=true;x.vy=-.5;x.age=0;}if(x.falling){x.age+=dt;x.vy-=20*dt;x.group.position.y+=x.vy*dt;if(x.age>3){this.disposeGroup(x.group);return false;}}return true;});
  // 块里的格子都掉完了，就把块的空组删掉。
  for(const [index,entry] of this.pieces)if(!game.track.piece(index)&&entry.group.children.length===0){entry.group.removeFromParent();this.pieces.delete(index);}
 }
 // 分屏布局（CSS 像素，y 自上而下）。3 人时第 4 格是俯瞰。
 static layout(n,W,H){const h2=Math.floor(H/2),w2=Math.floor(W/2);if(n<=1)return [{x:0,y:0,w:W,h:H}];if(n===2)return [{x:0,y:0,w:W,h:h2},{x:0,y:H-h2,w:W,h:h2}];return [{x:0,y:0,w:w2,h:h2},{x:W-w2,y:0,w:w2,h:h2},{x:0,y:H-h2,w:w2,h:h2},{x:W-w2,y:H-h2,w:w2,h:h2}];}
 draw(game,time){
  if(!this.renderer)return;if(this.game!==game||this.version!==game.version){this.game=game;this.reset(game);}this.sync(game);
  const canvas=this.canvas,W=Math.max(1,canvas.clientWidth),H=Math.max(1,canvas.clientHeight);if(W!==this.width||H!==this.height){this.width=W;this.height=H;this.renderer.setSize(W,H,false);}
  const dt=this.lastTime===null?1/60:clamp(time-this.lastTime,0,.1);this.lastTime=time;
  this.theme(game);for(const x of this.items)x.update?.(game.clock,dt);this.collapse(game,dt);
  for(const p of game.players){const v=this.balls.get(p.id);if(!v)continue;const b=p.ball,gone=p.phase==='out';v.group.visible=!gone;v.ball.position.set(b.x,b.y,b.z);v.ball.rotation.set(b.rollX,0,b.rollZ);v.shadow.visible=p.phase==='playing';v.shadow.position.set(b.x,b.y-PHYSICS.radius+.03,b.z);v.tag.position.set(b.x,b.y+1.25,b.z);v.cone.position.set(b.x,b.y+.85,b.z);v.cone.rotation.y+=dt*2;}
  for(let i=this.pulses.length-1;i>=0;i--){const p=this.pulses[i];p.age+=dt;const k=p.age/.45;p.mesh.scale.setScalar(1+k*(2+3*p.strength));p.mesh.material.opacity=Math.max(0,.95*(1-k));if(k>=1){this.disposeGroup(p.mesh);this.pulses.splice(i,1);}}
  this.mats.boost.map.offset.y=(this.mats.boost.map.offset.y-dt*1.6)%1;
  // 镜头：活着的人跟自己；出局后跟领先的人观战。
  const alive=game.players.filter(p=>p.phase==='playing'),leader=[...alive].sort((a,b)=>b.s-a.s)[0]||[...game.players].sort((a,b)=>b.best-a.best)[0];
  const rects=VersusScene.layout(game.players.length,W,H),focus=new THREE.Vector3();const pack=alive.length?alive:game.players;for(const p of pack)focus.add(new THREE.Vector3(p.ball.x,p.ball.y,p.ball.z));focus.divideScalar(Math.max(1,pack.length));
  for(const d of this.decor){if(d.position.z-focus.z>60)d.position.z-=260;else if(d.position.z-focus.z<-200)d.position.z+=260;if(d.position.x-focus.x>110)d.position.x-=220;else if(d.position.x-focus.x<-110)d.position.x+=220;}
  this.sun.position.set(focus.x-22,focus.y+34,focus.z+16);this.sun.target.position.copy(focus);this.renderer.shadowMap.needsUpdate=true;
  this.renderer.setScissorTest(true);
  game.players.forEach((p,i)=>{const view=this.views[i];if(!view)return;const watch=p.phase==='out'&&leader?leader:p;if(view.watch!==watch.id){view.watch=watch.id;view.snap=watch===p?view.snap:false;}this.renderView(view,watch,rects[i],H,dt,p.phase==='falling');});
  if(game.players.length===3)this.renderOverview(game,focus,leader,rects[3],H,dt);
  this.renderer.setScissorTest(false);
 }
 renderView(view,p,rect,H,dt,falling){
  const b=p.ball,anchor=new THREE.Vector3(b.x,falling?Math.max(b.y,(view.groundY??b.y)-1.2):b.y,b.z);if(!falling)view.groundY=b.y;
  if(view.snap){view.follow.copy(anchor);view.heading=p.cameraHeading;view.snap=false;}else{view.follow.lerp(anchor,1-Math.exp(-5*dt));view.heading+=Math.atan2(Math.sin(p.cameraHeading-view.heading),Math.cos(p.cameraHeading-view.heading))*(1-Math.exp(-6*dt));}
  const cam=view.camera,aspect=rect.w/rect.h;cam.fov=aspect>2.4?36:aspect>1.9?44:52;cam.aspect=aspect;cam.updateProjectionMatrix();
  const pose=cameraPose(view.follow,view.heading),eye=new THREE.Vector3(pose.eye.x,pose.eye.y,pose.eye.z),look=new THREE.Vector3(pose.look.x,pose.look.y,pose.look.z),from=view.follow.clone();from.y+=1;
  const dir=eye.clone().sub(from),dist=dir.length();this.raycaster.set(from,dir.normalize());this.raycaster.far=dist;const hits=this.raycaster.intersectObjects(this.tops,false);if(hits.length)eye.copy(from).addScaledVector(dir,Math.max(2,hits[0].distance-.5));
  cam.position.copy(eye);cam.lookAt(look);this.renderer.setViewport(rect.x,H-rect.y-rect.h,rect.w,rect.h);this.renderer.setScissor(rect.x,H-rect.y-rect.h,rect.w,rect.h);this.renderer.render(this.scene,cam);
 }
 renderOverview(game,focus,leader,rect,H,dt){
  const heading=leader?.cameraHeading||0,dx=Math.sin(heading),dz=-Math.cos(heading);this.overviewFollow.lerp(focus,1-Math.exp(-3*dt));if(this.overviewFollow.lengthSq()===0)this.overviewFollow.copy(focus);const f=this.overviewFollow,cam=this.overview;
  cam.aspect=rect.w/rect.h;cam.updateProjectionMatrix();cam.position.set(f.x-dx*16,f.y+26,f.z-dz*16);cam.lookAt(f.x+dx*10,f.y,f.z+dz*10);this.renderer.setViewport(rect.x,H-rect.y-rect.h,rect.w,rect.h);this.renderer.setScissor(rect.x,H-rect.y-rect.h,rect.w,rect.h);this.renderer.render(this.scene,cam);
 }
 dispose(){for(const entry of this.pieces.values())this.disposeGroup(entry.group);this.pieces.clear();this.renderer?.dispose();this.renderer=null;}
}
