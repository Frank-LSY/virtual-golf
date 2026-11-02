// 体感钓鱼 · 手机鱼竿输入（手机端运行；纯函数 / 小类，测试可直接喂合成数据）。
//  · RodMapper：竖握、顶部朝前。静止约 0.6 秒记下握姿基准；之后输出相对基准的抬放角 pitch（抬起为正）和左右倾 roll（右倾为正），
//    约 80 毫秒低通滤波。屏幕方向变化或传感器断流超过 0.4 秒会撤销基准，需要重新静止归零。
//  · CastDetector：只在“准备抛竿”的 5 秒窗口里工作。先后引（抬竿至少 15°），再快速前挥（下压速度至少 100°/秒），
//    一次准备只认一次。力量 = 40% 后引幅度（15°–65°）+ 60% 前挥平均速度（100–500°/秒）；不看单个采样尖峰。
//    方向修正取前挥过程中的左右倾变化，限 ±8°；瞄准取后引开始前那一刻的左右倾（aimRoll）。
import {orientationGravity} from '../maze/tilt.js';
const deg=r=>r*180/Math.PI,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),wrap=x=>((x+180)%360+360)%360-180;
export const ROD=Object.freeze({still:600,minSamples:10,jitter:2.5,filter:80,gap:400,dead:1.5,
 cast:Object.freeze({back:15,backMax:65,forwardRate:100,speedMin:100,speedMax:500,minTime:250,maxTime:1500,gap:120,dirGain:.4,dirMax:8})});
// 竖握：抬放 = 机身长轴相对水平面的仰角；左右倾 = 绕长轴的横滚。
export function rodAngles(beta,gamma){const g=orientationGravity(beta,gamma);return {pitch:deg(Math.asin(clamp(g.y,-1,1))),roll:deg(Math.atan2(-g.x,g.z))};}
export class RodMapper {
 constructor(){this.reset();}
 reset(){this.base=null;this.samples=[];this.filtered={pitch:0,roll:0};this.last=null;this.angle=null;this.progress=0;}
 sample(beta,gamma,time,screenAngle=0){
  if(![beta,gamma,time].every(Number.isFinite))return null;let changed=false;
  if(this.angle!==null&&screenAngle!==this.angle){this.reset();changed=true;}
  if(this.last!==null&&(time-this.last>ROD.gap||time<this.last)){this.reset();changed=true;}
  const dt=this.last===null?16:time-this.last;this.last=time;this.angle=screenAngle;const raw=rodAngles(beta,gamma);
  if(!this.base){
   const first=this.samples[0],prev=this.samples.at(-1);if(prev&&(Math.abs(raw.pitch-prev.pitch)>1.5||Math.abs(wrap(raw.roll-prev.roll))>1.5||Math.abs(raw.pitch-first.pitch)>ROD.jitter||Math.abs(wrap(raw.roll-first.roll))>ROD.jitter))this.samples=[];
   this.samples.push({...raw,t:time});const elapsed=time-this.samples[0].t;this.progress=Math.min(1,elapsed/ROD.still);
   if(elapsed<ROD.still||this.samples.length<ROD.minSamples)return {ready:false,progress:this.progress,changed,pitch:0,roll:0,raw:{pitch:0,roll:0}};
   const n=this.samples.length;this.base={pitch:this.samples.reduce((s,p)=>s+p.pitch,0)/n,roll:this.samples.reduce((s,p)=>s+p.roll,0)/n};this.samples=[];this.filtered={pitch:0,roll:0};
  }
  const rel={pitch:raw.pitch-this.base.pitch,roll:wrap(raw.roll-this.base.roll)},a=1-Math.exp(-Math.min(dt,100)/ROD.filter);
  this.filtered.pitch+=(rel.pitch-this.filtered.pitch)*a;this.filtered.roll+=(rel.roll-this.filtered.roll)*a;
  const dz=v=>Math.abs(v)<ROD.dead?0:v-Math.sign(v)*ROD.dead;
  return {ready:true,progress:1,changed,pitch:dz(this.filtered.pitch),roll:dz(this.filtered.roll),raw:rel};
 }
}
export class CastDetector {
 constructor(){this.armed=false;this.reset();}
 arm(){this.armed=true;this.done=false;this.reset();}
 disarm(){this.armed=false;this.reset();}
 reset(){this.state='idle';this.base=null;this.aimRoll=null;this.peak=null;this.backAt=0;this.fwdAt=0;this.fwdFrom=0;this.rollFrom=0;this.prev=null;}
 // 输入未滤波的相对角度（raw.pitch / raw.roll）与时间（毫秒）。返回 null、{reject} 或 {power, dir, amplitude, speed, duration}。
 sample(pitch,roll,time){
  if(!this.armed||this.done||![pitch,roll,time].every(Number.isFinite))return null;const C=ROD.cast,prev=this.prev;this.prev={pitch,roll,time};
  if(prev&&time-prev.time>C.gap){const was=this.state;this.reset();this.prev={pitch,roll,time};return was==='idle'?null:{reject:'gap'};}
  const rate=prev?(pitch-prev.pitch)/Math.max(1,time-prev.time)*1000:0;
  // 0.28.1：瞄准取后引前、竿还在起点附近（3° 内）时最近一段的左右倾（平滑），不再停在“最低点”那一刻的随机读数。
  if(this.state==='idle'){if(this.base===null||pitch<this.base)this.base=pitch;if(pitch-this.base<=3)this.aimRoll=this.aimRoll===null?roll:this.aimRoll+(roll-this.aimRoll)*.35;if(pitch-this.base>=C.back){this.state='back';this.backAt=time;this.peak=pitch;}return null;}
  if(this.state==='back'){
   this.peak=Math.max(this.peak,pitch);
   if(rate<=-C.forwardRate){this.state='forward';this.fwdAt=prev.time;this.fwdFrom=this.peak;this.rollFrom=prev.roll;return null;}
   if(time-this.backAt>C.maxTime){this.reset();this.base=pitch;return {reject:'slow'};}
   if(pitch<=this.base+C.back*.4){this.reset();this.base=pitch;return {reject:'weak'};}
   return null;
  }
  // forward：下压结束（速度回落或压到起点以下 10°）时结算。
  if(rate>-40||pitch<=this.base-10){
   const amplitude=clamp(this.peak-this.base,0,C.backMax),travel=this.fwdFrom-pitch,duration=Math.max(.05,(time-this.fwdAt)/1000),speed=travel/duration,total=time-this.backAt;
   const result={amplitude,speed,duration,total};this.lastAim=this.aimRoll;this.reset();
   if(travel<C.back*.8)return {...result,reject:'short'};
   if(speed<C.speedMin)return {...result,reject:'weak'};
   if(total<C.minTime||total>C.maxTime)return {...result,reject:total<C.minTime?'fast':'slow'};
   const a=clamp((amplitude-C.back)/(C.backMax-C.back),0,1),s=clamp((speed-C.speedMin)/(C.speedMax-C.speedMin),0,1);
   this.done=true;return {...result,aimRoll:this.lastAim,power:Math.round(clamp(.4*a+.6*s,0,1)*1000)/1000,dir:clamp(wrap(roll-this.rollFrom)*C.dirGain,-C.dirMax,C.dirMax)};
  }
  return null;
 }
}
export const REJECT_TEXT=Object.freeze({gap:'传感器数据断了一下，再挥一次',slow:'动作太慢了：先后引，再快速向前挥',fast:'动作太短了：先把竿往后抬起来',short:'前挥幅度太小了',weak:'前挥再快一点'});
