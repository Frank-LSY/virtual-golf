// 流式模型识别：手机在连续的 6 轴数据流里找“候选峰值”，每个峰值后 130 ms 截取窗口交给 SwingNet 判断。
// 同一套候选逻辑也用于训练（困难负样本：上杆峰、预备晃杆、收杆后的动作）和回放评估，保证训练与实际运行一致。
import {resample,findAnchor,windowAt,smooth,referenceSeries,WINDOW} from './signal.js';
import {predictWindow,powerFromScore} from './adapt.js';
import {SWING_CLASSES} from './labels.js';

export const STREAM=Object.freeze({
 evalDelay:130,   // 峰值后等待多久再判断（窗口含峰值后 120 ms）
 minPeak:50,      // 低于此角速度（°/s）的峰值不判断（实测轻推杆峰值约 70°/s 以上）
 resetRatio:.45,  // 角速度回落到峰值的 45% 以下，视为这一段动作结束，可以开始找下一个峰
 maxHold:1500,
 cooldown:1500,   // 识别为挥杆后，冷却时间内不再判断（收杆、回到站位）
 quietLevel:60,quietMs:150,
 history:2000,    // 判断时取峰值前 2 秒
 threshold:.7,    // 默认触发置信度
 matchBefore:250,matchAfter:300 // 回放评估：触发时刻与真实峰值相差在此范围内算“准时”
});

// 环形缓冲：保存最近数秒的原始 6 轴数据，可按时间切片（超长时均匀抽取以控制消息大小）。
export class MotionBuffer {
 constructor(seconds=6,maxHz=120){this.cap=Math.ceil(seconds*maxHz);this.t=new Float64Array(this.cap);this.g=new Float32Array(this.cap*3);this.a=new Float32Array(this.cap*3);this.size=0;this.head=0;}
 push(time,g,a){const i=this.head;this.t[i]=time;this.g[i*3]=g[0];this.g[i*3+1]=g[1];this.g[i*3+2]=g[2];this.a[i*3]=a[0];this.a[i*3+1]=a[1];this.a[i*3+2]=a[2];this.head=(i+1)%this.cap;this.size=Math.min(this.cap,this.size+1);}
 clear(){this.size=0;this.head=0;}
 slice(from,to,maxPoints=560){
  const idx=[];for(let k=0;k<this.size;k++){const i=(this.head-this.size+k+this.cap)%this.cap;if(this.t[i]>=from&&this.t[i]<=to)idx.push(i);}
  const step=idx.length>maxPoints?idx.length/maxPoints:1,pick=[];for(let p=0;p<idx.length;p+=step)pick.push(idx[Math.floor(p)]);
  const n=pick.length,t=new Float64Array(n),g=new Float32Array(n*3),a=new Float32Array(n*3);pick.forEach((i,k)=>{t[k]=this.t[i];for(let c=0;c<3;c++){g[k*3+c]=this.g[i*3+c];a[k*3+c]=this.a[i*3+c];}});
  return {t,g,a,n};
 }
 latestTime(){return this.size?this.t[(this.head-1+this.cap)%this.cap]:0;}
}

