import {CourseJourney} from './course-journey.js';
import {movementPlan,parkingAt,sampleRoute,LANDING_PAUSE} from '../shared/travel.js';
import {GolfCart} from './golf-cart.js';
import {ShotTrail} from './shot-trail.js';
import {ShotGuide} from './shot-guide.js';
import {BALL_RADIUS,sampleShot} from '../shared/ball.js';
import {splashCamera,WATER_LEVEL} from '../shared/water.js';
import {ballRestHeight,lieCamera} from '../shared/terrain.js';
import {rollBall} from './visuals.js';
import * as THREE from 'three';
import {GolfScene} from './scene.js';
import {Golfer} from './golfer.js';
import {SwingMotion,SwingReplay,planSwing,swingGoal,FOLLOW_PHASES} from './swing-motion.js';
import {MotionView} from '../shared/motion-view.js';
import {clamp,heightAt,distance,clubFor,routeAt} from '../shared/courses.js';

const ease=t=>t*t*(3-2*t);
const INTRO_MS=5200;
export class PlayerScene extends GolfScene {
 constructor(container,onPhase=()=>{}){super(container);this.onPhase=onPhase;this.phase='address';this.motionView=new MotionView();this.motion=new SwingMotion();this.replay=null;this.lastFrame=performance.now();this.style='sage';}
 resize(){if(this.preview)return super.resize();const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.near=.08;this.camera.fov=w<650?59:49;this.camera.clearViewOffset();this.camera.updateProjectionMatrix();this.setCamera();}
 load(hole){
  this.endJourney();
  this.cart=null;this.cartAnchor=null;this.movement=null;this.otherPlayers=null;this.playersKey='';this.golfer=null;this.actorRig=null;this.swing=null;this.walk=null;this.phase='address';this.aim=0;this.holed=false;this.selectedClubId=null;this.motionView?.reset();super.load(hole);if(this.preview){this.renderer.toneMappingExposure=1.12;Object.assign(this.sun.shadow.camera,{left:-180,right:180,top:240,bottom:-240});this.sun.shadow.camera.updateProjectionMatrix();return;}
  this.group.scale.x=-1;this.renderer.toneMappingExposure=.98;
  this.actorRig=new THREE.Group();this.group.add(this.actorRig);this.golfer=new Golfer(this.style);this.golfer.root.position.x=-1.42;this.actorRig.add(this.golfer.root);
  this.group.traverse(o=>{if(o.geometry?.type==='SphereGeometry'&&o.geometry.parameters.radius===.6){o.scale.set(.2,.12,.2);o.position.y=heightAt(hole,o.position.x,o.position.z)+.07;}});
  this.trace=new ShotTrail();this.group.add(this.trace);this.cart=new GolfCart();this.group.add(this.cart.root);
  this.forecast=new THREE.Mesh(new THREE.RingGeometry(1.1,1.55,48),new THREE.MeshBasicMaterial({color:'#ff7a59',transparent:true,opacity:.92,side:THREE.DoubleSide,depthWrite:false,toneMapped:false}));this.forecast.renderOrder=6;this.guide=new ShotGuide();this.group.add(this.guide);if(this.intro){this.intro=null;this.onIntro?.(false);}this.flightCam=null;this.forecast.rotation.x=-Math.PI/2;this.forecast.visible=false;this.group.add(this.forecast);
  Object.assign(this.sun.shadow.camera,{left:-18,right:18,top:18,bottom:-18});this.sun.shadow.camera.updateProjectionMatrix();this.sun.shadow.normalBias=.04;
  this.setBall(hole.tee,0);this.resize();this.setCamera(true);
 }
 setPlayers(players=[],activeId){
  if(this.preview||!this.group)return;const key=JSON.stringify([players.map(p=>[p.id,p.style,p.ball,p.holeDone]),activeId]);if(key===this.playersKey)return;this.playersKey=key;
  if(this.otherPlayers){this.group.remove(this.otherPlayers);this.otherPlayers.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();});}
  this.otherPlayers=new THREE.Group();this.group.add(this.otherPlayers);
  players.forEach((p,i)=>{if(p.id===activeId||p.holeDone)return;const g=new Golfer(p.style),a=this.heading(p.ball),near=distance(p.ball,this.ballPosition||this.hole.tee)<4,offset=near?3+i*1.6:1.8,x=p.ball.x-offset*Math.cos(a),z=p.ball.z+offset*Math.sin(a);const rig=new THREE.Group();rig.position.set(x,heightAt(this.hole,x,z),z);rig.rotation.y=a;rig.add(g.root);this.otherPlayers.add(rig);g.update(.016,0);const ball=new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS,20,14),new THREE.MeshStandardMaterial({color:g.shirt.color}));ball.position.set(p.ball.x,ballRestHeight(this.hole,p.ball),p.ball.z);ball.visible=distance(p.ball,this.ballPosition||this.hole.tee)>.5;this.otherPlayers.add(ball);});
 }
 setPhase(phase){if(this.phase!==phase){this.phase=phase;if(phase==='address'||phase==='swing')this.flightCam=null;this.onPhase?.(phase);}}
 setClub(id){this.selectedClubId=id;this.golfer?.setClub(id);}
 setHoled(value){this.holed=!!value;if(this.phase==='address'&&this.holed){this.ball.visible=false;this.ballRing.visible=false;this.aimLine.visible=false;}}
 setStyle(id){this.style=id;this.golfer?.setStyle(id);}
 setGuide(forecast,power){this.guideForecast=forecast;this.guidePower=power;this.refreshGuide();}
 guideActive(){return !this.preview&&!!this.guide&&!!this.guideForecast&&this.phase==='address'&&this.view==='follow'&&!this.slopeVisible&&!this.holed&&!this.intro&&!this.movement&&!this.guideHidden;}
 refreshGuide(){
  if(!this.guide)return;if(!this.guideActive()){this.guide.visible=false;this.guide.info=null;return;}
  const f=this.guideForecast,ball=this.ballPosition,delta=((this.aim||0)-(f.aim||0))*Math.PI/180,c=Math.cos(delta),s=Math.sin(delta),turn=q=>{const dx=q.x-ball.x,dz=q.z-ball.z;return {x:ball.x+dx*c+dz*s,z:ball.z-dx*s+dz*c};};
  const forecast=delta?{...f,marks:f.marks.map(m=>({...m,landing:turn(m.landing),end:turn(m.end)}))}:f;
  this.guide.update(this.hole,ball,forecast,this.guidePower??.65,f.clubId==='putter',this.heading(ball));
 }
 // 每洞开场的短飞越：先俯瞰果岭，再沿球道退回发球台，最后与站位镜头衔接。
 startIntro(){if(this.preview||!this.hole||this.phase!=='address')return false;this.intro={start:performance.now(),duration:INTRO_MS};this.refreshGuide();this.onIntro?.(true);return true;}
 skipIntro(){if(!this.intro)return;this.intro=null;this.refreshGuide();this.onIntro?.(false);}
 introPose(u,addressPos,addressLook){
  // 从果岭上空沿球道倒退回发球台，镜头始终望向旗杆，让整洞布局逐步展开；最后 20% 与站位镜头平滑衔接。
  const h=this.hole,pin=h.pin,pinY=heightAt(h,pin.x,pin.z),k=ease(clamp(u/.86,0,1)),r=.8*(1-k),p=routeAt(h,r),q=routeAt(h,Math.min(1,r+.05)),dx=q.x-p.x,dz=q.z-p.z,l=Math.hypot(dx,dz)||1,side=Math.sin(k*Math.PI)*7,ground=Math.max(heightAt(h,p.x,p.z),pinY);
  const pos=new THREE.Vector3(-(p.x-dx/l*9+dz/l*side),ground+26-15*k,p.z-dz/l*9-dx/l*side),look=new THREE.Vector3(-pin.x,pinY+1,pin.z),blend=ease(clamp((u-.8)/.2,0,1));
  return {pos:pos.lerp(addressPos,blend),look:look.lerp(addressLook,blend)};
 }
 heading(p=this.ballPosition){return Math.atan2(this.hole.pin.x-p.x,this.hole.pin.z-p.z)+(this.aim||0)*Math.PI/180;}
 positionAvatar(p){
  if(!this.actorRig)return;const a=this.heading(p),x=p.x-1.42*Math.cos(a),z=p.z+1.42*Math.sin(a);
  this.actorRig.position.set(p.x,heightAt(this.hole,x,z),p.z);this.actorRig.rotation.y=a;
  this.sun.target.position.set(-p.x,heightAt(this.hole,p.x,p.z),p.z);this.sun.position.set(-p.x-20,heightAt(this.hole,p.x,p.z)+45,p.z-20);
 }
 setBall(p,aim=0){
  if(this.preview)return super.setBall(p,aim);if(!this.hole||this.flight)return;
  this.aim=aim;super.setBall(p,aim);this.ball.scale.setScalar(1);this.ball.position.y=ballRestHeight(this.hole,p);this.ball.visible=!this.holed;this.ballRing.visible=!this.holed;this.ballRing.scale.setScalar(.25);
  this.positionAvatar(p);const key=`${p.x},${p.z}`;if(this.cart&&!this.movement&&this.cartAnchor!==key){const park=parkingAt(this.hole,p);this.cart.root.position.set(park.x,heightAt(this.hole,park.x,park.z),park.z);this.cart.root.rotation.y=this.heading(p);this.cartAnchor=key;}
  this.golfer?.setClub(this.selectedClubId||clubFor(this.hole,p).id);this.setCamera();this.refreshGuide();
 }
 finish(p,aim=0){if(this.preview)return super.finish(p);if(['swing','flight','settling','splash','cup','holed','landing','moving','boarding','driving','alighting'].includes(this.phase))return;this.setBall(p,aim);}
 resetAddress(){if(['swing','flight','settling','splash','cup','holed','moving','boarding','driving','alighting'].includes(this.phase))return;this.view='follow';this.orbit=0;this.motionView.reset();this.golfer.goal=0;this.setCamera();}
 // 手机实时姿势进入时间线，由 frame() 插值驱动小人；旧版手机（没有 u）只在未启用体感时让小人回到站位。
 sample(t){
  this.motionView.sample(t,performance.now());this.lastMotion=performance.now();if(this.motion.push(t))return;
  if(this.golfer&&t.stage!=='ready'&&['address','rehearsal'].includes(this.phase)&&!this.swing)this.golfer.goal=0;
 }
 // 慢放最近一杆（真实轨迹）；speed 为播放速度。
 replaySwing(speed=.35){const last=this.motion.lastSwing();if(!last||!this.golfer||!['address','landing','settling'].includes(this.phase)||this.swing)return false;this.replay=new SwingReplay(last.points,{speed});return true;}
 rehearse(shot,source='screen'){
  if(this.preview)return;this.view='follow';this.replay=null;const now=performance.now();this.swing={start:now,phone:source==='phone',dry:true,plan:planSwing(this.motion,{source,kin:shot.kin,power:shot.power,now})};this.setPhase('rehearsal');const p=shot.path.at(-1);this.forecast.position.set(p.x,heightAt(this.hole,p.x,p.z)+.07,p.z);this.forecast.visible=true;
 }
 playShot(shot,source='screen'){
  if(this.preview)return;this.walk=null;this.flight=null;this.lastResult=shot;this.holed=false;this.ball.visible=true;this.golfer.setClub(shot.clubId||this.selectedClubId||'iron');this.forecast.visible=false;this.view='follow';this.orbit=0;this.slopeVisible=false;this.slopeGrid.visible=false;
  this.trace.setShot(shot);this.effects.reset(shot);this.terrainDetails.launch();this.impactUntil=0;this.rimming=false;this.lastFlightSample=null;this.rollSpeed=0;
  const now=performance.now(),plan=planSwing(this.motion,{source,kin:shot.kin,power:shot.power,now});this.replay=null;this.swing={start:now,phone:source==='phone',dry:false,shot,plan,impact:plan.impact};this.intro=null;this.onIntro?.(false);this.guide.visible=false;this.flightCam=null;this.flightMeta=this.planFlight(shot);this.setPhase('swing');this.aimLine.visible=false;
 }
 setCamera(immediate=false){
  this.updateViewUI();  if(this.preview)return super.setCamera(immediate);if(!this.hole)return;const p=this.movement?this.movement.current:this.ballPosition||this.hole.tee,h=this.hole;
  if(this.view==='overview'){const close=this.viewState?.focus==='cup';this.overviewCamera(close?{x:-h.pin.x,y:heightAt(h,h.pin.x,h.pin.z),z:h.pin.z}:{x:0,y:3,z:h.length*.48},close?6:Math.max(110,h.length*1.12));}
  else if(this.slopeVisible){const q=h.pin,y=heightAt(h,q.x,q.z);this.overviewCamera({x:-q.x,y,z:q.z},36);}
  else if(this.phase==='splash'||(this.phase==='landing'&&Number.isFinite(this.lastResult?.waterTime))){const q=this.lastResult.impacts.find(e=>e.type==='water').position,camera=splashCamera(h,q);this.targetPosition.set(camera.x,camera.y,camera.z);this.targetLook.set(-q.x,q.y,q.z);}
  else if(this.phase==='settling'||(this.phase==='landing'&&Number.isFinite(this.lastResult?.settleTime))){const q=this.lastResult.to,camera=lieCamera(h,q,this.lastResult.from);this.targetPosition.set(camera.x,camera.y,camera.z);this.targetLook.set(-q.x,heightAt(h,q.x,q.z)+.08,q.z);}
  else if((this.phase==='cup'||this.phase==='holed')||(this.phase==='flight'&&distance(this.ball.position,h.pin)<4&&this.ball.position.y-heightAt(h,h.pin.x,h.pin.z)<2)){const q=h.pin,y=heightAt(h,q.x,q.z);this.targetPosition.set(-q.x+1.15,y+.85,q.z-1.75);this.targetLook.set(-q.x,y-.05,q.z);}
  else if(this.phase==='flight'&&this.flight&&this.flightMeta)this.flightCamera();
  else if(this.movement){const p=this.movement.current,a=this.movement.heading||0,y=heightAt(h,p.x,p.z),back=this.movement.plan.mode==='cart'?8:6;this.targetPosition.set(-p.x+Math.sin(a)*back+Math.cos(a)*4,y+4.1,p.z-Math.cos(a)*back+Math.sin(a)*4);this.targetLook.set(-p.x,y+1,p.z);}
  else if(this.phase==='landing'&&this.lastResult){const b=this.lastResult.path.at(-1),y=heightAt(h,b.x,b.z);if(!this.flightCam){this.targetPosition.set(-b.x+9,y+9,b.z-14);}this.targetLook.set(-b.x,y+.1,b.z);}
  else {const a=this.heading(p),angle=a+clamp(this.orbit,-.7,.7)+(this.motionView?.yaw||0),ground=heightAt(h,p.x,p.z),back=6.8,pitch=this.motionView?.pitch||0;
   const cx=p.x+.3*Math.cos(angle)-back*Math.sin(angle),cz=p.z-.3*Math.sin(angle)-back*Math.cos(angle);
   this.targetPosition.set(-cx,Math.max(ground+2.3+pitch*6,heightAt(h,cx,cz)+1.1),cz);this.targetLook.set(-p.x-Math.sin(a)*6,ground+.4+pitch*2,p.z+Math.cos(a)*6);
  }
  if(immediate){this.camera.position.copy(this.targetPosition);this.currentLook.copy(this.targetLook);this.camera.lookAt(this.currentLook);}
 }
 planFlight(shot){
  const h=this.hole,path=shot.path,from=shot.from;let apex=0;for(let i=1;i<path.length;i++)if(path[i].y>path[apex].y)apex=i;
  let land=path.length-1;for(let i=apex;i<path.length;i++)if(path[i].y-heightAt(h,path[i].x,path[i].z)<.3){land=i;break;}
  const L=shot.landing||path[land],dx=L.x-from.x,dz=L.z-from.z,l=Math.hypot(dx,dz),end=path.at(-1),ex=end.x-from.x,ez=end.z-from.z,el=Math.hypot(ex,ez)||1,dir=l>1?{x:dx/l,z:dz/l}:{x:ex/el,z:ez/el},pin=h.pin,side=((pin.x-from.x)*dir.z-(pin.z-from.z)*dir.x)>0?-1:1;
  // 落点机位左右两侧各评估一次，选树木遮挡更少的一侧。
  const blocked=sd=>{const c={x:L.x-dir.x*15+dir.z*sd*6,z:L.z-dir.z*15-dir.x*sd*6},dx=L.x-c.x,dz=L.z-c.z,len2=dx*dx+dz*dz;let score=0;for(const t of h.trees){const r=3.2*t.scale+1,u=Math.max(0,Math.min(1,((t.x-c.x)*dx+(t.z-c.z)*dz)/len2)),d=Math.hypot(t.x-c.x-dx*u,t.z-c.z-dz*u);if(d<r)score+=1+(1-u);if(Math.hypot(t.x-c.x,t.z-c.z)<r+2)score+=3;}return score;};
  const camSide=blocked(side)<=blocked(-side)?side:-side;
  return {apexT:path[apex].t,landT:path[land].t,landing:{x:L.x,z:L.z},carry:l,dir,side:camSide,putt:shot.clubId==='putter'||l<1,y0:heightAt(h,from.x,from.z)};
 }
 // 广播式追球：起飞阶段从球手身后仰视跟随，下落前切到落点侧方机位迎接来球；推杆与短切低机位紧跟。
 flightCamera(){
  const h=this.hole,m=this.flightMeta,b=this.ball.position,t=this.lastFlightSample?.time??0,d=m.dir,sx=d.z*m.side,sz=-d.x*m.side,from=this.flight.shot.from;let pos,look={x:b.x,y:b.y,z:b.z},mode;
  if(m.putt){pos={x:b.x-d.x*3.4+sx*.5,y:heightAt(h,b.x,b.z)+1.45,z:b.z-d.z*3.4+sz*.5};look={x:b.x+d.x*1.6,y:b.y,z:b.z+d.z*1.6};mode='putt';}
  else if(m.carry<32){pos={x:b.x-d.x*7.5+sx*2.2,y:Math.max(heightAt(h,b.x,b.z),b.y-1)+3.2,z:b.z-d.z*7.5+sz*2.2};mode='chase';}
  else if(t<m.apexT*.92){const rise=Math.max(0,b.y-m.y0);pos={x:from.x-d.x*8.5+sx*1.4,y:m.y0+2.6+rise*.3,z:from.z-d.z*8.5+sz*1.4};mode='launch';}
  else{const L=m.landing,roll=Math.hypot(b.x-L.x,b.z-L.z),base={x:L.x-d.x*15+sx*6,z:L.z-d.z*15+sz*6};if(roll>14&&t>m.landT){base.x=b.x-d.x*13+sx*5;base.z=b.z-d.z*13+sz*5;}pos={x:base.x,y:Math.max(heightAt(h,L.x,L.z),heightAt(h,base.x,base.z))+6.2,z:base.z};mode='landing';}
  const cut=mode==='landing'&&this.flightCam!=='landing';this.flightCam=mode;
  this.targetPosition.set(-pos.x,pos.y,pos.z);this.targetLook.set(-look.x,look.y,look.z);if(cut){this.camera.position.copy(this.targetPosition);this.currentLook.set(-b.x,b.y,b.z);}
 }
 projectLocal(p,lift=0){const v=new THREE.Vector3(-p.x,(p.y??heightAt(this.hole,p.x,p.z))+lift,p.z).project(this.camera),w=this.container.clientWidth,h=this.container.clientHeight;return {x:(v.x+1)/2*w,y:(1-v.y)/2*h,visible:v.z<1&&v.z>-1&&v.x>-1.1&&v.x<1.1&&v.y>-1.1&&v.y<1.1};}
 standingAt(p,aim=0){const a=Math.atan2(this.hole.pin.x-p.x,this.hole.pin.z-p.z)+aim*Math.PI/180,x=p.x-1.42*Math.cos(a),z=p.z+1.42*Math.sin(a);return {x,y:heightAt(this.hole,x,z),z};}
 beginMovement(start){
  const shot=this.lastResult,plan=shot.movement||movementPlan(this.hole,shot.from,shot.to,shot.holed);if(plan.mode==='none'){this.trace.visible=false;this.golfer.goal=0;this.setBall(shot.to,0);this.setPhase('address');return;}
  const from=this.standingAt(this.ballPosition,this.aim),to=this.standingAt(shot.to,0);this.movement={plan,start,from,to,current:{...from},heading:plan.mode==='cart'?sampleRoute(plan.route,0).heading:Math.atan2(to.x-from.x,to.z-from.z)};this.motionView.reset();this.golfer.root.position.set(0,0,0);this.golfer.goal=0;this.golfer.setLocomotion('walk');this.setPhase(plan.mode==='cart'?'boarding':'moving');this.setCamera(true);
 }
 updateMovement(now,dt){
  const m=this.movement,plan=m.plan,elapsed=Math.max(0,now-m.start),u=clamp(elapsed/plan.duration,0,1),mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});let p,heading,mode='walk',stride=elapsed/1000*9;
  if(plan.mode==='walk'){p=mix(m.from,m.to,ease(u));p.y=heightAt(this.hole,p.x,p.z);heading=Math.atan2(m.to.x-m.from.x,m.to.z-m.from.z);}
  else {
   const drive=clamp((elapsed-plan.boarding)/plan.driving,0,1),location=sampleRoute(plan.route,ease(drive)),cart=this.cart.root,turn=Math.atan2(Math.sin(location.heading-cart.rotation.y),Math.cos(location.heading-cart.rotation.y));cart.rotation.y+=turn*Math.min(1,dt*10);cart.position.set(location.x,heightAt(this.hole,location.x,location.z),location.z);this.cart.roll(location.distance);
   const a=cart.rotation.y,forward={x:Math.sin(a)*.7,z:Math.cos(a)*.7},side={x:Math.cos(a)*.65,z:-Math.sin(a)*.65},ground=(x,z)=>heightAt(this.hole,location.x+x,location.z+z);cart.rotation.x=-Math.atan((ground(forward.x,forward.z)-ground(-forward.x,-forward.z))/1.4);cart.rotation.z=Math.atan((ground(side.x,side.z)-ground(-side.x,-side.z))/1.3);
   const seat={x:location.x-.35*Math.cos(a)-.25*Math.sin(a),y:cart.position.y-.17,z:location.z+.35*Math.sin(a)-.25*Math.cos(a)};
   if(elapsed<plan.boarding){const f=elapsed/plan.boarding;p=mix(m.from,seat,ease(f));heading=Math.atan2(seat.x-m.from.x,seat.z-m.from.z);if(f>.78){mode='ride';heading=a;}this.setPhase('boarding');}
   else if(elapsed<plan.boarding+plan.driving){p=seat;heading=a;mode='ride';this.setPhase('driving');}
   else {const f=clamp((elapsed-plan.boarding-plan.driving)/plan.alighting,0,1);p=mix(seat,m.to,ease(f));heading=Math.atan2(m.to.x-seat.x,m.to.z-seat.z);if(f<.18){mode='ride';heading=a;}this.setPhase('alighting');}
  }
  m.current=p;m.heading=heading;this.actorRig.position.set(p.x,p.y,p.z);this.actorRig.rotation.y=heading-Math.PI/2;this.golfer.setLocomotion(mode,stride);this.trace.fade(Math.max(0,1-u*1.4));
  this.sun.target.position.set(-p.x,p.y,p.z);this.sun.position.set(-p.x-20,p.y+45,p.z-20);
  if(u>=1){this.flightCam=null;this.movement=null;this.golfer.root.position.set(-1.42,0,0);this.golfer.setLocomotion('rest');this.cartAnchor=plan.mode==='cart'?`${this.lastResult.to.x},${this.lastResult.to.z}`:this.cartAnchor;this.setBall(this.lastResult.to,0);this.setPhase('address');}
 }
 beginJourney(state){if(this.journey?.transfer.id===state.transfer.id){this.journey.transfer=state.transfer;return;}this.endJourney();this.swing=null;this.flight=null;this.movement=null;this.journey=new CourseJourney(this,state);this.setPhase('transferring');}
 endJourney(){if(this.journey){this.journey.dispose();this.journey=null;this.setPhase('address');}}
 frame(){
  if(this.journey){const now=performance.now(),dt=Math.min(.05,(now-this.lastFrame)/1000||.016);this.lastFrame=now;this.journeyLabel=this.journey.update(Date.now(),dt);return;}
  if(this.preview)return super.frame();if(!this.hole||!this.golfer||!this.container.clientWidth||!this.container.clientHeight)return;
  const now=performance.now(),dt=Math.min((now-this.lastFrame)/1000||.016,.05),time=(now-this.startTime)/1000;this.lastFrame=now;this.motionView.update(dt,now);
  // 小人：击球计划（实时跟随 / 真实轨迹回放 / 固定动画）→ 慢放 → 实时跟随手机 → 静置。
  this.golfer.tracking=false;
  if(this.swing){const s=this.swing,elapsed=now-s.start;this.golfer.goal=swingGoal(s.plan,elapsed,this.motion,now);this.golfer.tracking=s.plan.mode!=='canned';
   if(!s.dry&&!this.flight&&elapsed>=s.impact){this.flight={shot:s.shot,start:s.start+s.impact};this.ballRing.visible=false;this.setPhase('flight');}
   if(elapsed>=s.plan.end){this.swing=null;if(s.dry){if(!this.motion.live(now))this.golfer.goal=0;this.setPhase('address');}}
  }else if(this.replay){this.golfer.goal=this.replay.value(now);this.golfer.tracking=true;if(this.replay.done(now)){this.replay=null;this.golfer.goal=0;}}
  else if(this.motion.live(now)&&FOLLOW_PHASES.has(this.phase)&&!this.holed){this.golfer.goal=this.motion.value(now);this.golfer.tracking=true;}
  if(this.flight){const {shot,start}=this.flight,previous=this.ball.position.clone(),p=sampleShot(shot,(now-start)/1000);const prior=this.lastFlightSample;this.rollSpeed=prior&&p.time>prior.time?Math.hypot(p.x-prior.x,p.z-prior.z)/(p.time-prior.time):shot.ballSpeed;this.lastFlightSample=p;this.ball.position.set(p.x,p.y,p.z);this.ball.scale.setScalar(1);rollBall(this.ball,previous,p);this.trace.reveal(p.index);this.rimming=p.rimming;this.effects.sample(p.time,now);if(p.settling&&this.phase!=='settling'){this.setPhase('settling');this.terrainDetails.setBall(shot.to);this.setCamera();}if(p.settling)this.trace.fade(Math.max(0,1-(p.time-shot.settleTime)*1.6));if(p.dropping&&this.phase!=='cup')this.setPhase('cup');if(p.splashing){if(this.phase!=='splash'){this.setPhase('splash');this.setCamera(true);}this.ball.visible=p.y>WATER_LEVEL-BALL_RADIUS;this.trace.fade(Math.max(0,1-(p.time-shot.waterTime)*2));}
   if(p.done){this.flight=null;this.landedAt=start+shot.duration*1000;if(shot.holed){this.holed=true;this.ball.visible=false;this.trace.visible=false;this.golfer.goal=-.65;this.setPhase('holed');}else this.setPhase('landing');}
  }
  if(this.phase==='landing'&&now-this.landedAt>LANDING_PAUSE)this.beginMovement(this.landedAt+LANDING_PAUSE);
  if(this.movement)this.updateMovement(now,dt);
  if(!this.swing&&this.phase==='address'&&now-(this.lastMotion||0)>1800)this.golfer.goal*=.96;
  this.updateEnvironment(now);this.golfer.update(dt,time);this.golfer.head.rotation.y+=this.motionView.yaw*.5;this.setCamera();
  if(this.intro&&this.phase==='address'){const u=(now-this.intro.start)/this.intro.duration;if(u>=1){this.skipIntro();}else{const pose=this.introPose(u,this.targetPosition.clone(),this.targetLook.clone());this.camera.position.copy(pose.pos);this.currentLook.copy(pose.look);}}
  if(!this.intro||this.phase!=='address'){if(this.intro)this.skipIntro();const cam=this.flightCam,flying=this.phase==='flight',rate=this.rimming||['cup','splash'].includes(this.phase)?9:flying?(cam==='landing'?1.6:cam==='launch'?3:cam==='putt'?5:4):this.phase==='settling'?3.2:this.phase==='landing'?2:this.movement?12:4,lookRate=flying?(cam==='landing'||cam==='launch'?9:6):rate,f=1-Math.exp(-dt*rate),g=1-Math.exp(-dt*lookRate);this.camera.position.lerp(this.targetPosition,f);this.currentLook.lerp(this.targetLook,g);}
  const floor=heightAt(this.hole,-this.camera.position.x,this.camera.position.z)+(this.view==='overview'?2:.9);if(this.camera.position.y<floor)this.camera.position.y=floor;this.camera.lookAt(this.currentLook);
  this.updateTreeFade(dt,this.intro?this.hole.pin:this.flight||this.phase==='landing'||this.phase==='settling'?this.ball.position:this.movement?this.movement.current:this.ballPosition||this.hole.tee);
  if(this.guide.visible!==this.guideActive())this.refreshGuide();this.guide.tick(dt);if(this.forecast.visible)this.forecast.scale.setScalar(1+Math.sin(time*4)*.08);
  if(this.flag){const p=this.flag.geometry.attributes.position;for(let i=0;i<p.count;i++)p.setZ(i,Math.sin(time*2+p.getX(i))*Math.max(0,p.getX(i)+.625)*.12);p.needsUpdate=true;}this.updateObstructions(dt);this.renderer.render(this.scene,this.camera);this.onFrame?.();
 }
}
