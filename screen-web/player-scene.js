import * as THREE from 'three';
import {GolfScene} from './scene.js';
import {Golfer} from './golfer.js';
import {MotionView} from '../shared/motion-view.js';
import {clamp,heightAt,distance,clubFor} from '../shared/courses.js';

const ease=t=>t*t*(3-2*t);
export class PlayerScene extends GolfScene {
 constructor(container,onPhase=()=>{}){super(container);this.onPhase=onPhase;this.phase='address';this.motionView=new MotionView();this.lastFrame=performance.now();this.style='sage';}
 resize(){if(this.preview)return super.resize();const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.near=.08;this.camera.fov=w<650?59:49;this.camera.clearViewOffset();this.camera.updateProjectionMatrix();this.setCamera();}
 load(hole){
  this.otherPlayers=null;this.playersKey='';this.golfer=null;this.actorRig=null;this.swing=null;this.walk=null;this.phase='address';this.aim=0;this.motionView?.reset();super.load(hole);if(this.preview){this.renderer.toneMappingExposure=1.12;Object.assign(this.sun.shadow.camera,{left:-180,right:180,top:240,bottom:-240});this.sun.shadow.camera.updateProjectionMatrix();return;}
  this.group.scale.x=-1;this.renderer.toneMappingExposure=.98;
  this.actorRig=new THREE.Group();this.group.add(this.actorRig);this.golfer=new Golfer(this.style);this.golfer.root.position.x=-1.42;this.actorRig.add(this.golfer.root);
  this.group.traverse(o=>{if(o.geometry?.type==='SphereGeometry'&&o.geometry.parameters.radius===.6){o.scale.set(.2,.12,.2);o.position.y=heightAt(hole,o.position.x,o.position.z)+.07;}});
  const flagGround=heightAt(hole,hole.pin.x,hole.pin.z);this.flag.scale.setScalar(.42);this.flag.position.set(hole.pin.x+.966,flagGround+2.793,hole.pin.z);this.group.traverse(o=>{if(o.geometry?.type==='CylinderGeometry'&&o.geometry.parameters.radiusTop===.105&&o.geometry.parameters.height===8){o.scale.y=.42;o.position.y=flagGround+1.68;}});
  this.trace=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:'#fffde6',transparent:true,opacity:.85}));this.group.add(this.trace);
  this.forecast=new THREE.Mesh(new THREE.RingGeometry(.9,1.2,48),new THREE.MeshBasicMaterial({color:'#f8ca71',side:THREE.DoubleSide}));this.forecast.rotation.x=-Math.PI/2;this.forecast.visible=false;this.group.add(this.forecast);
  Object.assign(this.sun.shadow.camera,{left:-18,right:18,top:18,bottom:-18});this.sun.shadow.camera.updateProjectionMatrix();this.sun.shadow.normalBias=.04;
  this.setBall(hole.tee,0);this.resize();this.setCamera(true);
 }
 setPlayers(players=[],activeId){
  if(this.preview||!this.group)return;const key=JSON.stringify([players.map(p=>[p.id,p.style,p.ball,p.holeDone]),activeId]);if(key===this.playersKey)return;this.playersKey=key;
  if(this.otherPlayers){this.group.remove(this.otherPlayers);this.otherPlayers.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();});}
  this.otherPlayers=new THREE.Group();this.group.add(this.otherPlayers);
  players.forEach((p,i)=>{if(p.id===activeId||p.holeDone)return;const g=new Golfer(p.style),a=this.heading(p.ball),near=distance(p.ball,this.ballPosition||this.hole.tee)<4,offset=near?3+i*1.6:1.8,x=p.ball.x-offset*Math.cos(a),z=p.ball.z+offset*Math.sin(a);const rig=new THREE.Group();rig.position.set(x,heightAt(this.hole,x,z),z);rig.rotation.y=a;rig.add(g.root);this.otherPlayers.add(rig);g.update(.016,0);const ball=new THREE.Mesh(new THREE.SphereGeometry(.13,12,8),new THREE.MeshStandardMaterial({color:g.shirt.color}));ball.position.set(p.ball.x,heightAt(this.hole,p.ball.x,p.ball.z)+.13,p.ball.z);ball.visible=distance(p.ball,this.ballPosition||this.hole.tee)>.5;this.otherPlayers.add(ball);});
 }
 setPhase(phase){if(this.phase!==phase){this.phase=phase;this.onPhase?.(phase);}}
 setStyle(id){this.style=id;this.golfer?.setStyle(id);}
 heading(p=this.ballPosition){return Math.atan2(this.hole.pin.x-p.x,this.hole.pin.z-p.z)+(this.aim||0)*Math.PI/180;}
 positionAvatar(p){
  if(!this.actorRig)return;const a=this.heading(p),x=p.x-1.42*Math.cos(a),z=p.z+1.42*Math.sin(a);
  this.actorRig.position.set(p.x,heightAt(this.hole,x,z),p.z);this.actorRig.rotation.y=a;
  this.sun.target.position.set(-p.x,heightAt(this.hole,p.x,p.z),p.z);this.sun.position.set(-p.x-20,heightAt(this.hole,p.x,p.z)+45,p.z-20);
 }
 setBall(p,aim=0){
  if(this.preview)return super.setBall(p,aim);if(!this.hole||this.flight)return;
  this.aim=aim;super.setBall(p,aim);this.ball.scale.setScalar(.19);this.ball.position.y=heightAt(this.hole,p.x,p.z)+.1;this.ballRing.scale.setScalar(.25);
  this.positionAvatar(p);this.golfer?.setClub(clubFor(this.hole,p).id);this.setCamera();
 }
 finish(p,aim=0){if(this.preview)return super.finish(p);if(['swing','flight','landing','moving'].includes(this.phase))return;this.setBall(p,aim);}
 resetAddress(){if(['swing','flight','moving'].includes(this.phase))return;this.view='follow';this.orbit=0;this.motionView.reset();this.golfer.goal=0;this.setCamera();}
 sample(t){
  this.motionView.sample(t,performance.now());this.lastMotion=performance.now();if(!this.golfer||!['address','rehearsal'].includes(this.phase)||this.swing)return;
  if(t.stage!=='ready'){this.golfer.goal=0;return;}
  this.golfer.goal=t.state==='BACK'?Math.max(.3,Math.min(1,Math.abs(t[t.axis])/(t.peakMax||600)*1.3)):t.state==='DOWN'?.08:t.state==='COOLDOWN'?-.8:0;
 }
 rehearse(shot,source='screen'){
  if(this.preview)return;this.view='follow';this.swing={start:performance.now(),phone:source==='phone',dry:true};this.setPhase('rehearsal');const p=shot.path.at(-1);this.forecast.position.set(p.x,heightAt(this.hole,p.x,p.z)+.07,p.z);this.forecast.visible=true;
 }
 playShot(shot,source='screen'){
  if(this.preview)return;this.walk=null;this.flight=null;this.lastResult=shot;this.forecast.visible=false;this.view='follow';this.orbit=0;this.slopeVisible=false;this.slopeGrid.visible=false;
  this.trace.geometry.dispose();this.trace.geometry=new THREE.BufferGeometry().setFromPoints(shot.path.map(p=>new THREE.Vector3(p.x,p.y+.02,p.z)));this.trace.geometry.setDrawRange(0,0);
  this.swing={start:performance.now(),phone:source==='phone',dry:false,shot,impact:source==='phone'?100:540};this.setPhase('swing');this.aimLine.visible=false;
 }
 setCamera(immediate=false){
  if(this.preview)return super.setCamera(immediate);if(!this.hole)return;const p=this.walk?this.walk.current:this.ballPosition||this.hole.tee,h=this.hole;
  if(this.view==='overview'){const d=Math.max(100,h.length*.8);this.targetPosition.set(-d*.42,d*.8,h.length*.4-d*.7);this.targetLook.set(0,3,h.length*.48);}
  else if(this.slopeVisible){const q=h.pin,y=heightAt(h,q.x,q.z);this.targetPosition.set(-q.x+14,y+28,q.z-20);this.targetLook.set(-q.x,y,q.z);}
  else if(this.phase==='flight'&&this.flight){const b=this.ball.position,s=this.flight.shot,end=s.path.at(-1),a=Math.atan2(end.x-s.from.x,end.z-s.from.z);this.targetPosition.set(-b.x+Math.sin(a)*19+Math.cos(a)*7,b.y+6,b.z-Math.cos(a)*19+Math.sin(a)*7);this.targetLook.set(-b.x-Math.sin(a)*6,b.y+1,b.z+Math.cos(a)*6);}
  else if(this.phase==='landing'&&this.lastResult){const b=this.lastResult.path.at(-1),y=heightAt(h,b.x,b.z);this.targetPosition.set(-b.x+9,y+9,b.z-14);this.targetLook.set(-b.x,y,b.z);}
  else {const a=this.heading(p),angle=a+clamp(this.orbit,-.7,.7)+(this.motionView?.yaw||0),ground=heightAt(h,p.x,p.z),back=6.8,pitch=this.motionView?.pitch||0;
   const cx=p.x+.3*Math.cos(angle)-back*Math.sin(angle),cz=p.z-.3*Math.sin(angle)-back*Math.cos(angle);
   this.targetPosition.set(-cx,Math.max(ground+2.3+pitch*6,heightAt(h,cx,cz)+1.1),cz);this.targetLook.set(-p.x-Math.sin(a)*6,ground+.4+pitch*2,p.z+Math.cos(a)*6);
  }
  if(immediate){this.camera.position.copy(this.targetPosition);this.currentLook.copy(this.targetLook);this.camera.lookAt(this.currentLook);}
 }
 frame(){
  if(this.preview)return super.frame();if(!this.hole||!this.golfer||!this.container.clientWidth||!this.container.clientHeight)return;
  const now=performance.now(),dt=Math.min((now-this.lastFrame)/1000||.016,.05),time=(now-this.startTime)/1000;this.lastFrame=now;this.motionView.update(dt,now);
  if(this.swing){const s=this.swing,elapsed=now-s.start,u=clamp((elapsed+(s.phone?440:0))/1150,0,1);this.golfer.goal=u<.34?ease(u/.34):u<.48?1-ease((u-.34)/.14):-ease(Math.min(1,(u-.48)/.34));
   if(!s.dry&&!this.flight&&elapsed>=s.impact){this.flight={shot:s.shot,start:s.start+s.impact};this.ballRing.visible=false;this.setPhase('flight');}
   if(u>=1){this.swing=null;if(s.dry){this.golfer.goal=0;this.setPhase('address');}}
  }
  if(this.flight){const {shot,start}=this.flight,t=clamp((now-start)/(shot.duration*1000),0,1),path=shot.path,physical=t*path.at(-1).t;let lo=0,hi=path.length-1;while(lo<hi-1){const m=(lo+hi)>>1;if(path[m].t<physical)lo=m;else hi=m;}const a=path[lo],b=path[hi],f=clamp((physical-a.t)/(b.t-a.t||1),0,1);this.ball.position.set(a.x+(b.x-a.x)*f,a.y+(b.y-a.y)*f,a.z+(b.z-a.z)*f);this.ball.scale.setScalar(.65);this.trace.geometry.setDrawRange(0,Math.max(2,Math.floor(t*path.length)));
   if(t>=1){this.flight=null;this.ball.scale.setScalar(.25);this.landedAt=now;this.setPhase('landing');}
  }
  if(this.phase==='landing'&&now-this.landedAt>900){const to=this.lastResult.to;this.walk={start:now,from:{...this.ballPosition},to,current:{...this.ballPosition},duration:distance(this.ballPosition,to)<.1?1:950};this.motionView.reset();this.golfer.goal=0;this.aim=0;this.setPhase('moving');}
  if(this.walk){const w=this.walk,t=clamp((now-w.start)/w.duration,0,1),f=ease(t);w.current={x:w.from.x+(w.to.x-w.from.x)*f,z:w.from.z+(w.to.z-w.from.z)*f};this.positionAvatar(w.current);this.golfer.root.position.y=Math.abs(Math.sin(t*Math.PI*6))*.06;
   if(t>=1){const p=w.to;this.walk=null;this.golfer.root.position.y=0;this.setBall(p);this.setPhase('address');}
  }
  if(!this.swing&&this.phase==='address'&&now-(this.lastMotion||0)>1800)this.golfer.goal*=.96;
  this.golfer.update(dt,time);this.golfer.head.rotation.y+=this.motionView.yaw*.5;this.setCamera();const f=1-Math.exp(-dt*(this.phase==='flight'?2.4:4));this.camera.position.lerp(this.targetPosition,f);this.currentLook.lerp(this.targetLook,f);this.camera.lookAt(this.currentLook);
  if(this.flag){const p=this.flag.geometry.attributes.position;for(let i=0;i<p.count;i++)p.setZ(i,Math.sin(time*2+p.getX(i))*.15);p.needsUpdate=true;}this.renderer.render(this.scene,this.camera);
 }
}
