// 个人适配与持续学习：每位“球手 × 手机”的类别原型、力度映射、动作幅度校准，以及融合推理与头部在线微调。
import {CLASSES,SWING_CLASSES,LEVELS,POSES,normalizeLabel,powerLevel} from './labels.js';
import {encode,head,softmax,mapProbs} from './net.js';
import {trainModel} from './train.js';

const RECENT=300,EMA=.1,TAU=.5,MIN_PROTO=3,KEEP=40;
const quantile=(sorted,q)=>{if(!sorted.length)return NaN;const p=(sorted.length-1)*q,i=Math.floor(p),f=p-i;return sorted[i]+(sorted[Math.min(sorted.length-1,i+1)]-sorted[i])*f;};
const median=v=>quantile([...v].sort((a,b)=>a-b),.5);
const finite=v=>Array.isArray(v)?v.filter(Number.isFinite):[];
export const powerKey=p=>(Math.round(p*100)/100).toFixed(2);
// 旧版（轻中重）力度锚点在旧模型下的目标值。
const OLD_TIER_POWER={light:.25,mid:.55,heavy:.9};
export function emptyProfile(key){return {key,prototypes:{},power:Object.fromEntries(SWING_CLASSES.map(c=>[c,{recent:[],anchors:{}}])),motion:{swing:{},putt:{},poses:Object.fromEntries(Object.keys(POSES).map(p=>[p,[]]))},seen:0,accepted:0,updatedAt:null};}
export function normalizeProfile(data,key){
 const base=emptyProfile(key||data?.key);if(!data)return base;
 for(const [c,p] of Object.entries(data.prototypes||{})){const [name,b]=c.split('@'),k=normalizeLabel(name),key=b&&['lo','hi'].includes(b)?`${k}@${b}`:k;if(k&&p&&Array.isArray(p.v)&&p.v.every(Number.isFinite)&&!(base.prototypes[key]&&base.prototypes[key].n>=(Number(p.n)||0)))base.prototypes[key]={v:p.v.slice(0,64),n:Number(p.n)||0};}
 for(const [c,p] of Object.entries(data.power||{})){
  const k=normalizeLabel(c);if(!SWING_CLASSES.includes(k)||!p||(c==='partial'&&data.power.full))continue;const target=base.power[k];
  target.recent=finite(p.recent).slice(-RECENT);
  for(const [a,list] of Object.entries(p.anchors||{})){const power=OLD_TIER_POWER[a]??Number(a);if(Number.isFinite(power)&&power>0&&power<=1)target.anchors[powerKey(power)]=finite(list).slice(-KEEP);}
 }
 for(const kind of SWING_CLASSES)for(const [level,list] of Object.entries(data.motion?.[kind]||{}))if(LEVELS.includes(Number(level)))base.motion[kind][level]=finite(list).slice(-KEEP);
 for(const pose of Object.keys(POSES))base.motion.poses[pose]=finite(data.motion?.poses?.[pose]).slice(-KEEP);
 base.seen=Number(data.seen)||0;base.accepted=Number(data.accepted)||0;base.updatedAt=data.updatedAt||null;return base;
}

// 挥杆与推杆按力度分成低 / 高两组原型（20–40% 与 60–100% 的动作形态差别大），类别距离取最近的一组。
export const band=power=>Number.isFinite(power)?(power<=.45?'lo':'hi'):null;
function protoDistance(profile,c,e){let best=Infinity;const keys=[`${c}@lo`,`${c}@hi`].filter(k=>(profile.prototypes[k]?.n||0)>=MIN_PROTO);for(const k of keys.length?keys:[c]){const v=profile.prototypes[k].v;let d=0;for(let i=0;i<e.length;i++)d+=(e[i]-v[i])**2;best=Math.min(best,d);}return best;}
// 原型样本越多，个人原型在融合中的权重越大（全局头权重 0.7 → 0.4）。
export function protoWeight(profile){const ready=CLASSES.every(c=>(profile?.prototypes?.[c]?.n||0)>=MIN_PROTO);if(!ready)return 0;const n=Math.min(...CLASSES.map(c=>profile.prototypes[c].n));return .3+.3*Math.min(1,n/40);}
export function predictWindow(model,profile,x){
 const params=model.params,enc=encode(params,x),out=head(params,enc.h,enc.f),raw=softmax(out.z),global=mapProbs(model.classes||CLASSES,raw),w=protoWeight(profile);
 let logits=CLASSES.map(c=>Math.log(Math.max(1e-9,global[c])));
 if(w>0){const proto=CLASSES.map(c=>-protoDistance(profile,c,out.e)/TAU);logits=logits.map((z,k)=>(1-w)*z+w*proto[k]);}
 const probs=softmax(logits),k=probs.indexOf(Math.max(...probs)),label=CLASSES[k];
 return {label,confidence:probs[k],probs:Object.fromEntries(CLASSES.map((c,i)=>[c,probs[i]])),global,protoWeight:w,s:out.s,power:SWING_CLASSES.includes(label)?powerFromScore(profile,label,out.s):null,e:Array.from(out.e),h:enc.h};
}
// 单调分段线性：各力度档位的分数中位数 → 档位力度；档位不足两档时，用分数分布的 2% / 97% 分位兜底。
export function powerCurve(profile,label){
 const p=profile?.power?.[normalizeLabel(label)];if(!p)return null;const points=[];
 for(const [key,list] of Object.entries(p.anchors||{}))if(list.length>=2)points.push([median(list),Number(key)]);
 if(points.length<2){const sorted=[...p.recent].sort((a,b)=>a-b);if(sorted.length>=8){points.push([quantile(sorted,.02),.05]);points.push([quantile(sorted,.97),1]);}}
 points.sort((a,b)=>a[1]-b[1]||a[0]-b[0]);const mono=[];for(const pt of points){if(!mono.length||(pt[0]>mono.at(-1)[0]+1e-6&&pt[1]>mono.at(-1)[1]))mono.push(pt);}
 return mono.length>=2?mono:null;
}
// 两端按相邻段斜率线性外推，再限制到 [0,1]。
export function powerFromScore(profile,label,s){const curve=powerCurve(profile,label);if(!curve)return null;let i=1;while(i<curve.length-1&&s>curve[i][0])i++;const [x0,y0]=curve[i-1],[x1,y1]=curve[i];return Math.max(0,Math.min(1,y0+(y1-y0)*(s-x0)/Math.max(1e-6,x1-x0)));}

