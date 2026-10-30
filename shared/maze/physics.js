import {LEVELS,surfaces,walls,inside as insidePolygon,obstaclePose,roadFrame,moverPose,moverFloor,sweeperPose,boostZone} from './levels.js';
export const PHYSICS=Object.freeze({radius:.48,acceleration:10.5,drag:.85,rolling:.35,maxSpeed:7.2,gravity:18,restitution:.22,step:1/120,goalSpeed:1.1,goalHold:.65,fallSeconds:1.05,prepareSeconds:1.1,boostSpeed:11,boostSeconds:1.2,overspeedDecay:5,bumperKick:5.5,sweeperKick:2.6});
// 路面：冰面难加速、几乎不减速；云絮阻力大，自然把球拖慢。
export const SURFACES=Object.freeze({normal:{control:1,drag:1,rolling:1},ice:{control:.38,drag:.16,rolling:.1},fluff:{control:.9,drag:3.4,rolling:3}});
export const surfaceKind=floor=>floor?.road?.surface||floor?.platform?.surface||'normal';
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function vector(x=0,y=0){if(!Number.isFinite(x)||!Number.isFinite(y))return {x:0,y:0};const m=Math.max(1,Math.hypot(x,y));return {x:x/m,y:y/m};}
export const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export function worldInput(input,heading){return {x:Math.cos(heading)*input.x-Math.sin(heading)*input.y,z:Math.sin(heading)*input.x+Math.cos(heading)*input.y};}
export function cameraInput(x,z,heading){return vector(x*Math.cos(heading)+z*Math.sin(heading),-x*Math.sin(heading)+z*Math.cos(heading));}
export function floorAt(floors,x,z){const hits=floors.filter(s=>insidePolygon({x,z},s.polygon));if(!hits.length)return null;return hits.reduce((a,b)=>a.height(x,z)>b.height(x,z)?a:b);}
function resolve(b,nx,nz,depth,vx=0,vz=0){b.x+=nx*(depth+1e-5);b.z+=nz*(depth+1e-5);const vn=(b.vx-vx)*nx+(b.vz-vz)*nz;if(vn>=0)return 0;const bounce=-vn>1?PHYSICS.restitution:0;b.vx-=(1+bounce)*vn*nx;b.vz-=(1+bounce)*vn*nz;return -vn;}
export function collideWall(b,w){const dx=w.b.x-w.a.x,dz=w.b.z-w.a.z,t=clamp(((b.x-w.a.x)*dx+(b.z-w.a.z)*dz)/(dx*dx+dz*dz||1),0,1),x=w.a.x+dx*t,z=w.a.z+dz*t,base=w.a.y+(w.b.y-w.a.y)*t;if(b.y+PHYSICS.radius<base||b.y-PHYSICS.radius>base+w.height)return 0;const ax=b.x-x,az=b.z-z,d=Math.hypot(ax,az),min=PHYSICS.radius+w.radius;if(d>=min)return 0;const length=Math.hypot(dx,dz)||1;return resolve(b,d>1e-8?ax/d:-dz/length,d>1e-8?az/d:dx/length,min-d);}
export function collideObstacle(b,o){if(b.y-PHYSICS.radius>o.y+o.height||b.y+PHYSICS.radius<o.y)return 0;const dx=b.x-o.x,dz=b.z-o.z,lx=dx*o.right.x+dz*o.right.z,lz=dx*o.forward.x+dz*o.forward.z,hx=o.width/2,hz=o.depth/2;let nx=lx-clamp(lx,-hx,hx),nz=lz-clamp(lz,-hz,hz),d=Math.hypot(nx,nz),depth=PHYSICS.radius-d;if(d<1e-8){const ex=hx-Math.abs(lx),ez=hz-Math.abs(lz);if(ex<ez){nx=lx>=0?1:-1;nz=0;depth=PHYSICS.radius+ex;}else{nx=0;nz=lz>=0?1:-1;depth=PHYSICS.radius+ez;}d=1;}if(depth<=0)return 0;return resolve(b,(nx*o.right.x+nz*o.forward.x)/d,(nx*o.right.z+nz*o.forward.z)/d,depth,o.vx,o.vz);}
// 弹射柱：静止圆柱，碰到后沿法线至少以 bumperKick 弹开。
export function collideBumper(b,u){if(b.y-PHYSICS.radius>u.y+u.height||b.y+PHYSICS.radius<u.y)return 0;const dx=b.x-u.x,dz=b.z-u.z,d=Math.hypot(dx,dz),min=PHYSICS.radius+u.radius;if(d>=min)return 0;const nx=d>1e-8?dx/d:1,nz=d>1e-8?dz/d:0;b.x+=nx*(min-d+1e-5);b.z+=nz*(min-d+1e-5);const vn=b.vx*nx+b.vz*nz,hit=Math.max(0,-vn);if(vn<0){b.vx-=2*vn*nx;b.vz-=2*vn*nz;}const out=b.vx*nx+b.vz*nz;if(out<PHYSICS.bumperKick){b.vx+=(PHYSICS.bumperKick-out)*nx;b.vz+=(PHYSICS.bumperKick-out)*nz;}return Math.max(hit,PHYSICS.bumperKick);}
// 旋转扫杆：横杆是绕立柱转动的胶囊体，接触点速度 = 角速度 × 半径；立柱本身是静止圆柱。
export function collideSweeper(b,s){if(b.y-PHYSICS.radius>s.y+s.height||b.y+PHYSICS.radius<s.y)return 0;let impact=0;const px=b.x-s.x,pz=b.z-s.z,pd=Math.hypot(px,pz),pm=PHYSICS.radius+s.post;if(pd<pm)impact=resolve(b,pd>1e-8?px/pd:1,pd>1e-8?pz/pd:0,pm-pd);
 const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z,t=clamp(((b.x-s.a.x)*dx+(b.z-s.a.z)*dz)/(dx*dx+dz*dz||1),0,1),cx=s.a.x+dx*t,cz=s.a.z+dz*t,ax=b.x-cx,az=b.z-cz,d=Math.hypot(ax,az),min=PHYSICS.radius+s.width/2;if(d>=min)return impact;const rx=cx-s.x,rz=cz-s.z,vx=-s.speed*rz,vz=s.speed*rx,length=Math.hypot(dx,dz)||1,nx=d>1e-8?ax/d:-dz/length,nz=d>1e-8?az/d:dx/length,hit=resolve(b,nx,nz,min-d,vx,vz),away=(b.vx-vx)*nx+(b.vz-vz)*nz;if(away<PHYSICS.sweeperKick){b.vx+=(PHYSICS.sweeperKick-away)*nx;b.vz+=(PHYSICS.sweeperKick-away)*nz;}return Math.max(impact,hit,1);}