// 候选峰值：对 |ω| 做 3 点因果平均；峰值后 evalDelay 内没有更高值即输出一次候选。
// 已判断过的峰值在角速度明显回落后清除；之后要从谷底重新明显上升（而不是下坡上的抖动）才形成新的候选，
// 例如上杆峰被拒后，经过上杆顶点的低谷，下挥峰会再判断一次。
export class PeakTracker {
 constructor(opts={}){this.o={...STREAM,...opts};this.reset();}
 reset(){this.hist=[];this.peak=null;this.low=null;}
 push(t,w){
  const o=this.o;this.hist.push(w);if(this.hist.length>3)this.hist.shift();const v=this.hist.reduce((a,b)=>a+b,0)/this.hist.length;let out=null;
  if(this.peak&&!this.peak.done&&this.peak.v>=o.minPeak&&t-this.peak.t>=o.evalDelay){this.peak.done=true;out={time:this.peak.t,value:this.peak.v};}
  if(this.peak&&(this.peak.done||this.peak.v<o.minPeak)&&(v<this.peak.v*o.resetRatio||t-this.peak.t>o.maxHold)){this.peak=null;this.low=v;}
  if(this.peak){if(v>this.peak.v)this.peak={t,v,done:false};}
  else{this.low=Math.min(this.low??v,v);if(v>this.low+Math.max(8,this.low*.25))this.peak={t,v,done:false};}
  return out;
 }
}
const mag=(g,i)=>Math.hypot(g[i*3],g[i*3+1],g[i*3+2]);
// 一段录音里流式识别会判断的全部候选时刻（不考虑冷却），用于挖掘困难负样本。
export function streamCandidates(rec,opts={}){const tr=new PeakTracker(opts),out=[];for(let i=0;i<rec.n;i++){const c=tr.push(rec.t[i],mag(rec.g,i));if(c)out.push(c);}return out;}
// 把候选时刻对应到 50 Hz 重采样序列上的锚点（在候选附近找平滑 |ω| 最大值）。
export function anchorNear(res,t0,time){const i=Math.round((time-t0)*res.hz/1000);return findAnchor(res,{from:Math.max(0,i-4),to:Math.min(res.n-1,i+3)});}

// 由预测得到力量：先用这个人在这台手机上的力度映射；还没有时用所有球手合并的“总体映射”；都没有时按角速度峰值估算。
const FALLBACK_PEAK={swing:1000,putt:500};
export function streamPower(label,s,profile,{peak=0,fallbackProfile=null,fallbackPeak=null,gain=1}={}){
 const swing=SWING_CLASSES.includes(label),own=swing?powerFromScore(profile,label,s):null,pop=swing&&own===null?powerFromScore(fallbackProfile,label,s):null;
 const source=own!==null?'personal':pop!==null?'population':'peak',base=own??pop??Math.min(1,Math.max(0,peak/(fallbackPeak||FALLBACK_PEAK[label]||800)))**1.6;
 return {power:Math.max(0,Math.min(1,base*gain)),learned:own!==null,source};
}
// 触发判定只看全局输出头：它在训练中见过上杆峰、晃杆等困难负样本；个人原型融合在回放中会把上杆峰
// 拉向推杆 / 切杆原型而提前触发，所以原型只用于数据集复核与伪标签。
export function streamDecision(p){if(!p)return null;const g=p.global||p.probs,label=Object.keys(g).reduce((a,b)=>g[b]>g[a]?b:a);return {label,confidence:g[label],probs:g};}
export function isSwing(p,threshold=STREAM.threshold){const d=streamDecision(p);return !!d&&d.label!=='other'&&d.confidence>=threshold;}

