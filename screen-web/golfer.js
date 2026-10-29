import {createClub,disposeClub} from './club-model.js';
import * as THREE from 'three';

export const GOLFER_STYLES={sage:{name:'青苔',shirt:'#457968',cap:'#f3e7cf',trousers:'#e2dcc9'},coast:{name:'海盐',shirt:'#527bba',cap:'#eff5f3',trousers:'#273d52'},sunset:{name:'落日',shirt:'#cc775b',cap:'#f7e4bc',trousers:'#45534e'},plum:{name:'暮光',shirt:'#886799',cap:'#f2e7ed',trousers:'#3a354d'}};
const v=(x,y,z)=>new THREE.Vector3(x,y,z);
// 挥杆关键姿势（u：0 站位，正值上杆，负值送杆）：双手位置与杆身方向。u = 力度档位 / 5（膝 .2、腰 .4、胸 .6、肩 .8、完整上杆 1）。
// 坐标在人物局部空间：+x 为上杆一侧，-x 为目标方向，+z 朝向球。
const SWING_KEYS=[
 [-1.05,[-.4,1.93,.08],[.27,.53,-.8]],
 [-1,[-.42,1.9,.1],[.27,.53,-.8]],
 [-.8,[-.55,1.72,.2],[.15,.95,-.4]],
 [-.6,[-.56,1.45,.34],[-.45,.85,-.15]],
 [-.35,[-.42,1.13,.5],[-1,.12,.15]],
 [-.15,[-.13,1.02,.64],[-.3,-.9,.7]],
 [0,[0,1.03,.65],[0,-.925,.77]],
 [.2,[.2,1.03,.6],[.7,-.6,.35]],
 [.4,[.4,1.13,.48],[1,.02,.12]],
 [.6,[.5,1.38,.36],[.55,.82,-.05]],
 [.8,[.53,1.66,.28],[.05,.95,-.3]],
 [1,[.48,1.92,.2],[-.82,.3,-.48]],
 [1.12,[.44,1.96,.18],[-.9,.15,-.42]]
].map(([u,h,d])=>({u,h:v(...h),d:v(...d).normalize()}));
// 关键姿势之间：双手走 Catmull-Rom 曲线，杆身方向做归一化插值。
export function swingPose(u){
 const k=SWING_KEYS,x=Math.max(k[0].u,Math.min(k.at(-1).u,u));let i=0;while(i<k.length-2&&x>k[i+1].u)i++;
 const a=k[i],b=k[i+1],f=(x-a.u)/((b.u-a.u)||1),p0=k[Math.max(0,i-1)].h,p3=k[Math.min(k.length-1,i+2)].h,f2=f*f,f3=f2*f;
 const hand=new THREE.Vector3();for(const c of ['x','y','z'])hand[c]=.5*((2*a.h[c])+(-p0[c]+b.h[c])*f+(2*p0[c]-5*a.h[c]+4*b.h[c]-p3[c])*f2+(-p0[c]+3*a.h[c]-3*b.h[c]+p3[c])*f3);
 const dir=a.d.clone().lerp(b.d,f);if(dir.lengthSq()<1e-6)dir.copy(f<.5?a.d:b.d);dir.normalize();
 return {hand,dir};
}

