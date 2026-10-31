import {PHYSICS,cameraInput} from '../shared/maze/physics.js';
import {obstaclePose,sweeperPose} from '../shared/maze/levels.js';
// 测试用自动驾驶：只用加速度沿赛道路线点走（不瞬移）；遇到风车 / 移动挡块先停住，等接下来的路线不会被碰到再走。
const segDistance=(p,a,b)=>{const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);};
function clear(game,pieces,pts,speed){
 const lens=pts.slice(1).map((q,i)=>Math.hypot(q.x-pts[i].x,q.z-pts[i].z)),total=lens.reduce((a,b)=>a+b,0),T=total/speed+.6;
 const pos=d=>{let i=0;while(i<lens.length-1&&d>lens[i]){d-=lens[i];i++;}const f=Math.min(1,d/Math.max(lens[i],1e-6));return {x:pts[i].x+(pts[i+1].x-pts[i].x)*f,z:pts[i].z+(pts[i+1].z-pts[i].z)*f};};
 for(let tau=0;tau<=T;tau+=.04){const p=pos(Math.min(total,tau*speed)),time=game.clock+tau;
  for(const piece of pieces){for(const s of piece.sweepers){const q=sweeperPose(s,time);if(segDistance(p,q.a,q.b)<PHYSICS.radius+s.width/2+.45||Math.hypot(p.x-s.x,p.z-s.z)<PHYSICS.radius+s.post+.1)return false;}
   for(const {o,level} of piece.obstaclePoses){const q=obstaclePose(level,o,time),dx=p.x-q.x,dz=p.z-q.z,lx=Math.abs(dx*q.right.x+dz*q.right.z)-o.width/2,lz=Math.abs(dx*q.forward.x+dz*q.forward.z)-o.depth/2;if(Math.hypot(Math.max(0,lx),Math.max(0,lz))<PHYSICS.radius+.25)return false;}}
 }return true;
}
export class Bot {
 constructor(game,player,{speed=5.4,offset=0}={}){this.game=game;this.player=player;this.speed=speed;this.offset=offset;this.k=0;this.mode='go';this.route=[];this.seen=-1;this.waited=0;}
 sync(){for(const piece of this.game.track.pieces)if(piece.index>this.seen){this.route.push(...piece.route.map(p=>({...p,piece:piece.index})));this.seen=piece.index;}}
 input(){
  this.sync();const g=this.game,p=this.player,b=p.ball;if(p.phase!=='playing')return {x:0,y:0};
  const step=this.route[this.k],next=this.route[this.k+1];if(!step)return {x:0,y:0};
  const near=Math.hypot(b.x-step.x,b.z-step.z),ice=p.surface==='ice',a=ice?2.2:5.5,end=step.clear?0:step.turn?2.3:Math.min(this.speed,4.2);
  let v=Math.min(this.speed,Math.sqrt(end*end+2*a*Math.max(0,near-.3)));
  if(step.clear){if(this.mode==='go'&&near<.35&&Math.hypot(b.vx,b.vz)<.5)this.mode='wait';if(this.mode==='wait'){this.waited+=PHYSICS.step;const span=[b];for(let j=this.k+1;j<this.route.length&&span.length<4;j++){span.push(this.route[j]);if(this.route[j].clear)break;}if(clear(g,g.track.near(p.s,10,30),span,3.4)){this.k++;this.mode='go';}v=near*2;}}
  else if(near<(step.turn?.7:1.1)&&next){this.k++;}
  const t=this.route[this.k],dx=t.x-b.x,dz=t.z-b.z,len=Math.hypot(dx,dz),vx=len?dx/len*Math.min(v,len*4):0,vz=len?dz/len*Math.min(v,len*4):0;
  return cameraInput(((vx-b.vx)*5+PHYSICS.drag*b.vx)/PHYSICS.acceleration,((vz-b.vz)*5+PHYSICS.drag*b.vz)/PHYSICS.acceleration,p.heading);
 }
}
// 跑一局：每位球手一个自动驾驶；返回每人的最远距离。
export function runBots(game,{seconds=240,speeds=[]}={}){
 const bots=game.players.map((p,i)=>new Bot(game,p,{speed:speeds[i]??5.4}));
 for(let i=0;i<seconds/PHYSICS.step&&game.phase!=='over';i++){const inputs={};for(const bot of bots)inputs[bot.player.id]=bot.input();game.advance(PHYSICS.step,inputs);}
 return bots;
}