// 从峰值前约 2 秒的数据估计：上杆顶点（下挥前的低谷）、上杆起点、上杆与下挥时长，以及起杆时的手机倾角（供方向使用）。
export function swingTiming(res,anchor){
 const raw=new Float32Array(res.n);for(let i=0;i<res.n;i++)raw[i]=mag(res.g,i);const m=smooth(raw,1),dt=1000/res.hz,peak=m[anchor],lim=Math.max(0,anchor-Math.round(1.8*res.hz));
 let top=anchor;while(top>lim+1&&(m[top-1]<m[top]||m[top]>peak*.5))top--;
 let bp=top;while(bp>lim+1&&m[bp-1]>=m[bp])bp--;
 let start=bp;while(start>lim&&m[start]>Math.max(20,m[bp]*.15))start--;
 const found=top>lim+1;let still=[0,0,0],count=0;const s0=found?start:Math.max(lim,anchor-Math.round(.8*res.hz));
 for(let i=Math.max(0,s0-12);i<=s0;i++){still[0]+=res.a[i*3];still[1]+=res.a[i*3+1];still[2]+=res.a[i*3+2];count++;}
 const tilt=count?Math.atan2(still[1]/count,still[2]/count)*180/Math.PI:0;
 return {peak,backswingMs:found?Math.round((top-start)*dt):null,downswingMs:found?Math.round((anchor-top)*dt):null,tilt,roll:found?wristRollAngle(res,s0,anchor):null,startIndex:s0,topIndex:found?top:null};
}
// 手腕转动角（°）：姿态解算后把角速度分解为“绕挥杆平面法线的挥动”和“绕杆身的转动”，积分起杆到击球之间的杆身转动。
// 杆身方向在起杆时取挥杆平面内朝下的方向，随挥动角一起转动。正值表示杆面相对起杆时向右打开（与左右手无关）。
export function wristRollAngle(res,from,to){
 if(to-from<4)return null;const ser=referenceSeries(res,from,to),L=ser.n,dt=1/ser.hz;let up=[0,0,0];for(let i=0;i<Math.min(3,L);i++)for(let c=0;c<3;c++)up[c]+=ser.a[i*3+c];const ul=Math.hypot(...up);if(ul<1)return null;up=up.map(v=>v/ul);
 const M=[0,0,0,0,0,0,0,0,0];for(let i=0;i<L;i++)for(let a=0;a<3;a++)for(let b=0;b<3;b++)M[a*3+b]+=ser.g[i*3+a]*ser.g[i*3+b];
 let n=[.31,1,.17];for(let k=0;k<40;k++){const v=[M[0]*n[0]+M[1]*n[1]+M[2]*n[2],M[3]*n[0]+M[4]*n[1]+M[5]*n[2],M[6]*n[0]+M[7]*n[1]+M[8]*n[2]],l=Math.hypot(...v);if(l<1e-9)return null;n=v.map(x=>x/l);}
 const last=(L-1)*3;if(ser.g[last]*n[0]+ser.g[last+1]*n[1]+ser.g[last+2]*n[2]<0)n=n.map(x=>-x);
 const d=-(up[0]*n[0]+up[1]*n[1]+up[2]*n[2]);let r0=up.map((v,i)=>-v-d*n[i]);const rl=Math.hypot(...r0);if(rl<.2)return null;r0=r0.map(v=>v/rl);
 const nr=[n[1]*r0[2]-n[2]*r0[1],n[2]*r0[0]-n[0]*r0[2],n[0]*r0[1]-n[1]*r0[0]],k=Math.PI/180;let theta=0,roll=0;
 for(let i=0;i<L-1;i++){const w=[0,1,2].map(c=>(ser.g[i*3+c]+ser.g[i*3+3+c])/2),c=Math.cos(theta),sn=Math.sin(theta),r=[0,1,2].map(j=>r0[j]*c+nr[j]*sn);theta+=(w[0]*n[0]+w[1]*n[1]+w[2]*n[2])*k*dt;roll+=(w[0]*r[0]+w[1]*r[1]+w[2]*r[2])*dt;}
 return Math.round(roll*10)/10;
}