// 动作幅度校准：各档位挥杆的上杆弧度中位数（u = 档位 / 5），加上“动作采样”里停在腰 / 肩 / 顶点的弧度。
export function motionCalibration(profile){
 const m=profile?.motion;if(!m)return null;const out={finish:{}};let any=false;
 for(const kind of SWING_CLASSES){
  const byU=new Map(),add=(u,list)=>{if(!list?.length)return;const key=Math.round(u*100);byU.set(key,[...(byU.get(key)||[]),...list]);};
  for(const level of LEVELS)add(level/5,m[kind]?.[level]);
  if(kind==='swing')for(const [pose,def] of Object.entries(POSES))if(def.u>0)add(def.u,m.poses?.[pose]);
  const pts=[...byU].filter(([,list])=>list.length>=2).map(([u,list])=>[Math.round(median(list)*10)/10,u/100]).sort((a,b)=>a[1]-b[1]);
  if(pts.length){out[kind]=pts;any=true;}
 }
 const fin=finite(m.poses?.finish);if(fin.length>=2){out.finish.swing=Math.round(median(fin));any=true;}
 return any?out:null;
}

// 每个被接受的样本：更新原型（前几次用均值，之后指数平均）、力度分布与动作幅度。
export function observe(profile,{e,label:raw,s,power=null,weight=1,kin=null,pose=null}){
 const label=normalizeLabel(raw);if(!CLASSES.includes(label)||!e)return profile;profile.seen++;profile.accepted++;profile.updatedAt=new Date().toISOString();
 const b=SWING_CLASSES.includes(label)?band(power):null;for(const key of b?[label,`${label}@${b}`]:[label]){const proto=profile.prototypes[key]||(profile.prototypes[key]={v:new Array(e.length).fill(0),n:0}),rate=Math.max(EMA*weight,1/(proto.n+1));for(let i=0;i<e.length;i++)proto.v[i]+=(e[i]-proto.v[i])*rate;proto.n++;}
 if(SWING_CLASSES.includes(label)&&Number.isFinite(s)){const p=profile.power[label];p.recent.push(s);if(p.recent.length>RECENT)p.recent.shift();if(Number.isFinite(power)&&power>0&&power<=1){const key=powerKey(power);(p.anchors[key]??=[]).push(s);if(p.anchors[key].length>KEEP)p.anchors[key].shift();}}
 observeMotion(profile,{label,power,kin,pose});
 return profile;
}
export function observeMotion(profile,{label,power,kin,pose}){
 profile.motion??=emptyProfile(profile.key).motion;const m=profile.motion,push=(list,v)=>{if(!Number.isFinite(v)||v<=0)return;list.push(Math.round(v*10)/10);if(list.length>KEEP)list.shift();};
 if(pose&&POSES[pose]){if(pose==='finish')push(m.poses.finish,kin?.finish);else push(m.poses[pose],kin?.hold??kin?.top);}
 const level=powerLevel(power);if(SWING_CLASSES.includes(label)&&level&&Number.isFinite(kin?.top)&&Math.abs(power-level/5)<.01)push(m[label][level]??=[],kin.top);
}
// 头部在线微调：冻结编码器，只在缓存特征上训练嵌入层和两个输出头，适合每 15 杆运行一次。
export function fineTuneHead(model,items,{epochs=5,lr=1e-3,seed=11}={}){const result=trainModel(items,{epochs,lr,seed,params:model.params,freezeEncoder:true,augmentData:false});return {...model,params:result.params,tunedAt:new Date().toISOString()};}
// 伪标签策略：高置信且与球杆弱标签一致才接受；人工标签总是接受。
export function acceptance(prediction,{label=null,weak=null,threshold=.85}={}){
 if(label)return {accept:true,label,weight:1,reason:'人工标注'};
 if(!prediction)return {accept:false,reason:'尚无模型'};
 if(weak&&prediction.label===weak&&prediction.confidence>=threshold)return {accept:true,label:weak,weight:.5,reason:'高置信且与球杆一致'};
 if(!weak&&prediction.label!=='other'&&prediction.confidence>=.95)return {accept:true,label:prediction.label,weight:.3,reason:'极高置信'};
 return {accept:false,review:true,reason:weak&&prediction.label!==weak?'与球杆判断不一致':'置信度不足'};
}