export class RollingGame {
 constructor(index=0){this.results=[];this.load(index);this.phase='ready';}
 load(index){this.index=clamp(Math.floor(index),0,LEVELS.length-1);this.level=LEVELS[this.index];this.floors=surfaces(this.level);this.walls=walls(this.level,this.floors);this.boosts=(this.level.boosts||[]).map(b=>boostZone(this.level,b));this.riding=null;this.movers=[];this.boostTime=0;this.inBoost=null;this.speedLimit=PHYSICS.maxSpeed;this.checkpoint=-1;this.checkpoints=new Set();this.elapsed=0;this.falls=0;this.started=false;this.clock=0;this.accumulator=0;this.events=[];this.contacts=-1;this.goalTime=0;this.phase='playing';this.resumePhase='playing';this.respawn();}
 respawn(){const p=this.checkpoint<0?this.level.spawn:this.level.checkpoints[this.checkpoint];this.ball={x:p.x,y:p.y+PHYSICS.radius,z:p.z,vx:0,vy:0,vz:0,rollX:0,rollZ:0};this.riding=null;this.boostTime=0;this.inBoost=null;this.speedLimit=PHYSICS.maxSpeed;this.heading=p.heading??this.level.heading;this.cameraHeading=this.heading;this.currentRoad=null;this.goalTime=0;this.respawnVersion=(this.respawnVersion||0)+1;}
 retry(){this.load(this.index);}
 pause(reason='manual'){if(['playing','falling','countdown'].includes(this.phase)){this.resumePhase=this.phase==='countdown'?this.resumePhase:this.phase;this.phase='paused';this.pauseReason=reason;this.accumulator=0;}}
 resume(){if(this.phase!=='paused')return;this.phase='countdown';this.countdown=PHYSICS.prepareSeconds;this.ball.vx=0;this.ball.vy=0;this.ball.vz=0;this.accumulator=0;}
 advance(seconds,input={x:0,y:0}){if(!Number.isFinite(seconds)||seconds<0)return [];this.events=[];this.accumulator+=Math.min(seconds,.25);const control=vector(input.x,input.y);while(this.accumulator+1e-10>=PHYSICS.step){this.tick(PHYSICS.step,control);this.accumulator-=PHYSICS.step;}return this.events;}
 updateHeading(dt){const b=this.ball;let best=null,score=Infinity;for(const r of this.level.roads){const f=roadFrame(r),along=clamp((b.x-r.a.x)*f.forward.x+(b.z-r.a.z)*f.forward.z,0,f.length),x=r.a.x+f.forward.x*along,z=r.a.z+f.forward.z*along,y=r.a.y+f.slope*along;if(Math.abs(y-(b.y-PHYSICS.radius))>.4)continue;const d=Math.hypot(b.x-x,b.z-z)+(r.id===this.currentRoad?-.35:0);if(d<score){score=d;best={r,f};}}if(best){this.currentRoad=best.r.id;if(Math.hypot(b.vx,b.vz)>.12)this.heading+=clamp(angleDelta(best.f.heading,this.heading)*(1-Math.exp(-2.4*dt)),-1.35*dt,1.35*dt);}this.cameraHeading=this.heading;}
 tick(dt,input){
  if(['ready','paused','won'].includes(this.phase))return;
  if(this.phase==='countdown'){this.countdown-=dt;if(this.countdown<=0)this.phase=this.resumePhase;return;}
  if(this.started)this.elapsed+=dt;this.clock+=dt;const b=this.ball;
  if(this.phase==='falling'){this.fallTime+=dt;b.vy-=PHYSICS.gravity*dt;b.x+=b.vx*dt;b.z+=b.vz*dt;b.y+=b.vy*dt;if(this.fallTime>=PHYSICS.fallSeconds){this.respawn();this.phase='countdown';this.resumePhase='playing';this.countdown=PHYSICS.prepareSeconds;this.events.push({kind:'respawn'});}return;}
  if(!this.started&&Math.hypot(input.x,input.y)>.04)this.started=true;
  // 往返浮台：先按浮台本步的位移带着球走，再用本步的位置判断地面。
  const lastMovers=this.movers;this.movers=(this.level.movers||[]).map(m=>moverPose(m,this.clock));if(this.riding){const a=lastMovers.find(m=>m.id===this.riding),c=this.movers.find(m=>m.id===this.riding);if(a&&c){b.x+=c.x-a.x;b.z+=c.z-a.z;}}
  const floors=this.movers.length?[...this.floors,...this.movers.map(moverFloor)]:this.floors;this.floorsNow=floors;
  const before=floorAt(floors,b.x,b.z),ground=SURFACES[surfaceKind(before)],control=worldInput(input,this.heading);let sx=0,sz=0;if(before?.road){sx=before.frame.forward.x*before.frame.slope;sz=before.frame.forward.z*before.frame.slope;}
  b.vx+=(control.x*PHYSICS.acceleration*ground.control-PHYSICS.gravity*.6*sx)*dt;b.vz+=(control.z*PHYSICS.acceleration*ground.control-PHYSICS.gravity*.6*sz)*dt;
  // 加速带：沿道路前进方向推，速度上限短暂提高，离开后再平滑回落到正常上限。
  const zone=this.boosts.find(z=>insidePolygon(b,z.polygon)&&Math.abs(z.height(b.x,b.z)-(b.y-PHYSICS.radius))<.3);if(zone){b.vx+=zone.forward.x*zone.power*dt;b.vz+=zone.forward.z*zone.power*dt;this.boostTime=PHYSICS.boostSeconds;if(this.inBoost!==zone.id)this.events.push({kind:'boost'});}this.inBoost=zone?.id??null;
  if(this.boostTime>0){this.boostTime-=dt;this.speedLimit=PHYSICS.boostSpeed;}else this.speedLimit=Math.max(PHYSICS.maxSpeed,this.speedLimit-PHYSICS.overspeedDecay*dt);
  const drag=Math.exp(-PHYSICS.drag*ground.drag*dt);b.vx*=drag;b.vz*=drag;const speed=Math.hypot(b.vx,b.vz),friction=Math.max(0,speed-PHYSICS.rolling*ground.rolling*dt)/Math.max(speed,1e-9);b.vx*=friction;b.vz*=friction;const cap=Math.min(1,this.speedLimit/(Math.hypot(b.vx,b.vz)||1));b.vx*=cap;b.vz*=cap;if(Math.hypot(input.x,input.y)<.02&&Math.hypot(sx,sz)<.001&&Math.hypot(b.vx,b.vz)<.045&&ground!==SURFACES.ice){b.vx=0;b.vz=0;}
  const oldX=b.x,oldZ=b.z;b.x+=b.vx*dt;b.z+=b.vz*dt;let impact=0,bumped=0,swept=0;
  const sweepers=(this.level.sweepers||[]).map(s=>sweeperPose(s,this.clock));this.sweepers=sweepers;
  for(let pass=0;pass<3;pass++){for(const w of this.walls)impact=Math.max(impact,collideWall(b,w));for(const o of this.level.obstacles)impact=Math.max(impact,collideObstacle(b,obstaclePose(this.level,o,this.clock)));for(const u of this.level.bumpers||[])bumped=Math.max(bumped,collideBumper(b,u));for(const s of sweepers)swept=Math.max(swept,collideSweeper(b,s));}
  if(swept&&this.clock-(this.lastSweep||-1)>.15){this.lastSweep=this.clock;this.events.push({kind:'sweep',strength:clamp(swept/7,0,1)});}
  const afterImpact=Math.min(1,Math.max(this.speedLimit,bumped?PHYSICS.bumperKick+1:0)/(Math.hypot(b.vx,b.vz)||1));b.vx*=afterImpact;b.vz*=afterImpact;
  const surface=floorAt(floors,b.x,b.z);if(!surface){this.phase='falling';this.fallTime=0;this.falls++;b.vy=0;this.riding=null;this.events.push({kind:'fall'});return;}
  const riding=surface.mover?surface.mover.id:null;if(riding&&riding!==this.riding)this.events.push({kind:'board'});this.riding=riding;this.surface=surfaceKind(surface);
  if(bumped&&this.clock-(this.lastBump||-1)>.15){this.lastBump=this.clock;this.events.push({kind:'bump',strength:clamp(bumped/7,0,1)});}
  b.y=surface.height(b.x,b.z)+PHYSICS.radius;b.rollX+=(b.z-oldZ)/PHYSICS.radius;b.rollZ-=(b.x-oldX)/PHYSICS.radius;this.updateHeading(dt);
  if(impact>.7&&this.clock-this.contacts>.12){this.contacts=this.clock;this.events.push({kind:'wall',strength:clamp(impact/7,0,1)});}
  for(let i=0;i<this.level.checkpoints.length;i++){const p=this.level.checkpoints[i];if(Math.hypot(b.x-p.x,b.z-p.z)<p.radius&&!this.checkpoints.has(i)&&Math.abs(b.y-PHYSICS.radius-p.y)<.2){this.checkpoint=i;this.checkpoints.add(i);this.events.push({kind:'checkpoint',checkpoint:i});}}
  const goal=this.level.goal,inside=Math.hypot(b.x-goal.x,b.z-goal.z)<goal.radius-PHYSICS.radius&&Math.abs(b.y-PHYSICS.radius-goal.y)<.2;if(inside&&Math.hypot(b.vx,b.vz)<=PHYSICS.goalSpeed)this.goalTime+=dt;else this.goalTime=0;
  if(this.goalTime+1e-9>=PHYSICS.goalHold){this.phase='won';b.vx=0;b.vz=0;this.results[this.index]={elapsed:this.elapsed,falls:this.falls};this.events.push({kind:'win'});}
 }
}