// 免校准规则（没有模型时使用，也作为模型识别的对照）：同一套候选峰值，用挥杆结构判断——
// 有上杆、上杆顶点的低谷、方向相反且更快的下挥；不需要感应轴、满力值或握姿零点。
export const HEURISTIC=Object.freeze({minPeak:120,minPuttPeak:45,puttBelow:300,minBackswing:80,downswing:[40,700],maxBackRatio:1.2,minBackRatio:.2,stillBefore:300,stillLevel:45});
export function heuristicDecision(res,anchor,opts={}){
 const o={...HEURISTIC,...opts},t=swingTiming(res,anchor),peak=t.peak,fail=reason=>({label:'other',confidence:1,probs:{swing:0,putt:0,other:1},reason,timing:t});
 if(t.topIndex===null)return fail('没有上杆');
 const putt=peak<o.puttBelow;if(peak<(putt?o.minPuttPeak:o.minPeak))return fail('动作太轻');
 if(t.backswingMs<o.minBackswing)return fail('上杆太短');if(t.downswingMs<o.downswing[0]||t.downswingMs>o.downswing[1])return fail('下挥节奏不像挥杆');
 const raw=new Float32Array(res.n);for(let i=0;i<res.n;i++)raw[i]=mag(res.g,i);const m=smooth(raw,1);let bp=t.topIndex,bmax=0;for(let i=t.startIndex;i<=t.topIndex;i++)if(m[i]>bmax){bmax=m[i];bp=i;}
 if(bmax>peak*o.maxBackRatio)return fail('上杆比下挥还快');if(bmax<Math.max(30,peak*o.minBackRatio))return fail('没有明显的上杆');
 const n0=Math.max(0,t.startIndex-Math.round(o.stillBefore*res.hz/1000));let pre=0;for(let i=n0;i<=t.startIndex;i++)pre+=raw[i];pre/=Math.max(1,t.startIndex-n0+1);if(pre>o.stillLevel)return fail('上杆前没有站稳');
 const ser=referenceSeries(res,t.startIndex,anchor),bi=bp-t.startIndex,ai=anchor-t.startIndex,dotp=ser.g[bi*3]*ser.g[ai*3]+ser.g[bi*3+1]*ser.g[ai*3+1]+ser.g[bi*3+2]*ser.g[ai*3+2];
 if(dotp>0)return fail('上杆与下挥方向没有反转');
 const label=putt?'putt':'swing';return {label,confidence:1,probs:{swing:label==='swing'?1:0,putt:label==='putt'?1:0,other:0},reason:null,timing:t};
}

// 流式识别器：push 每个传感器样本；判断后返回 {kind:'swing'|'reject', prediction, ...}。
// 有模型时用模型判断；没有模型时用免校准规则。每次判断都附带规则结果（rule），供模型识别时对照。
export class StreamDetector {
 constructor({buffer,model=null,profile=null,threshold=STREAM.threshold,...opts}={}){this.o={...STREAM,...opts};this.buffer=buffer||new MotionBuffer();this.model=model;this.profile=profile;this.threshold=threshold;this.tracker=new PeakTracker(this.o);this.cooldownUntil=0;this.waitQuiet=false;this.quietSince=null;this.last=null;}
 reset(){this.tracker.reset();this.cooldownUntil=0;this.waitQuiet=false;this.quietSince=null;}
 // 调用方已把样本写入 buffer 时传 pushed=true。
 push(t,g,a,pushed=false){
  if(!pushed)this.buffer.push(t,g,a);const w=Math.hypot(g[0],g[1],g[2]);
  if(t<this.cooldownUntil)return null;
  if(this.waitQuiet){if(w<this.o.quietLevel){this.quietSince??=t;if(t-this.quietSince>=this.o.quietMs){this.waitQuiet=false;this.tracker.reset();}}else this.quietSince=null;return null;}
  const c=this.tracker.push(t,w);if(!c||(!this.model&&this.o.heuristic===false))return null;
  const result=this.evaluate(c,t);if(result.kind==='swing'){this.cooldownUntil=t+this.o.cooldown;this.waitQuiet=true;this.quietSince=null;this.tracker.reset();}
  return result;
 }
 evaluate(c,now){
  const clock=()=>globalThis.performance?.now?.()??Date.now(),t0=clock(),rec=this.buffer.slice(c.time-this.o.history,now,400);if(rec.n<8)return {kind:'reject',reason:'数据不足',time:c.time};
  const res=resample(rec),anchor=anchorNear(res,rec.t[0],c.time),rule=heuristicDecision(res,anchor,this.o.rule||{}),timing=rule.timing;
  if(!this.model){const ms=clock()-t0,kind=rule.label!=='other'?'swing':'reject';return this.last={kind,detector:'rule',prediction:{label:rule.label,confidence:1,probs:rule.probs,global:rule.probs,s:0},decision:{label:rule.label,confidence:1,probs:rule.probs},rule,time:c.time,peak:c.value,timing,anchor,ms,decidedAt:now,threshold:this.threshold};}
  const x=windowAt(res,anchor,{features:this.model.features||1}),prediction=predictWindow(this.model,this.profile,x);
  const ms=clock()-t0,decision=streamDecision(prediction),kind=isSwing(prediction,this.threshold)?'swing':'reject';
  return this.last={kind,detector:'model',prediction,decision,rule,time:c.time,peak:c.value,timing,anchor,ms,decidedAt:now,threshold:this.threshold};
 }
}

