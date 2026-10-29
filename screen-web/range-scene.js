import {athleticsRange} from './athletics-range.js';
import {ShotTrail} from './shot-trail.js';
import {BALL_RADIUS,sampleShot} from '../shared/ball.js';
import {rollBall} from './visuals.js';
import * as THREE from 'three';
import {GolfScene} from './scene.js';
import {Golfer} from './golfer.js';
import {SwingMotion,SwingReplay,planSwing,swingGoal,FOLLOW_PHASES} from './swing-motion.js';
import {MotionView} from '../shared/motion-view.js';
import {makeRange} from '../shared/training.js';
import {clamp} from '../shared/courses.js';

const smooth=t=>t*t*(3-2*t);
export class RangeScene extends GolfScene {
 constructor(container,onPhase=()=>{}){super(container);this.onPhase=onPhase;this.preview=false;this.phase='address';this.style='sage';this.camera.near=.08;this.camera.fov=49;this.renderer.toneMappingExposure=.95;this.sun.intensity=2.3;this.lastFrame=performance.now();this.motionView=new MotionView();this.motion=new SwingMotion();this.replay=null;}
 resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.fov=w<650?58:49;this.camera.clearViewOffset();this.camera.updateProjectionMatrix();this.setCamera();}
 loadRange(settings){
  this.settings=settings;this.swing=null;this.landedAt=0;this.setPhase('address');super.load(makeRange(settings));this.group.scale.x=-1;this.ocean.visible=false;
  this.scene.background=new THREE.Color('#b7dce9');this.scene.fog=new THREE.Fog('#c6e3e7',220,760);
  this.group.traverse(obj=>{if(obj.geometry?.attributes.color){const c=obj.geometry.attributes.color,p=obj.geometry.attributes.position;for(let i=0;i<c.count;i++){const z=p.getZ(i),x=p.getX(i);const col=new THREE.Color(Math.abs(x)<65?(Math.floor(z/16)%2?'#7cbb86':'#72b37c'):'#5e9b6f');c.setXYZ(i,col.r,col.g,col.b);}c.needsUpdate=true;}});
  this.group.add(athleticsRange());
  this.group.traverse(obj=>{if(obj.geometry?.type==='SphereGeometry'&&obj.geometry.parameters.radius===.6){obj.scale.set(.2,.12,.2);obj.position.y=3.07;obj.material.color.set('#e5bd75');}});
  this.actorRig=new THREE.Group();this.group.add(this.actorRig);this.golfer=new Golfer(this.style);this.golfer.root.position.set(-1.42,3,0);this.actorRig.add(this.golfer.root);this.golfer.setClub(settings.clubId);this.actorRig.rotation.y=(settings.aim||0)*Math.PI/180;
  this.sun.shadow.camera.left=-18;this.sun.shadow.camera.right=18;this.sun.shadow.camera.top=18;this.sun.shadow.camera.bottom=-18;this.sun.shadow.camera.updateProjectionMatrix();this.sun.position.set(-20,45,-20);this.sun.target.position.set(0,3,3);
  this.flag.scale.setScalar(1);
  const distances=settings.clubId==='putter'?[5,10,15,20]:[50,100,150,200,250,300];
  for(const z of distances){const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-35,3.025,z),new THREE.Vector3(35,3.025,z)]),new THREE.LineBasicMaterial({color:'#eaf6cf',transparent:true,opacity:.5}));this.group.add(line);this.label(`${z} 米`,settings.clubId==='putter'?-3:-12,3.5,z,settings.clubId==='putter'?1.4:4);}
  for(const radius of [3,7,12]){const ring=this.ring(radius,radius+.16,radius===3?'#f2c577':'#f3f7d0');ring.position.set(0,3.06,settings.target);this.group.add(ring);}
  this.forecast=this.ring(1.2,1.48,'#fff9c2');this.forecast.visible=false;this.group.add(this.forecast);
  this.trace=new ShotTrail();this.group.add(this.trace);
  const mat=new THREE.Mesh(new THREE.BoxGeometry(3.8,.04,3.2),new THREE.MeshStandardMaterial({color:'#56966a',roughness:1}));mat.position.set(-.55,3.013,0);mat.receiveShadow=true;this.group.add(mat);
  this.resize();this.resetAddress(true);
 }
 ring(inner,outer,color){const o=new THREE.Mesh(new THREE.RingGeometry(inner,outer,64),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.8}));o.rotation.x=-Math.PI/2;return o;}
 label(text,x,y,z,width){const canvas=document.createElement('canvas');canvas.width=256;canvas.height=96;const ctx=canvas.getContext('2d');ctx.fillStyle='#315f4adb';ctx.beginPath();ctx.roundRect(0,0,256,96,22);ctx.fill();ctx.fillStyle='#f9f9df';ctx.font='500 40px sans-serif';ctx.textAlign='center';ctx.fillText(text,128,62);const label=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),depthWrite:false}));label.position.set(x,y,z);label.scale.set(width,width*.375,1);this.group.add(label);}
 setPhase(phase){if(this.phase!==phase){this.phase=phase;this.onPhase?.(phase);}}
 setStyle(id){this.style=id;this.golfer?.setStyle(id);}
 setAim(aim){if(!this.settings)return;this.settings={...this.settings,aim};if(this.actorRig)this.actorRig.rotation.y=aim*Math.PI/180;this.setBall(this.hole.tee,aim);}
 setBall(p,aim=this.settings?.aim||0){if(!this.hole||this.flight)return;super.setBall(p,aim);this.ball.position.set(p.x,3+BALL_RADIUS,p.z);this.ball.scale.setScalar(1);this.ballRing.scale.setScalar(.25);this.ballRing.position.y=3.03;}
 resetAddress(immediate=false){this.flight=null;this.swing=null;this.landedAt=0;if(this.trace)this.trace.visible=false;this.view='follow';this.orbit=0;this.motionView.reset();if(this.golfer)this.golfer.goal=0;this.setPhase('address');if(this.hole)this.setBall(this.hole.tee);this.setCamera(immediate);}
 overview(){this.view=this.view==='overview'?'follow':'overview';this.orbit=0;this.viewState.reset();this.setCamera();}
 setCamera(immediate=false){
  this.updateViewUI();if(!this.settings)return;const near=this.view==='overview'?1:.08;if(this.camera.near!==near){this.camera.near=near;this.camera.updateProjectionMatrix();}if(this.scene.fog){this.scene.fog.near=this.view==='overview'?550:220;this.scene.fog.far=this.view==='overview'?1100:760;}const d=Math.max(50,this.settings.target),a=(this.settings.aim||0)*Math.PI/180;
  if(this.view==='overview'){const close=this.viewState.focus==='cup';this.overviewCamera({x:0,y:3,z:close?this.settings.target:160},close?14:430);}
  else if(this.phase==='flight'&&this.flight){const p=this.ball.position;this.targetPosition.set(-p.x+8,p.y+7,p.z-20);this.targetLook.set(-p.x,p.y+1,p.z+7);}
  else if(this.phase==='landing'&&this.lastResult){const p=this.lastResult.to;this.targetPosition.set(-p.x+12,14,p.z-19);this.targetLook.set(-p.x,3,p.z+1);}
  else {const orbit=clamp(this.orbit,-.65,.65)+(this.motionView?.yaw||0),x=.3*Math.cos(orbit)-(-6.8)*Math.sin(orbit),z=.3*Math.sin(orbit)+(-6.8)*Math.cos(orbit);this.targetPosition.set(x*Math.cos(a)-z*Math.sin(a),(this.settings.clubId==='putter'?4.7:5.3)+(this.motionView?.pitch||0)*6,x*Math.sin(a)+z*Math.cos(a));this.targetLook.set(-Math.sin(a)*6,3.4,Math.cos(a)*6);}
  if(immediate){this.camera.position.copy(this.targetPosition);this.currentLook.copy(this.targetLook);this.camera.lookAt(this.currentLook);}
 }
 // 手机实时姿势进入时间线，由 frame() 插值驱动小人。
 sample(t){
  this.motionView.sample(t,performance.now());this.lastMotion=performance.now();if(this.motion.push(t))return;
  if(this.golfer&&t.stage!=='ready'&&['address','rehearsal'].includes(this.phase)&&!this.swing)this.golfer.goal=0;
 }
 replaySwing(speed=.35){const last=this.motion.lastSwing();if(!last||!this.golfer||!['address','landing'].includes(this.phase)||this.swing)return false;this.replay=new SwingReplay(last.points,{speed});return true;}
 hasReplay(){return !!this.motion.lastSwing();}
 rehearse(report,kin=null){this.resetAddress();this.setPhase('rehearsal');const now=performance.now();this.swing={start:now,phone:report.source==='phone',dry:true,plan:planSwing(this.motion,{source:report.source,kin,power:report.power,now})};this.forecast.position.set(report.to.x,3.08,report.to.z);this.forecast.visible=true;}
 playShot(shot,source='screen',kin=null){
  this.resetAddress();this.forecast.visible=false;this.trace.setShot(shot);this.effects.reset(shot);
  const now=performance.now(),plan=planSwing(this.motion,{source,kin,power:shot.power,now});this.lastResult=shot;this.swing={start:now,phone:source==='phone',dry:false,shot,plan,impact:plan.impact};this.setPhase('swing');this.aimLine.visible=false;
 }
 frame(){
  if(!this.hole||!this.container.clientWidth||!this.container.clientHeight)return;const now=performance.now(),dt=Math.min((now-this.lastFrame)/1000||.016,.05);this.lastFrame=now;this.motionView.update(dt,now);const time=(now-this.startTime)/1000;
  if(this.golfer)this.golfer.tracking=false;
  if(this.swing&&this.golfer){const s=this.swing,elapsed=now-s.start;this.golfer.goal=swingGoal(s.plan,elapsed,this.motion,now);this.golfer.tracking=s.plan.mode!=='canned';
   if(!s.dry&&!this.flight&&elapsed>=s.impact){this.flight={shot:s.shot,start:s.start+s.impact};this.ballRing.visible=false;this.setPhase('flight');}
   if(elapsed>=s.plan.end){this.swing=null;if(s.dry){if(!this.motion.live(now))this.golfer.goal=0;this.setPhase('address');}}
  }else if(this.replay&&this.golfer){this.golfer.goal=this.replay.value(now);this.golfer.tracking=true;if(this.replay.done(now)){this.replay=null;this.golfer.goal=0;}}
  else if(this.golfer&&this.motion.live(now)&&FOLLOW_PHASES.has(this.phase)){this.golfer.goal=this.motion.value(now);this.golfer.tracking=true;}
  if(this.flight){const {shot,start}=this.flight,previous=this.ball.position.clone(),p=sampleShot(shot,(now-start)/1000);this.ball.position.set(p.x,p.y,p.z);this.ball.scale.setScalar(1);rollBall(this.ball,previous,p);this.trace.reveal(p.index);this.effects.sample(p.time,now);if(p.done){this.flight=null;this.ball.position.set(shot.to.x,3+BALL_RADIUS,shot.to.z);this.ballRing.position.set(shot.to.x,3.04,shot.to.z);this.ballRing.scale.setScalar(.35);this.ballRing.visible=true;this.setPhase('landing');this.landedAt=now;}}
  if(this.phase==='landing'&&now-this.landedAt>2200)this.resetAddress();
  if(!this.swing&&this.phase==='address'&&now-(this.lastMotion||0)>1800)this.golfer.goal*=.96;
  this.updateEnvironment(now);this.golfer?.update(dt,time);if(this.golfer)this.golfer.head.rotation.y+=this.motionView.yaw*.5;this.setCamera();const easing=1-Math.exp(-dt*(this.phase==='flight'?2.4:4));this.camera.position.lerp(this.targetPosition,easing);this.currentLook.lerp(this.targetLook,easing);this.camera.lookAt(this.currentLook);
  if(this.flag){const p=this.flag.geometry.attributes.position;for(let i=0;i<p.count;i++)p.setZ(i,Math.sin(time*2+p.getX(i))*.1);p.needsUpdate=true;}
  this.renderer.render(this.scene,this.camera);
 }
 clear(){const maps=new Set();this.group.traverse(o=>{if(o.material?.map&&!o.material.map.userData.sharedClubTexture&&!o.material.map.userData.sharedEnvironmentTexture&&!o.material.map.userData.sharedBallTexture)maps.add(o.material.map);});for(const texture of maps)texture.dispose();super.clear();}
}
