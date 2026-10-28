// 个人适配与持续学习：每位“球手 × 手机”的类别原型、力度映射，以及融合推理与头部在线微调。
import {CLASSES,SWING_CLASSES,TIERS,TIER_ANCHORS} from './labels.js';
import {encode,head,softmax} from './net.js';
import {trainModel} from './train.js';

const RECENT=300,EMA=.1,TAU=.5,MIN_PROTO=3;
const quantile=(sorted,q)=>{if(!sorted.length)return NaN;const p=(sorted.length-1)*q,i=Math.floor(p),f=p-i;return sorted[i]+(sorted[Math.min(sorted.length-1,i+1)]-sorted[i])*f;};
const median=v=>quantile([...v].sort((a,b)=>a-b),.5);
export function emptyProfile(key){return {key,prototypes:{},power:Object.fromEntries(SWING_CLASSES.map(c=>[c,{recent:[],anchors:{light:[],mid:[],heavy:[]}}])),seen:0,accepted:0,updatedAt:null};}
export function normalizeProfile(data,key){const base=emptyProfile(key||data?.key);if(!data)return base;for(const c of CLASSES){const p=data.prototypes?.[c];if(p&&Array.isArray(p.v)&&p.v.every(Number.isFinite))base.prototypes[c]={v:p.v.slice(0,64),n:Number(p.n)||0};}for(const c of SWING_CLASSES){const p=data.power?.[c];if(!p)continue;base.power[c].recent=(p.recent||[]).filter(Number.isFinite).slice(-RECENT);for(const t of TIERS)base.power[c].anchors[t]=(p.anchors?.[t]||[]).filter(Number.isFinite).slice(-40);}base.seen=Number(data.seen)||0;base.accepted=Number(data.accepted)||0;base.updatedAt=data.updatedAt||null;return base;}

// 原型样本越多，个人原型在融合中的权重越大（全局头权重 0.7 → 0.4）。
export function protoWeight(profile){const ready=CLASSES.every(c=>(profile?.prototypes?.[c]?.n||0)>=MIN_PROTO);if(!ready)return 0;const n=Math.min(...CLASSES.map(c=>profile.prototypes[c].n));return .3+.3*Math.min(1,n/40);}
export function predictWindow(model,profile,x){
 const params=model.params,enc=encode(params,x),out=head(params,enc.h,enc.f),global=softmax(out.z),w=protoWeight(profile);let logits=Array.from(out.z);
 if(w>0){const proto=CLASSES.map(c=>{const v=profile.prototypes[c].v;let d=0;for(let i=0;i<out.e.length;i++)d+=(out.e[i]-v[i])**2;return -d/TAU;});logits=logits.map((z,k)=>(1-w)*z+w*proto[k]);}
 const probs=softmax(logits),k=probs.indexOf(Math.max(...probs)),label=CLASSES[k];
 return {label,confidence:probs[k],probs:Object.fromEntries(CLASSES.map((c,i)=>[c,probs[i]])),global:Object.fromEntries(CLASSES.map((c,i)=>[c,global[i]])),protoWeight:w,s:out.s,power:SWING_CLASSES.includes(label)?powerFromScore(profile,label,out.s):null,e:Array.from(out.e),h:enc.h};
}
// 单调分段线性：(下限→5%)、轻/中/重锚点、(上限→100%)；数据不足时返回 null，由调用方沿用规则力量。
export function powerCurve(profile,label){
 const p=profile?.power?.[label];if(!p)return null;const sorted=[...p.recent].sort((a,b)=>a-b),points=[];
 if(sorted.length>=8){points.push([quantile(sorted,.02),.05]);points.push([quantile(sorted,.97),1]);}
 for(const t of TIERS)if(p.anchors[t].length>=2)points.push([median(p.anchors[t]),TIER_ANCHORS[t]]);
 points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const mono=[];for(const pt of points){if(!mono.length||(pt[0]>mono.at(-1)[0]+1e-6&&pt[1]>mono.at(-1)[1]))mono.push(pt);}
 return mono.length>=2?mono:null;
}
// 两端按相邻段斜率线性外推，再限制到 [0,1]。
export function powerFromScore(profile,label,s){const curve=powerCurve(profile,label);if(!curve)return null;let i=1;while(i<curve.length-1&&s>curve[i][0])i++;const [x0,y0]=curve[i-1],[x1,y1]=curve[i];return Math.max(0,Math.min(1,y0+(y1-y0)*(s-x0)/Math.max(1e-6,x1-x0)));}
// 每个被接受的样本：更新原型（前几次用均值，之后指数平均）与力度分布。
export function observe(profile,{e,label,s,tier=null,weight=1}){
 if(!CLASSES.includes(label)||!e)return profile;profile.seen++;profile.accepted++;profile.updatedAt=new Date().toISOString();
 const proto=profile.prototypes[label]||(profile.prototypes[label]={v:new Array(e.length).fill(0),n:0}),rate=Math.max(EMA*weight,1/(proto.n+1));for(let i=0;i<e.length;i++)proto.v[i]+=(e[i]-proto.v[i])*rate;proto.n++;
 if(SWING_CLASSES.includes(label)&&Number.isFinite(s)){const p=profile.power[label];p.recent.push(s);if(p.recent.length>RECENT)p.recent.shift();if(TIERS.includes(tier)){p.anchors[tier].push(s);if(p.anchors[tier].length>40)p.anchors[tier].shift();}}
 return profile;
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
