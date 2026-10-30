import {PHYSICS,cameraInput} from '../shared/maze/physics.js';
import {obstaclePose,sweeperPose,moverPose} from '../shared/maze/levels.js';
// Test-only controller follows explicit waypoints using acceleration, never teleports.
export function followRoute(game,route,{maxSeconds=350,speed=2.4}={}){let target=1,minimum=Infinity;for(let i=0;i<maxSeconds/PHYSICS.step&&game.phase!=='won';i++){const b=game.ball,p=route[target],d=Math.hypot(b.x-p.x,b.z-p.z);if(d<.35&&target<route.length-1)target++;const q=route[target],dx=q.x-b.x,dz=q.z-b.z,len=Math.hypot(dx,dz),v=Math.min(speed,len*2.2),vx=len?dx/len*v:0,vz=len?dz/len*v:0;const input=cameraInput(((vx-b.vx)*5+PHYSICS.drag*b.vx)/PHYSICS.acceleration,((vz-b.vz)*5+PHYSICS.drag*b.vz)/PHYSICS.acceleration,game.heading);game.advance(PHYSICS.step,input);minimum=Math.min(minimum,b.y);if(game.phase==='falling')return {target,minimum};}return {target,minimum};}

// 机关路线：路线点之外支持
//  {clear:true}        在此点停住，等到接下来一段路线（到下一个等待点为止，最多 3 段）通过期间不会碰到扫杆 / 移动挡块；
//  {board:id,from:'a'} 等往返浮台停靠在 from 端，走到浮台中央，随浮台到另一端停靠后再继续。
const segDistance=(p,a,b)=>{const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);};
export function pathClear(game,from,to,speed,margin=.45,blockMargin=.2){
 // to 可以是一个点或一串点（折线），依次以 speed 通过。
 const pts=[from,...(Array.isArray(to)?to:[to])],lens=pts.slice(1).map((q,i)=>Math.hypot(q.x-pts[i].x,q.z-pts[i].z)),total=lens.reduce((a,b)=>a+b,0),T=total/speed+.6;
 const at=d=>{let i=0;while(i<lens.length-1&&d>lens[i]){d-=lens[i];i++;}const f=Math.min(1,d/Math.max(lens[i],1e-6));return {x:pts[i].x+(pts[i+1].x-pts[i].x)*f,z:pts[i].z+(pts[i+1].z-pts[i].z)*f};};
 for(let tau=0;tau<=T;tau+=.04){const p=at(Math.min(total,tau*speed)),time=game.clock+tau;
  for(const s of game.level.sweepers||[]){const q=sweeperPose(s,time);if(segDistance(p,q.a,q.b)<PHYSICS.radius+s.width/2+margin||Math.hypot(p.x-s.x,p.z-s.z)<PHYSICS.radius+s.post+.1)return false;}
  for(const o of game.level.obstacles){const q=obstaclePose(game.level,o,time),dx=p.x-q.x,dz=p.z-q.z,lx=Math.abs(dx*q.right.x+dz*q.right.z)-o.width/2,lz=Math.abs(dx*q.forward.x+dz*q.forward.z)-o.depth/2;if(Math.hypot(Math.max(0,lx),Math.max(0,lz))<PHYSICS.radius+blockMargin)return false;}
 }return true;
}
export function followPlan(game,route,{maxSeconds=420,speed=2.4,trace=false}={}){
 let k=1,mode='go',minimum=Infinity,waited=0;const log=[];
 const steer=(tx,tz,v0)=>{const b=game.ball,dx=tx-b.x,dz=tz-b.z,len=Math.hypot(dx,dz),v=Math.min(v0,len*2.2),vx=len?dx/len*v:0,vz=len?dz/len*v:0;return cameraInput(((vx-b.vx)*5+PHYSICS.drag*b.vx)/PHYSICS.acceleration,((vz-b.vz)*5+PHYSICS.drag*b.vz)/PHYSICS.acceleration,game.heading);};
 for(let i=0;i<maxSeconds/PHYSICS.step&&game.phase!=='won';i++){
  const b=game.ball,step=route[k],near=Math.hypot(b.x-step.x,b.z-step.z);let input;
  if(step.board){
   const m=game.level.movers.find(m=>m.id===step.board),pose=moverPose(m,game.clock),to=step.from==='a'?'b':'a',s=((game.clock/m.period+m.phase)%1+1)%1,start=step.from==='a'?0:.5;
   if(mode==='go'){input=steer(step.x,step.z,step.speed||speed);if(near<.3)mode='wait';}
   else if(mode==='wait'){input=steer(step.x,step.z,speed);waited+=PHYSICS.step;if(pose.docked===step.from&&s>=start&&s<start+.05)mode='board';}
   else if(mode==='board'){input=steer(pose.x,pose.z,4.2);if(game.riding===m.id&&Math.hypot(b.x-pose.x,b.z-pose.z)<.6)mode='ride';}
   else{input=steer(pose.x,pose.z,1.5);if(pose.docked===to&&game.riding===m.id){mode='go';k++;}}
  }else if(step.clear){
   input=steer(step.x,step.z,step.speed||speed);
   if(mode==='go'&&near<.3&&Math.hypot(b.vx,b.vz)<.4)mode='wait';
   if(mode==='wait'){waited+=PHYSICS.step;const span=[];for(let j=k+1;j<route.length&&span.length<3;j++){span.push(route[j]);if(route[j].clear||route[j].board)break;}if(pathClear(game,b,span,route[k+1].speed||speed)){k++;mode='go';}}
  }else{input=steer(step.x,step.z,step.speed||speed);if(near<.35&&k<route.length-1){k++;mode='go';}}
  game.advance(PHYSICS.step,input);minimum=Math.min(minimum,game.ball.y);if(trace&&i%60===0)log.push([game.clock.toFixed(1),k,mode,game.ball.x.toFixed(2),game.ball.z.toFixed(2),game.ball.y.toFixed(2)]);
  if(game.phase==='falling')return {target:k,minimum,fell:true,log,waited};
 }return {target:k,minimum,log,waited};
}
