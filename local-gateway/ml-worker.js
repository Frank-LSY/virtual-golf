// 后台训练线程：完整训练、头部微调、迁移评估与个人适配重建都在这里运行，不阻塞游戏服务。
import {parentPort,workerData} from 'node:worker_threads';
import {randomBytes} from 'node:crypto';
import {prepare,trainModel,evaluate,splitBySession,centroidBaseline,metricsFrom} from '../shared/ml/train.js';
import {serializeModel,deserializeModel} from '../shared/ml/net.js';
import {FEATURES} from '../shared/ml/signal.js';
import {emptyProfile,predictWindow,observe,fineTuneHead} from '../shared/ml/adapt.js';
import {CLASSES,SWING_CLASSES,STREAM_VERSION} from '../shared/ml/labels.js';
import {streamMetrics,STREAM} from '../shared/ml/stream.js';
import {decodeRecording} from '../shared/ml/codec.js';
import {SwingDetector} from '../shared/swing.js';

const post=m=>parentPort.postMessage(m);
const progress=(stage,value,extra={})=>post({type:'progress',stage,value,...extra});
// 规则识别器在同一份数据上的表现：把原始录音按时间回放进现有状态机，并按触发时刻与真实峰值比较。
function ruleHit(s,rec){const axis={alpha:0,beta:1,gamma:2}[s.ruleAxis||'beta']??1,d=new SwingDetector();for(let i=0;i<rec.n;i++){const h=d.sample(rec.g[i*3+axis],0,rec.t[i]);if(h)return h;}return null;}
export function ruleMetrics(samples,items=null){
 const byId=new Map((items||[]).map(it=>[it.id,it])),r={swings:0,onTime:0,early:0,late:0,missed:0,others:0,falseTrigger:0};let timed=0;
 for(const s of samples){if(!s.label)continue;let rec;try{rec=decodeRecording(s.recording);}catch{continue;}const hit=ruleHit(s,rec),it=byId.get(s.id);
  if(s.label==='other'){r.others++;if(hit)r.falseTrigger++;continue;}
  r.swings++;if(!hit){r.missed++;continue;}if(!it){r.onTime++;continue;}timed++;const dt=hit.time-it.anchorTime;if(dt<-STREAM.matchBefore)r.early++;else if(dt>STREAM.matchAfter)r.late++;else r.onTime++;}
 const rate=(a,b)=>b?a/b:null;
 return {falseTrigger:rate(r.falseTrigger,r.others),missRate:rate(r.missed,r.swings),stream:{...r,onTimeRate:rate(r.onTime,r.swings),earlyRate:rate(r.early,r.swings),missRate:rate(r.missed,r.swings),falseTriggerRate:rate(r.falseTrigger,r.others),timed}};
}
const STREAM_SOURCES=new Set(['collect','adapt']);
// 流式回放只用完整录下动作的样本（引导采集 / 快速适应）；实战录音在触发后不久就截止。
export function streamEntries(items){return items.filter(it=>!it.extra&&it.y!==null&&STREAM_SOURCES.has(it.source)&&it.rec).map(it=>({rec:it.rec,label:it.label,profile:null,anchorTime:it.anchorTime}));}
export function streamCurve(model,entries,thresholds=[.5,.6,.7,.8,.9]){return thresholds.map(threshold=>{const m=streamMetrics(model,entries,{threshold});return {threshold,onTimeRate:m.onTimeRate,detectRate:m.detectRate,earlyRate:m.earlyRate,missRate:m.missRate,falseTriggerRate:m.falseTriggerRate,swings:m.swings,others:m.others};});}
export function rebuildProfiles(model,samples){
 const profiles={},features=model.features||1;for(const s of [...samples].sort((a,b)=>String(a.time).localeCompare(String(b.time)))){if(!s.label)continue;const [item]=prepare([s],{features});if(!item)continue;const key=s.profile||'unknown',profile=profiles[key]||(profiles[key]=emptyProfile(key)),p=predictWindow(model,profile,item.x);observe(profile,{e:p.e,label:s.label,s:p.s,tier:s.tier,weight:s.weight??1});
  // “*” 为所有球手合并的总体映射，新球手或新设备还没有个人映射时使用。
  observe(profiles['*']||(profiles['*']=emptyProfile('*')),{e:p.e,label:s.label,s:p.s,tier:s.tier,weight:s.weight??1});}
 return profiles;
}
function withAdaptation(model,items,profile){return metricsFrom(items.map(it=>{const p=predictWindow(model,profile,it.x);return {item:it,probs:CLASSES.map(c=>p.probs[c]),pred:CLASSES.indexOf(p.label),s:p.s};}));}
// 留一球手：其余数据训练 → 零样本；再用该球手每类前 5 条做原型与头部适配 → 剩余样本评估。
export function transferEvaluation(items,{epochs=20,shots=5,onProgress=()=>{}}={}){
 const byProfile=new Map();for(const it of items.filter(it=>it.y!==null&&!it.extra)){if(!byProfile.has(it.profile))byProfile.set(it.profile,[]);byProfile.get(it.profile).push(it);}
 const results=[];const eligible=[...byProfile].filter(([,list])=>list.length>=12&&new Set(list.map(it=>it.y)).size>=3);
 eligible.forEach(([profile,list],index)=>{
  const others=items.filter(it=>it.y!==null&&it.profile!==profile);if(others.filter(it=>!it.extra).length<30)return;onProgress(index/eligible.length);
  const model={params:trainModel(others,{epochs}).params},support=[],query=[],used=new Map();
  for(const it of list){const n=used.get(it.y)||0;if(n<shots){support.push(it);used.set(it.y,n+1);}else query.push(it);}
  if(query.length<4)return;const zero=evaluate(model.params,query),state=emptyProfile(profile);
  // 先微调头部，再用微调后的嵌入计算个人原型，保证原型与推理处于同一嵌入空间。
  const tuned=fineTuneHead(model,[...others,...support.map(it=>({...it,weight:2}))],{epochs:5});
  for(const it of support){const p=predictWindow(tuned,state,it.x);observe(state,{e:p.e,label:CLASSES[it.y],s:p.s,tier:it.tier===null?null:['light','mid','heavy'][it.tier]});}
  const adapted=withAdaptation(tuned,query,state);
  results.push({profile,zeroShotF1:zero.macroF1,adaptedF1:adapted.macroF1,query:query.length,support:support.length});
 });
 return {profiles:results,zeroShotF1:results.length?results.reduce((s,r)=>s+r.zeroShotF1,0)/results.length:null,adaptedF1:results.length?results.reduce((s,r)=>s+r.adaptedF1,0)/results.length:null};
}
function summary(m){return m&&{count:m.count,accuracy:m.accuracy,macroF1:m.macroF1,falseTrigger:m.falseTrigger,missRate:m.missRate,intensityRho:m.intensityRho,pairOrder:m.pairOrder,confusion:m.confusion,perClass:m.perClass};}

