import {FISHING,ZONES,zoneById,castDistance} from '../shared/fishing/rules.js';
// 测试用“钓手”：只通过竿姿 / 准备 / 抛投三种命令操作（与手机相同），按鱼的习性诱鱼、按张力和预兆搏鱼。
export const rollFor=angle=>{const P=FISHING.pose,C=FISHING.cast;return angle===0?0:Math.sign(angle)*(C.aimDead+Math.abs(angle)/C.aimRange*(P.full-C.aimDead));};
export const powerFor=distance=>Math.pow((distance-FISHING.cast.min)/(FISHING.cast.max-FISHING.cast.min),1/.95);
export class FishingBot {
 constructor(angler,{zone='shallow',skill=1,offset=0}={}){this.a=angler;this.zone=zone;this.skill=skill;this.offset=offset;this.t=0;this.pitch=0;this.roll=0;this.stroke='up';this.waitArm=0;}
 step(dt){
  const a=this.a,z=zoneById(this.zone);this.t+=dt;let pitch=0,roll=0;
  if(a.phase==='aim'){roll=rollFor(z.angle+this.offset);if(Math.abs(a.aim-(z.angle+this.offset))<1.2){this.waitArm+=dt;if(this.waitArm>.2){a.arm();this.waitArm=0;}}}
  else if(a.phase==='armed'){roll=rollFor(z.angle+this.offset);if(Math.abs(a.aim-(z.angle+this.offset))<.8)a.cast({power:powerFor(z.distance)});}
  else if(a.phase==='lure'){const type=z.fish,u=this.t;
   if(type==='small')pitch=6*Math.sin(u*2*Math.PI/2.4);
   else if(type==='perch'){const ph=u%.9;pitch=ph<.12?ph/.12*7:ph<.4?7*(1-(ph-.12)/.28):0;}
   else{const ph=u%3;pitch=ph<1.5?6*Math.sin(ph*2*Math.PI/1.5):0;}}
  else if(a.phase==='bite'){this.biteT=(this.biteT||0)+dt;pitch=this.biteT>.15/this.skill?Math.min(20,(this.biteT-.15/this.skill)*110):0;}
  else if(a.phase==='fight'){this.biteT=0;const f=a.fight;
   if(f.behavior==='telegraph'){this.pitch=Math.max(0,this.pitch-40*dt);}
   else if(f.behavior==='dash'){this.pitch=Math.max(-6,this.pitch-40*dt);}
   else if(f.T>.66){this.pitch-=40*dt;this.stroke='down';}
   else if(f.S>.4||f.T<.2&&f.C<.3){this.pitch+=30*dt;this.stroke='up';}
   else{if(this.stroke==='up'){this.pitch+=30*dt;if(this.pitch>=20)this.stroke='down';}else{this.pitch-=25*dt;if(this.pitch<=0)this.stroke='up';}}
   pitch=this.pitch=Math.max(-10,Math.min(24,this.pitch));roll=Math.max(-25,Math.min(25,f.lat*9+(f.behavior==='dash'||f.behavior==='telegraph'?(f.dashDir||0)*25:0)));}
  else{this.biteT=0;this.pitch=0;}
  if(a.phase!=='fight')this.pitch=0;
  a.setPose(pitch,roll);
 }
}
// 让一位钓手在某个钓区连续钓 seconds 秒，返回每条鱼的结果。
export function fishFor(angler,{zone='shallow',seconds=120,open}={}){
 const bot=new FishingBot(angler,{zone}),dt=FISHING.step,events=[];let castAt=null,results=[];
 for(let i=0;i<seconds/dt;i++){bot.step(dt);angler.tick(dt,{open:open||ZONES.map(z=>z.id),casting:true});for(const e of angler.events.splice(0)){events.push(e);if(e.kind==='cast')castAt=e.t;if(e.kind==='landed'||e.kind==='lost')results.push({kind:e.kind,reason:e.reason,type:e.catch?.type||e.type,total:e.t-(castAt??e.t),fight:e.catch?.time});}}
 return {results,events};
}
