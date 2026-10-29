// 小人动作时间线：把手机发来的姿势（u，带手机时间戳）排成一条时间线，延迟约 90 毫秒插值播放，
// 让 25 Hz 的数据也能平滑地实时跟随；击球时插入手机发来的精确轨迹，并据此算出“球杆回到击球位置”的本地时刻，
// 让小人的下挥与球的起飞对齐。也保存最近的完整动作，用于慢放回放。
export class SwingMotion{
 constructor({delay=90,stale=700,keep=30000}={}){this.delay=delay;this.stale=stale;this.keep=keep;this.reset();}
 reset(){this.samples=[];this.offsets=[];this.offset=null;this.lastAt=0;this.lastKin=null;}
 // 手机时间 → 本地时间：取最近 5 秒内“到达时刻 − 手机时间”的最小值（网络抖动只会让它变大）。
 sync(phoneT,now){this.offsets.push({at:now,off:now-phoneT});while(this.offsets.length&&now-this.offsets[0].at>5000)this.offsets.shift();this.offset=Math.min(...this.offsets.map(o=>o.off));}
 toLocal(phoneT){return phoneT+(this.offset??0);}
 push(sample,now=performance.now()){
  if(!sample||!Number.isFinite(sample.t)||!Number.isFinite(sample.u))return false;
  if(this.samples.length&&sample.t<this.samples.at(-1).t-3000)this.reset();// 手机页面刷新后时间戳重新开始
  this.sync(sample.t,now);this.lastAt=now;this.insert({t:sample.t,u:sample.u,phase:sample.phase||null});this.trim(now);return true;
 }
 insert(p){const s=this.samples;if(!s.length||p.t>s.at(-1).t){s.push(p);return;}let i=s.length-1;while(i>0&&s[i-1].t>p.t)i--;if(Math.abs(s[i].t-p.t)<1)s[i]=p;else s.splice(i,0,p);}
 trim(now){const limit=this.phoneNow(now)-this.keep;while(this.samples.length>2&&this.samples[0].t<limit)this.samples.shift();}
 phoneNow(now=performance.now()){return now-(this.offset??0);}
 live(now=performance.now()){return this.offset!==null&&now-this.lastAt<this.stale;}
 // 击球：用手机发来的 25 Hz 轨迹替换同一时段的低频样本。
 insertTrace(kin){
  if(!kin?.u?.length||!Number.isFinite(kin.t0))return null;const end=kin.t0+(kin.u.length-1)*kin.dt;
  this.samples=this.samples.filter(p=>p.t<kin.t0-1||p.t>end+1);kin.u.forEach((u,i)=>this.insert({t:kin.t0+i*kin.dt,u,phase:'trace'}));this.lastKin=kin;return this.impactPhone(kin);
 }
 // 击球时刻（手机时间）：峰值之后姿势第一次回到站位（u ≤ 0.03）；轨迹里没有时按峰值后 60 毫秒估计。
 impactPhone(kin){const i0=Math.max(0,Math.round((kin.impactAt-kin.t0)/kin.dt)-2);for(let i=i0;i<kin.u.length;i++)if(kin.u[i]<=.03)return kin.t0+i*kin.dt;return kin.impactAt+60;}
 impactLocal(kin){return this.toLocal(this.impactPhone(kin))+this.delay;}
 at(phoneT){
  const s=this.samples;if(!s.length)return 0;if(phoneT<=s[0].t)return s[0].u;if(phoneT>=s.at(-1).t)return s.at(-1).u;
  let lo=0,hi=s.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(s[mid].t<=phoneT)lo=mid;else hi=mid;}const a=s[lo],b=s[hi],f=(phoneT-a.t)/((b.t-a.t)||1);return a.u+(b.u-a.u)*f;
 }
 value(now=performance.now()){return this.at(this.phoneNow(now)-this.delay);}
 // 最近一杆的完整动作（从上杆开始到收杆停住），用于慢放。
 lastSwing(now=performance.now()){const k=this.lastKin;if(!k)return null;const from=k.t0-150,to=Math.min(this.phoneNow(now)-this.delay,k.impactAt+2200),pts=this.samples.filter(p=>p.t>=from&&p.t<=to);return pts.length>=4?{points:pts.map(p=>({t:p.t-from,u:p.u})),impact:this.impactPhone(k)-from}:null;}
}
// 慢放 / 无实时数据时的回放：按时间播放一段姿势轨迹。
export class SwingReplay{
 constructor(points,{speed=1,start=performance.now(),tail=true}={}){this.points=points;this.speed=speed;this.start=start;this.tail=tail;this.duration=(points.at(-1)?.t||0)/speed;}
 value(now=performance.now()){const t=(now-this.start)*this.speed,p=this.points;if(!p.length)return 0;if(t>=p.at(-1).t)return p.at(-1).u;let i=0;while(i<p.length-2&&p[i+1].t<t)i++;const a=p[i],b=p[i+1]||a,f=(t-a.t)/((b.t-a.t)||1);return a.u+(b.u-a.u)*Math.max(0,Math.min(1,f));}
 done(now=performance.now()){return (now-this.start)>=this.duration+(this.tail?600:0);}
}
// 由手机轨迹构造回放：轨迹在识别后不久就结束，之后补一段 0.45 秒的送杆到收杆。
export function traceReplay(kin,{speed=1,finish=-1,start=performance.now()}={}){
 if(!kin?.u?.length)return null;const points=kin.u.map((u,i)=>({t:i*kin.dt,u})),last=points.at(-1);
 if(last.u>finish+.05){const steps=9;for(let k=1;k<=steps;k++){const f=k/steps,e=1-(1-f)**2;points.push({t:last.t+450*f,u:last.u+(finish-last.u)*e});}}
 return new SwingReplay(points,{speed,start});
}

