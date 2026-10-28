// 手机端 6 轴记录：环形缓冲保存最近 6 秒原始数据；采集模式下自动分段（静止 → 起始 → 录制 → 静止结束）。
// 环形缓冲与流式识别共用 shared/ml/stream.js 中的实现。
export {MotionBuffer as MotionRecorder} from '../shared/ml/stream.js';
// 采集分段：settle（静止 0.5 s）→ ready（等待起始）→ recording（静止 0.45 s 或满 4 s 结束）→ done。
export class TrialSegmenter {
 constructor({onset=50,label='full',still=24,quiet=18,quietMs=450,settleMs=500,maxMs=4000,preRoll=1000,postRoll=150}={}){Object.assign(this,{onset,label,still,quiet,quietMs,settleMs,maxMs,preRoll,postRoll});this.state='settle';this.since=null;this.start=0;this.quietSince=null;this.peak=0;}
 reset(){this.state='settle';this.since=null;this.quietSince=null;this.peak=0;}
 // 返回 {state} 变化或 {segment:{from,to,peak}}；非挥杆动作也可由加速度变化触发。
 sample(time,w,accel){
  const moving=w>this.onset||(this.label==='other'&&Math.abs(accel-9.81)>2.5);
  if(this.state==='settle'){if(w<this.still&&Math.abs(accel-9.81)<1.5){this.since??=time;if(time-this.since>=this.settleMs){this.state='ready';return {state:'ready'};}}else this.since=null;return null;}
  if(this.state==='ready'){if(moving){this.state='recording';this.start=time;this.quietSince=null;this.peak=w;return {state:'recording'};}return null;}
  if(this.state==='recording'){this.peak=Math.max(this.peak,w);const calm=w<this.quiet&&(this.label!=='other'||Math.abs(accel-9.81)<1.2);if(calm){this.quietSince??=time;}else this.quietSince=null;
   const ended=(this.quietSince!==null&&time-this.quietSince>=this.quietMs)||time-this.start>=this.maxMs;
   if(ended){this.state='done';return {segment:{from:this.start-this.preRoll,to:time+this.postRoll,peak:this.peak,duration:time-this.start}};}}
  return null;
 }
}
export function sampleId(){try{return crypto.randomUUID().replace(/-/g,'');}catch{return Date.now().toString(36)+Math.random().toString(36).slice(2,12);}}
export const ML_LABEL_TIPS={full:'完整上杆、下挥、收杆',partial:'半幅上杆，大约到腰或肩，再挥出',putt:'钟摆式小幅推杆，手腕保持稳定',other:'按提示做动作，不要挥杆'};
export const ML_TIER_TEXT={light:'轻力度 · 约三成',mid:'中等力度 · 约六成',heavy:'大力 · 舒适的最大挥幅'};
