import {FISHING,CATCHES,castDistance} from '../shared/fishing/rules.js';
// 测试用“钓手”：只通过竿姿（含转轮收线速度）/ 准备 / 抛投 / 剪线这几种命令操作（与手机相同）。
// 0.29：收线时鱼预兆、冲刺就停手（溜鱼），平时转轮收线，鱼往一边钻就往反方向倾竿；可选“杂物直接剪线”。
export const rollFor=angle=>{const P=FISHING.pose,C=FISHING.cast;return angle===0?0:Math.sign(angle)*(C.aimDead+Math.abs(angle)/C.aimRange*(P.full-C.aimDead));};
export const powerFor=distance=>Math.pow((distance-FISHING.cast.min)/(FISHING.cast.max-FISHING.cast.min),1/.95);
export class FishingBot {
 // target：抛到哪里（距离、方向角）；crank：平时转轮速度（圈/秒）；greedy：冲刺时也不停手；cutJunk：钩到杂物就剪线；lean：会不会倾竿带鱼头。
 constructor(angler,{target={distance:9,angle:-30},crank=2.6,greedy=false,cutJunk=false,lean=true,react=.15}={}){Object.assign(this,{a:angler,target,crankRate:crank,greedy,cutJunk,leanOn:lean,react});this.t=0;this.waitArm=0;this.since=0;this.lastBehavior=null;}
 step(dt){
  const a=this.a,t=this.target;this.t+=dt;let pitch=0,roll=0,crank=0;
  if(a.phase==='aim'){roll=rollFor(t.angle);if(Math.abs(a.aim-t.angle)<1.2){this.waitArm+=dt;if(this.waitArm>.2){a.arm();this.waitArm=0;}}}
  else if(a.phase==='armed'){roll=rollFor(t.angle);if(Math.abs(a.aim-t.angle)<.8)a.cast({power:powerFor(t.distance)});}
  else if(a.phase==='lure'){const type=a.fish?.type,prefer=CATCHES[type]?.prefer,u=this.t;
   if(prefer==='twitch'){const ph=u%.9;pitch=ph<.12?ph/.12*7:ph<.4?7*(1-(ph-.12)/.28):0;}
   else if(prefer==='dragpause'){const ph=u%3;pitch=ph<1.5?6*Math.sin(ph*2*Math.PI/1.5):0;}
   else pitch=6*Math.sin(u*2*Math.PI/2.4);}
  else if(a.phase==='bite'){this.biteT=(this.biteT||0)+dt;pitch=this.biteT>.15?Math.min(20,(this.biteT-.15)*110):0;}
  else if(a.phase==='fight'){this.biteT=0;const f=a.fight;
   if(f.behavior!==this.lastBehavior){this.lastBehavior=f.behavior;this.since=0;}this.since+=dt;
   if(this.cutJunk&&f.kind==='junk'){a.abandon();}
   const rushing=(f.behavior==='dash'||f.behavior==='telegraph')&&this.since>=this.react;
   crank=this.greedy||!rushing?this.crankRate:0;pitch=f.behavior==='dash'?20:5;
   if(this.leanOn)roll=Math.max(-25,Math.min(25,-(f.lat/f.width*30+(f.behavior==='dash'?(f.dashDir||0)*14:0))));}
  else this.biteT=0;
  a.setPose(pitch,roll,crank);
 }
}
// 让一位钓手在某个落点连续钓 seconds 秒，返回每一竿的结果（上岸 / 逃掉 / 剪线）。
export function fishFor(angler,{target,seconds=120,...opts}={}){
 const bot=new FishingBot(angler,{target,...opts}),dt=FISHING.step,events=[];let castAt=null,hookAt=null;const results=[];
 for(let i=0;i<seconds/dt;i++){bot.step(dt);angler.tick(dt,{casting:true});for(const e of angler.events.splice(0)){events.push(e);if(e.kind==='cast')castAt=e.t;if(e.kind==='hook')hookAt=e.t;if(e.kind==='landed'||e.kind==='lost')results.push({kind:e.kind,reason:e.reason,type:e.catch?.type||e.type,kg:e.catch?.kg??e.kg,points:e.catch?.points||0,total:e.t-(castAt??e.t),fight:e.t-(hookAt??e.t)});}}
 return {results,events};
}