// 一次击球（或试挥）时小人的动作计划：
//  live   —— 手机实时跟随中：继续跟随，球在“球杆回到击球位置”的时刻起飞；
//  replay —— 有手机轨迹但没有实时数据：从上杆顶点开始按真实节奏回放；
//  canned —— 电脑输入：固定动画，上杆高度按力度。
export const FOLLOW_PHASES=new Set(['address','rehearsal','swing','flight','settling','landing','cup','splash','holed']);
export function planSwing(motion,{source,kin,power=1,now=performance.now()}){
 const phone=source==='phone';
 if(phone&&kin?.u?.length>=3){
  const live=motion.live(now);motion.insertTrace(kin);
  if(live){const impact=Math.max(0,motion.impactLocal(kin)-now);return {mode:'live',phone,impact,end:impact+1200};}
  const peak=kin.u.indexOf(Math.max(...kin.u)),from=Math.max(0,peak-2),sub={...kin,t0:kin.t0+from*kin.dt,u:kin.u.slice(from)},replay=traceReplay(sub,{start:now});
  return {mode:'replay',phone,replay,impact:Math.max(0,motion.impactPhone(kin)-sub.t0),end:replay.duration+500};
 }
 return {mode:'canned',phone,top:Math.max(.3,Math.min(1,.25+.8*(Number.isFinite(power)?power:1))),impact:phone?100:540,end:phone?710:1150};
}
const smoothstep=t=>t*t*(3-2*t);
export function swingGoal(plan,elapsed,motion,now=performance.now()){
 if(plan.mode==='live')return motion.value(now);
 if(plan.mode==='replay')return plan.replay.value(now);
 const u=Math.max(0,Math.min(1,(elapsed+(plan.phone?440:0))/1150)),top=plan.top??1;
 return u<.34?smoothstep(u/.34)*top:u<.48?top*(1-smoothstep((u-.34)/.14)):-smoothstep(Math.min(1,(u-.48)/.34))*Math.max(.6,top);
}
