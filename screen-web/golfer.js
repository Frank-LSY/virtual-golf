import * as THREE from 'three';

export const GOLFER_STYLES={sage:{name:'青苔',shirt:'#457968',cap:'#f3e7cf',trousers:'#e2dcc9'},coast:{name:'海盐',shirt:'#527bba',cap:'#eff5f3',trousers:'#273d52'},sunset:{name:'落日',shirt:'#cc775b',cap:'#f7e4bc',trousers:'#45534e'},plum:{name:'暮光',shirt:'#886799',cap:'#f2e7ed',trousers:'#3a354d'}};
const v=(x,y,z)=>new THREE.Vector3(x,y,z);

// 原创程序化人物：关节随姿势变化，双手始终握在同一球杆上。
export class Golfer {
 constructor(style='sage'){
  this.root=new THREE.Group();this.root.rotation.y=Math.PI/2;this.pose=0;this.goal=0;this.putting=false;
  const material=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.78,...extra});
  this.skin=material('#dda57f');this.shirt=material('#457968');this.cap=material('#f3e7cf');this.pants=material('#e2dcc9');this.white=material('#f9f5e8');this.dark=material('#293e37');
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
  for(const sign of [-1,1]){
   const collar=this.mesh(new THREE.SphereGeometry(.13,12,8),this.white,this.body);collar.position.set(sign*.095,1.66,.13);collar.scale.set(1,.27,.65);collar.rotation.z=sign*.35;
   const foot=this.mesh(new THREE.CapsuleGeometry(.105,.19,5,12),this.white,this.root);foot.rotation.x=Math.PI/2;foot.scale.x=1.1;foot.position.set(sign*.24,.09,.15);
   const sole=this.mesh(new THREE.BoxGeometry(.23,.05,.4),this.dark,this.root);sole.position.set(sign*.24,.035,.15);
   this.limb(v(sign*.18,.94,0),v(sign*.26,.52,.12),.13,this.pants,this.root);
   this.limb(v(sign*.26,.52,.12),v(sign*.24,.16,.06),.105,this.pants,this.root);
  }
  this.arms=[-1,1].map(sign=>({sign,upper:this.limb(v(0,0,0),v(0,1,0),.108,this.shirt,this.root),lower:this.limb(v(0,0,0),v(0,1,0),.068,this.skin,this.root),elbow:this.mesh(new THREE.SphereGeometry(.078,12,8),this.skin,this.root),hand:this.mesh(new THREE.SphereGeometry(.077,14,10),sign===-1?this.white:this.skin,this.root)}));
  this.club=new THREE.Group();this.root.add(this.club);
  this.shaft=this.mesh(new THREE.CylinderGeometry(.014,.02,1.14,10),material('#b9c9cb',{metalness:.75,roughness:.25}),this.club);this.shaft.position.y=-.57;
  const grip=this.mesh(new THREE.CylinderGeometry(.026,.022,.26,10),this.dark,this.club);grip.position.y=-.12;
  this.clubHead=this.mesh(new THREE.BoxGeometry(.18,.095,.08),material('#738d96',{metalness:.8,roughness:.24}),this.club);this.clubHead.position.set(.05,-1.14,0);this.clubHead.rotation.z=.13;
  this.shadow=this.mesh(new THREE.CircleGeometry(.65,40),new THREE.MeshBasicMaterial({color:'#193f2f',transparent:true,opacity:.11,depthWrite:false}),this.root);this.shadow.rotation.x=-Math.PI/2;this.shadow.position.set(0,.014,.05);this.shadow.scale.z=.65;
  this.setStyle(style);this.update(1/60,0);
 }
 mesh(geometry,material,parent){const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
 limb(a,b,r,material,parent){const mesh=this.mesh(new THREE.CylinderGeometry(r*.88,r,1,12),material,parent);this.placeLimb(mesh,a,b);return mesh;}
 placeLimb(mesh,a,b){mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.scale.y=a.distanceTo(b);mesh.quaternion.setFromUnitVectors(v(0,1,0),b.clone().sub(a).normalize());}
 setStyle(id){const s=GOLFER_STYLES[id]||GOLFER_STYLES.sage;this.shirt.color.set(s.shirt);this.cap.color.set(s.cap);this.pants.color.set(s.trousers);}
 setClub(id){this.putting=id==='putter';this.clubHead.scale.set(id==='driver'?1.45:1,id==='driver'?1.45:1,id==='driver'?2.5:id==='putter'?1.7:1);}
 update(dt,time){
  this.pose+=(this.goal-this.pose)*(1-Math.exp(-dt*18));const p=this.pose,back=Math.max(0,p),follow=Math.max(0,-p),amount=this.putting?.24:1;
  const rest=v(0,1.03,.65),top=v(.55,1.99,.22),finish=v(-.62,1.95,.17);const hand=rest.clone().lerp(p>=0?top:finish,Math.min(1,Math.abs(p))*amount);
  const head= v(0,.105,1.42).lerp(p>=0?v(.27,2.73,-.72):v(-.28,2.62,-.84),Math.min(1,Math.abs(p))*amount);
  const twist=(back*.65-follow*.98)*amount;this.body.rotation.y=twist;this.body.position.y=Math.sin(time*1.6)*.006*(1-Math.abs(p));this.head.rotation.x=.16-back*.13-follow*.16;this.head.rotation.y=follow*-.4;
  this.club.position.copy(hand);this.club.quaternion.setFromUnitVectors(v(0,-1,0),head.sub(hand).normalize());
  for(const arm of this.arms){const shoulder=v(arm.sign*.29,1.57,.12).applyAxisAngle(v(0,1,0),twist);const end=hand.clone().add(v(arm.sign*.033,-arm.sign*.035,0));const elbow=shoulder.clone().lerp(end,.52);elbow.z-=.09;elbow.x+=arm.sign*(.1+back*.06);this.placeLimb(arm.upper,shoulder,elbow);this.placeLimb(arm.lower,elbow,end);arm.elbow.position.copy(elbow);arm.hand.position.copy(end);}
 }
}