// 原创程序化人物：关节随姿势变化，双手始终握在同一球杆上。
export class Golfer {
 constructor(style='sage'){
  this.root=new THREE.Group();this.root.rotation.y=Math.PI/2;this.pose=0;this.goal=0;this.putting=false;this.tracking=false;
  const material=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.78,...extra});
  this.skin=material('#dda57f',{roughness:.62});this.shirt=material('#457968',{roughness:.93});this.cap=material('#f3e7cf');this.pants=material('#e2dcc9');this.white=material('#f9f5e8');this.dark=material('#293e37');
  this.body=new THREE.Group();this.root.add(this.body);
  this.torso=this.mesh(new THREE.CapsuleGeometry(.29,.43,6,12),this.shirt,this.body);this.torso.scale.set(1,.94,.66);this.torso.position.set(0,1.32,.08);
  const hem=this.mesh(new THREE.CylinderGeometry(.29,.3,.1,16),this.shirt,this.body);hem.position.set(0,.99,.06);hem.scale.z=.72;
  const belt=this.mesh(new THREE.CylinderGeometry(.3,.29,.075,16),this.dark,this.root);belt.position.set(0,.94,0);belt.scale.z=.7;
  this.head=new THREE.Group();this.head.position.set(0,1.93,.18);this.body.add(this.head);
  const neck=this.mesh(new THREE.CylinderGeometry(.095,.11,.2,12),this.skin,this.head);neck.position.y=-.33;
  const face=this.mesh(new THREE.SphereGeometry(.275,24,18),this.skin,this.head);face.scale.set(.89,1.04,.91);
  const hair=this.mesh(new THREE.SphereGeometry(.278,20,14,0,Math.PI*2,0,Math.PI*.57),material('#443b31'),this.head);hair.position.y=.05;
  const crown=this.mesh(new THREE.SphereGeometry(.294,24,14,0,Math.PI*2,0,Math.PI*.5),this.cap,this.head);crown.position.y=.12;crown.scale.y=.7;
  const band=this.mesh(new THREE.CylinderGeometry(.293,.293,.065,24),this.cap,this.head);band.position.y=.125;
  const brim=this.mesh(new THREE.SphereGeometry(1,18,10),this.cap,this.head);brim.position.set(0,.12,.25);brim.scale.set(.29,.025,.23);
  const capBadge=this.mesh(new THREE.CircleGeometry(.045,16),this.shirt,this.head);capBadge.position.set(0,.22,.282);capBadge.rotation.x=-.2;
  for(const x of [-.095,.095]){const eye=this.mesh(new THREE.SphereGeometry(.021,12,8),this.dark,this.head);eye.position.set(x,.005,.238);const ear=this.mesh(new THREE.SphereGeometry(.055,12,8),this.skin,this.head);ear.position.set(Math.sign(x)*.255,-.015,0);}
  const nose=this.mesh(new THREE.SphereGeometry(.038,12,8),this.skin,this.head);nose.position.set(0,-.045,.254);
  const smile=this.mesh(new THREE.TorusGeometry(.044,.008,6,18,Math.PI),material('#9c6753'),this.head);smile.position.set(0,-.105,.224);smile.rotation.z=Math.PI;
  this.legs=[];
  for(const sign of [-1,1]){
   const collar=this.mesh(new THREE.SphereGeometry(.13,12,8),this.white,this.body);collar.position.set(sign*.095,1.66,.13);collar.scale.set(1,.27,.65);collar.rotation.z=sign*.35;
   const foot=this.mesh(new THREE.CapsuleGeometry(.105,.19,5,12),this.white,this.root);foot.rotation.x=Math.PI/2;foot.scale.x=1.1;foot.position.set(sign*.24,.09,.15);
   const sole=this.mesh(new THREE.BoxGeometry(.23,.05,.4),this.dark,this.root);sole.position.set(sign*.24,.035,.15);
   const upper=this.limb(v(sign*.18,.94,0),v(sign*.26,.52,.12),.13,this.pants,this.root),lower=this.limb(v(sign*.26,.52,.12),v(sign*.24,.16,.06),.105,this.pants,this.root);this.legs.push({sign,upper,lower,foot,sole});
   for(let i=0;i<3;i++){const lace=this.mesh(new THREE.BoxGeometry(.13,.006,.012),this.dark,foot);lace.position.set(0,-.025+i*.045,.1);}
  }
  this.arms=[-1,1].map(sign=>({sign,upper:this.limb(v(0,0,0),v(0,1,0),.108,this.shirt,this.root),lower:this.limb(v(0,0,0),v(0,1,0),.068,this.skin,this.root),elbow:this.mesh(new THREE.SphereGeometry(.078,12,8),this.skin,this.root),hand:this.mesh(new THREE.SphereGeometry(.077,14,10),sign===-1?this.white:this.skin,this.root)}));
  this.club=createClub('iron');this.clubId='iron';this.root.add(this.club);
  const placket=this.mesh(new THREE.BoxGeometry(.035,.2,.015),this.white,this.body);placket.position.set(0,1.5,.278);for(let i=0;i<3;i++){const button=this.mesh(new THREE.SphereGeometry(.009,8,6),this.dark,this.body);button.position.set(0,1.56-i*.055,.294);}
  const buckle=this.mesh(new THREE.BoxGeometry(.075,.045,.016),material('#b6b8a0',{metalness:.5,roughness:.4}),this.root);buckle.position.set(0,.95,.218);
  for(const sign of [-1,1]){const brow=this.mesh(new THREE.CapsuleGeometry(.009,.048,4,8),material('#594734'),this.head);brow.rotation.z=Math.PI/2+sign*.1;brow.position.set(sign*.095,.063,.239);const glint=this.mesh(new THREE.SphereGeometry(.006,8,6),this.white,this.head);glint.position.set(sign*.09,.012,.256);}
  this.shadow=this.mesh(new THREE.CircleGeometry(.65,40),new THREE.MeshBasicMaterial({color:'#193f2f',transparent:true,opacity:.11,depthWrite:false}),this.root);this.shadow.rotation.x=-Math.PI/2;this.shadow.position.set(0,.014,.05);this.shadow.scale.z=.65;
  this.setStyle(style);this.update(1/60,0);
 }
 mesh(geometry,material,parent){const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
 limb(a,b,r,material,parent){const mesh=this.mesh(new THREE.CylinderGeometry(r*.88,r,1,12),material,parent);this.placeLimb(mesh,a,b);return mesh;}
 placeLimb(mesh,a,b){mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.scale.y=a.distanceTo(b);mesh.quaternion.setFromUnitVectors(v(0,1,0),b.clone().sub(a).normalize());}
 setStyle(id){const s=GOLFER_STYLES[id]||GOLFER_STYLES.sage;this.shirt.color.set(s.shirt);this.cap.color.set(s.cap);this.pants.color.set(s.trousers);}
 setClub(id){this.putting=id==='putter';if(this.clubId===id)return;this.root.remove(this.club);disposeClub(this.club);this.club=createClub(id);this.clubId=id;this.root.add(this.club);}
 setLocomotion(mode='rest',phase=0){this.locomotion=mode;this.stride=phase;this.club.visible=mode!=='ride';}
 updateTravel(){
  const riding=this.locomotion==='ride',phase=this.stride||0;this.pose=0;this.goal=0;this.body.rotation.set(0,riding?0:Math.sin(phase)*.04,0);this.body.position.y=riding?0:Math.cos(phase*2)*.018;this.head.rotation.set(.03,0,0);
  for(const leg of this.legs){const cycle=phase+(leg.sign===1?Math.PI:0),swing=Math.sin(cycle),lift=riding?0:Math.max(0,Math.cos(cycle))*.1,hip=v(leg.sign*.18,.94,0),knee=v(leg.sign*.2,riding?.94:.52,riding?.4:swing*.15+.06),ankle=v(leg.sign*.2,riding?.75:.16+lift,riding?.65:swing*.31+.06);this.placeLimb(leg.upper,hip,knee);this.placeLimb(leg.lower,knee,ankle);leg.foot.position.set(ankle.x,ankle.y-.07,ankle.z+.09);leg.sole.position.set(ankle.x,ankle.y-.125,ankle.z+.09);leg.foot.rotation.z=0;}
  for(const arm of this.arms){const shoulder=v(arm.sign*.29,1.57,.12),hand=riding?v(arm.sign*.21,1.2,.8):v(arm.sign*.32,.98,.04-Math.sin(phase+(arm.sign===1?Math.PI:0))*.18),elbow=shoulder.clone().lerp(hand,.5);elbow.x+=arm.sign*.08;elbow.z-=.08;this.placeLimb(arm.upper,shoulder,elbow);this.placeLimb(arm.lower,elbow,hand);arm.elbow.position.copy(elbow);arm.hand.position.copy(hand);if(arm.sign===1&&!riding){this.club.position.copy(hand);this.club.quaternion.setFromUnitVectors(v(0,-1,0),v(.08,-.75,-.65).normalize());}}
 }
 update(dt,time){
  if(this.locomotion&&this.locomotion!=='rest'){this.updateTravel();return;}this.club.visible=true;
  // 跟随手机时响应更快（时间常数约 35 毫秒），自动动画时更柔和。
  this.pose+=(this.goal-this.pose)*(1-Math.exp(-dt*(this.tracking?28:18)));const p=this.pose,back=Math.max(0,Math.min(1.12,p)),follow=Math.max(0,Math.min(1.05,-p)),amount=this.putting?.24:1;
  let hand,head;
  if(this.putting){const rest=v(0,1.03,.65),top=v(.55,1.99,.22),finish=v(-.62,1.95,.17);hand=rest.clone().lerp(p>=0?top:finish,Math.min(1,Math.abs(p))*amount);head=v(0,.105,1.42).lerp(p>=0?v(.27,2.73,-.72):v(-.28,2.62,-.84),Math.min(1,Math.abs(p))*amount);}
  else{const pose=swingPose(p);hand=pose.hand;head=hand.clone().addScaledVector(pose.dir,1.2);}
  const twist=this.putting?(back*.65-follow*.98)*amount:Math.min(1,back)*.78-Math.min(1,follow)*1.05;this.body.rotation.y=twist;this.body.position.y=Math.sin(time*1.6)*.006*(1-Math.abs(p));this.head.rotation.x=.16-back*.13-follow*.16;this.head.rotation.y=follow*-.4;
  for(const leg of this.legs){const lift=leg.sign===1?follow*.065:back*.018,shift=(back*.035-follow*.05)*amount;leg.foot.position.set(leg.sign*.24,.09+lift,.15);leg.sole.position.set(leg.sign*.24,.035+lift,.15);leg.foot.rotation.z=-lift*1.8;this.placeLimb(leg.upper,v(leg.sign*.18+shift,.94,0),v(leg.sign*.26+shift*.6,.52,.12+back*.025));this.placeLimb(leg.lower,v(leg.sign*.26+shift*.6,.52,.12+back*.025),v(leg.sign*.24,.16+lift,.06));}
  this.club.position.copy(hand);this.club.quaternion.setFromUnitVectors(v(0,-1,0),head.sub(hand).normalize());
  for(const arm of this.arms){const shoulder=v(arm.sign*.29,1.57,.12).applyAxisAngle(v(0,1,0),twist);const end=hand.clone().add(v(arm.sign*.033,-arm.sign*.035,0));const elbow=shoulder.clone().lerp(end,.52);elbow.z-=.09;elbow.x+=arm.sign*(.1+back*.06);this.placeLimb(arm.upper,shoulder,elbow);this.placeLimb(arm.lower,elbow,end);arm.elbow.position.copy(elbow);arm.hand.position.copy(end);}
 }
}