// 回放：把一段完整录音按时间送入流式识别器，返回所有触发（含冷却）。
export function replayStream(model,profile,rec,opts={}){const det=new StreamDetector({model,profile,...opts}),out=[];for(let i=0;i<rec.n;i++){const r=det.push(rec.t[i],[rec.g[i*3],rec.g[i*3+1],rec.g[i*3+2]],[rec.a[i*3],rec.a[i*3+1],rec.a[i*3+2]]);if(r?.kind==='swing')out.push({time:r.time,label:r.decision.label,confidence:r.decision.confidence,s:r.prediction.s});}return out;}

// 流式指标：对每条有标签的完整录音（引导采集 / 快速适应），比较首个触发与真实峰值。
// 返回 准时（类别正确）、类别错、提前、延后、漏识别、非挥杆误触发。
export function streamMetrics(model,entries,opts={}){
 const o={...STREAM,...opts},r={swings:0,onTime:0,wrongClass:0,early:0,late:0,missed:0,extra:0,others:0,falseTrigger:0};
 for(const {rec,label,profile,anchorTime} of entries){
  const triggers=replayStream(model,profile,rec,o);
  if(label==='other'){r.others++;if(triggers.length)r.falseTrigger++;continue;}
  r.swings++;const first=triggers[0];if(!first){r.missed++;continue;}
  const dt=first.time-anchorTime;if(dt<-o.matchBefore)r.early++;else if(dt>o.matchAfter)r.late++;else if(first.label===label)r.onTime++;else r.wrongClass++;
  if(triggers.length>1)r.extra++;
 }
 const rate=(a,b)=>b?a/b:null;
 return {...r,onTimeRate:rate(r.onTime,r.swings),detectRate:rate(r.onTime+r.wrongClass,r.swings),earlyRate:rate(r.early,r.swings),missRate:rate(r.missed,r.swings),falseTriggerRate:rate(r.falseTrigger,r.others)};
}
// 触发置信度自动选择（0.23）：按验证集流式回放的“准时识别率 − 误触发率”（相当于约登指数）取最优档位；
// 验证样本少时相邻档位只差一两条样本，分数与最优相差不到一条挥杆（至少 2 个百分点）的档位视为并列，取并列档位的中间值，
// 避免每次训练都在两端来回跳。返回所选档位与每档得分，供电脑展示。
export function chooseThreshold(curve,{fallback=STREAM.threshold}={}){
 const rows=(curve||[]).filter(c=>Number.isFinite(c.threshold)&&Number.isFinite(c.onTimeRate)&&Number.isFinite(c.falseTriggerRate)).map(c=>({...c,score:c.onTimeRate-c.falseTriggerRate})).sort((a,b)=>a.threshold-b.threshold);
 if(!rows.length)return {threshold:fallback,score:null,candidates:[],rows:[],auto:false};
 const best=Math.max(...rows.map(r=>r.score)),swings=Math.max(1,...rows.map(r=>r.swings||0)),tol=Math.max(.02,1/swings)+1e-9,cand=rows.filter(r=>r.score>=best-tol);
 const pick=cand[Math.floor(cand.length/2)];
 return {threshold:pick.threshold,score:pick.score,best,tolerance:tol,candidates:cand.map(r=>r.threshold),rows:rows.map(r=>({threshold:r.threshold,onTimeRate:r.onTimeRate,falseTriggerRate:r.falseTriggerRate,score:r.score})),auto:true};
}