async function run(job){
 const features=job.kind==='head'?(job.model?.features||1):FEATURES,items=job.kind==='rebuild'?[]:prepare(job.samples,{extras:true,features}),labeled=items.filter(it=>it.y!==null&&!it.extra);
 if(job.kind==='full'){
  if(labeled.length<12)throw Error('至少需要 12 条已标注样本才能训练。');
  const classes=new Set(labeled.map(it=>it.y));if(classes.size<2)throw Error('至少需要两类动作才能训练。');
  const epochs=job.epochs||45,{train,val}=splitBySession(items),total=epochs+12;
  const first=trainModel(train,{epochs,seed:job.seed||1,validation:val,onProgress:e=>progress('train',e.epoch/total,{epoch:e.epoch,loss:e.loss,trainAccuracy:e.trainAccuracy,valF1:e.valF1??null})});
  const validation=val.length?evaluate(first.params,val):null,baseline=val.length?centroidBaseline(train,val):null;
  progress('stream',epochs/total);const entries=streamEntries(val),evalModel={params:first.params,features},curve=entries.length?streamCurve(evalModel,entries):[],threshold=job.threshold||STREAM.threshold,stream=entries.length?streamMetrics(evalModel,entries,{threshold}):null;
  // 用全部数据再训练 12 轮，得到最终部署的模型。
  const final=trainModel(items,{epochs:12,lr:1.5e-3,params:first.params,seed:(job.seed||1)+1,onProgress:e=>progress('final',(epochs+e.epoch)/total,{epoch:epochs+e.epoch,loss:e.loss,trainAccuracy:e.trainAccuracy})});
  const model={id:`${new Date().toISOString().replace(/[-:T.Z]/g,'').slice(0,14)}-${randomBytes(2).toString('hex')}`,params:final.params,trainedAt:new Date().toISOString(),samples:labeled.length,kind:'full',stream:STREAM_VERSION,features:FEATURES,metrics:{validation:summary(validation),baseline:summary(baseline),stream,streamCurve:curve,streamThreshold:threshold,rule:entries.length?(h=>({falseTrigger:h.falseTriggerRate,missRate:h.missRate,stream:h}))(streamMetrics(null,entries)):null,legacyRule:ruleMetrics(job.samples.filter(s=>val.some(v=>v.id===s.id)),val),trainCount:train.filter(it=>it.y!==null&&!it.extra).length,extraCount:items.filter(it=>it.extra).length,valCount:val.length,history:first.history.map(h=>({epoch:h.epoch,loss:+h.loss.toFixed(4),valF1:h.valF1??null}))}};
  progress('profiles',1);const profiles=rebuildProfiles(model,job.samples);
  return {model:serializeModel(model),profiles};
 }
 if(job.kind==='head'){
  const base=deserializeModel(job.model);if(labeled.length<4)throw Error('样本不足，无法微调。');
  const tuned=fineTuneHead(base,items,{epochs:job.epochs||5});const model={...tuned,id:`${base.id.split('+')[0]}+${randomBytes(2).toString('hex')}`,trainedAt:new Date().toISOString(),kind:'head',parent:base.id,stream:base.stream||0,features:base.features||1,samples:labeled.length,metrics:{...base.metrics,tunedAt:new Date().toISOString(),tunedOn:labeled.length}};
  return {model:serializeModel(model),profiles:rebuildProfiles(model,job.samples)};
 }
 if(job.kind==='rebuild'){const model=deserializeModel(job.model);return {profiles:rebuildProfiles(model,job.samples)};}
 if(job.kind==='transfer'){return {transfer:transferEvaluation(items,{onProgress:v=>progress('transfer',v)})};}
 throw Error('未知训练任务。');
}
if(parentPort&&workerData){run(workerData).then(result=>post({type:'done',result}),e=>post({type:'error',message:e.message}));}
