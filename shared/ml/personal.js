// 个人迁移（0.23）：每位“球手 × 手机”只保存一个很小的个人输出头（约 2.2 千个参数、序列化后约 12 KB），
// 编码器（卷积部分）全员共用。新手机录 3–5 次挥杆后，冻结编码器，在“自己的挥杆 + 其他球手的回放样本”上
// 微调输出头（迁移训练），再用调整后的嵌入重建这个人的力度映射。
//  · 识别：手机下载共享模型 + 自己的输出头，本机推理，算力和原来一样；服务器按“设备编号 | 姓名”找到对应的头。
//  · 存储：个人头按人单独存盘，内存里只缓存最近使用的少量（见 local-gateway/ml-adapters.js）。
//  · 安全：回放样本里留出一部分做检查；个人头让大家的识别明显变差（F1 降超过 3 个百分点或误触发多 5 个百分点）时不启用，
//    只保留力度映射，避免少量数据把模型带偏。
//  · 共享模型重新完整训练后编码器变了，旧的个人头自动作废，后台按人排队重新迁移。
import {CLASSES,SWING_CLASSES,ADAPT_LEVELS,ADAPT_MIN,levelText} from './labels.js';
import {HEAD_PARAMS} from './net.js';
import {base64ToFloat32,float32ToBase64} from './codec.js';
import {trainModel,evaluate,predictItems} from './train.js';

export const PERSONAL=Object.freeze({
 plan:ADAPT_LEVELS,  // 快速个性化：5 次挥杆，力度档位依次为 100% / 60% / 100% / 40% / 80%
 min:ADAPT_MIN,      // 至少录 3 次即可结束并开始训练
 epochs:40,lr:1e-3,ownWeight:3,replayCap:240,
 tolerance:{f1:.03,falseTrigger:.05},
 retuneEvery:15      // 之后每新增 15 杆被接受的实战挥杆，按人重新迁移一次
});
export const QUICK_PLAN=Object.freeze(PERSONAL.plan.map(level=>Object.freeze({label:'swing',level,prompt:levelText('swing',level)})));

export function serializeHead(params){return Object.fromEntries(HEAD_PARAMS.map(k=>[k,float32ToBase64(params[k])]));}
export function deserializeHead(data,base){
 if(!data||typeof data!=='object')throw Error('个人模型格式无效。');const out={};
 for(const k of HEAD_PARAMS){if(typeof data[k]!=='string')throw Error('个人模型缺少参数：'+k);const v=Float32Array.from(base64ToFloat32(data[k]));if(base&&v.length!==base.params[k].length)throw Error('个人模型与共享模型尺寸不符：'+k);if(!v.every(Number.isFinite))throw Error('个人模型参数无效：'+k);out[k]=v;}
 return out;
}
// 共享编码器 + 个人头：只替换头部数组的引用，不复制编码器参数。
export function withAdapter(model,head,id=null){if(!model||!head)return model;return {...model,params:{...model.params,...head},adapterId:id};}

// 回放样本：其他球手的已标注样本，按类别平衡、每类优先最近的，总数不超过 cap。
export function replaySelection(samples,key,cap=PERSONAL.replayCap){
 const byClass=new Map(CLASSES.map(c=>[c,[]]));
 for(const s of samples)if(s.profile!==key&&s.label&&byClass.has(s.label)&&(s.weight??1)>=.5)byClass.get(s.label).push(s);
 const per=Math.ceil(cap/CLASSES.length),out=[];
 for(const list of byClass.values()){list.sort((a,b)=>String(b.time||'').localeCompare(String(a.time||'')));out.push(...list.slice(0,per));}
 return out.slice(0,cap);
}
const meanTrue=(params,items)=>{if(!items.length)return null;const p=predictItems(params,items);return p.reduce((s,r)=>s+r.probs[r.item.y],0)/p.length;};

// 迁移训练（纯函数，Node 与浏览器通用）：base 为共享模型，own / replay 为 prepare() 后的条目。
export function adaptPersonal(base,own,replay,{epochs=PERSONAL.epochs,lr=PERSONAL.lr,seed=17,onProgress=null}={}){
 const mine=own.filter(it=>it.y!==null&&!it.extra),others=replay.filter(it=>it.y!==null&&!it.extra);
 if(!mine.some(it=>SWING_CLASSES.includes(CLASSES[it.y])))throw Error('还没有这位球手的挥杆样本。');
 const check=[],train=[];others.forEach((it,i)=>(i%5===4?check:train).push(it));
 const classes=new Set(train.map(it=>it.y)),otherClass=CLASSES.indexOf('other');
 const before={own:meanTrue(base.params,mine)};
 // 回放样本不足（缺少非挥杆动作或总数太少）时不训练个人头，只做力度映射。
 if(train.length<12||classes.size<2||!classes.has(otherClass))return {head:null,accepted:false,reason:'其他球手的样本不足，先只做力度映射',metrics:{before,after:null,own:mine.length,replay:others.length}};
 const items=[...train,...mine.map((it,i)=>({...it,id:`own:${it.id}:${i}`,weight:(it.weight??1)*PERSONAL.ownWeight}))];
 const result=trainModel(items,{epochs,lr,seed,params:base.params,freezeEncoder:true,augmentData:false,onProgress});
 const tuned=result.params,head=Object.fromEntries(HEAD_PARAMS.map(k=>[k,tuned[k]]));
 const baseCheck=check.length?evaluate(base.params,check):null,tunedCheck=check.length?evaluate(tuned,check):null;
 const after={own:meanTrue(tuned,mine)};if(baseCheck){before.checkF1=baseCheck.macroF1;before.falseTrigger=baseCheck.falseTrigger;after.checkF1=tunedCheck.macroF1;after.falseTrigger=tunedCheck.falseTrigger;}
 const t=PERSONAL.tolerance,worse=baseCheck&&(tunedCheck.macroF1<baseCheck.macroF1-t.f1||(tunedCheck.falseTrigger??0)>(baseCheck.falseTrigger??0)+t.falseTrigger);
 return {head:worse?null:head,accepted:!worse,reason:worse?'个人头让其他样本的识别变差，未启用':null,metrics:{before,after,own:mine.length,replay:others.length,check:check.length,epochs}};
}
