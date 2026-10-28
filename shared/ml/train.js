// 训练与评估：样本准备、类别平衡交叉熵 + 力度排序损失、按批次划分、留一交叉验证与最近质心基线。
import {CLASSES,TIERS,SWING_CLASSES} from './labels.js';
import {decodeRecording} from './codec.js';
import {resample,findAnchor,windowAt,features,featureVector,WINDOW,FEATURES} from './signal.js';
import {augment} from './augment.js';
import {streamCandidates,anchorNear,STREAM} from './stream.js';
import {createParams,cloneParams,zerosLike,encode,head,headBackward,encoderBackward,softmax,Adam,rng,HEAD_PARAMS} from './net.js';

const sigmoid=x=>1/(1+Math.exp(-x));
// 把存储的样本变成训练条目：解码 → 50 Hz → 锚点 → 未增强窗口；未标注样本 y 为 null。
export function prepareItem(sample,{features=FEATURES}={}){
 const raw=sample.recording||sample.data,rec=raw?.enc?decodeRecording(raw):raw,res=resample(rec);
 const anchor=findAnchor(res,{from:Math.min(res.n-1,20)});const y=CLASSES.indexOf(sample.label);
 return {id:sample.id,profile:sample.profile||'unknown',session:sample.session||sample.sessionId||'default',source:sample.source||'collect',y:y>=0?y:null,label:y>=0?sample.label:null,tier:TIERS.indexOf(sample.tier)>=0?TIERS.indexOf(sample.tier):null,weight:Number.isFinite(sample.weight)?sample.weight:1,res,rec,anchor,anchorTime:rec.t[0]+anchor*1000/res.hz,features,x:windowAt(res,anchor,{features})};
}
// 困难负样本：流式识别在这段录音里也会判断、但不是真正击球峰值的候选（上杆峰、预备晃杆、收杆后的动作），
// 以“非挥杆”训练，让模型学会等到真正的下挥峰再触发。只用于训练，不参与分类指标。
export function streamExtras(item,{max=6,weight=.6}={}){
 if(item.y===null||!item.rec)return [];
 const other=CLASSES.indexOf('other'),t0=item.rec.t[0],skipAfter=Math.round(STREAM.cooldown*item.res.hz/1000),out=[];
 for(const c of streamCandidates(item.rec)){
  const a=anchorNear(item.res,t0,c.time),d=a-item.anchor;
  if(Math.abs(d)<=3)continue;if(item.y!==other&&d>0&&d<=skipAfter)continue;
  out.push({...item,id:`${item.id}#${out.length}`,parent:item.id,y:other,label:'other',tier:null,weight:item.weight*weight,anchor:a,x:windowAt(item.res,a,{features:item.features}),extra:true});
  if(out.length>=max)break;
 }
 return out;
}
export function prepare(samples,{extras=false,features=FEATURES}={}){const out=[];for(const s of samples){try{const it=prepareItem(s,{features});out.push(it);if(extras)out.push(...streamExtras(it));}catch{}}return out;}
function augmentedInput(item,r){
 const tiered=item.tier!==null,res=augment(item.res,r,{tierSafe:tiered}),scale=res.n/item.res.n,anchor=Math.max(0,Math.min(res.n-1,Math.round(item.anchor*scale)+Math.round((r()*2-1)*3)));
 return windowAt(res,findAnchor(res,{from:Math.max(0,anchor-4),to:Math.min(res.n-1,anchor+4)})+Math.round((r()*2-1)*2),{features:item.features});
}
export function classWeights(items){const counts=new Array(CLASSES.length).fill(0);for(const it of items)if(it.y!==null)counts[it.y]+=it.weight;const total=counts.reduce((a,b)=>a+b,0),present=counts.filter(c=>c>0).length||1;return counts.map(c=>c>0?Math.min(4,total/(present*c)):0);}
// 批内成对排序损失：同一球手、同一挥杆类别、档位不同的样本对。
function rankingPairs(batch){const pairs=[];for(let i=0;i<batch.length;i++)for(let j=0;j<batch.length;j++){const a=batch[i],b=batch[j];if(a.tier===null||b.tier===null||a.tier>=b.tier||a.profile!==b.profile||a.y!==b.y||!SWING_CLASSES.includes(CLASSES[a.y]))continue;pairs.push([i,j]);}return pairs;}

export function trainModel(items,{epochs=40,batch=32,lr=3e-3,seed=1,params=null,freezeEncoder=false,rankWeight=.5,augmentData=true,onProgress=null,validation=null,shouldStop=null}={}){
 const train=items.filter(it=>it.y!==null);if(!train.length)throw Error('没有已标注的样本，无法训练。');
 const p=params?cloneParams(params):createParams(seed),names=freezeEncoder?HEAD_PARAMS:Object.keys(p),opt=new Adam(p,{lr,names}),r=rng(seed*31+7),weights=classWeights(train),history=[];
 const cached=freezeEncoder?new Map(train.map(it=>[it.id,encode(p,it.x)])):null;
 for(let epoch=0;epoch<epochs;epoch++){
  const order=train.map((_,i)=>i);for(let i=order.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
  let lossSum=0,rankSum=0,count=0,correct=0;
  for(let start=0;start<order.length;start+=batch){
   const b=order.slice(start,start+batch).map(i=>train[i]),g=zerosLike(p),passes=b.map(it=>{if(freezeEncoder){const c=cached.get(it.id);return {h:c.h,out:head(p,c.h,c.f)};}const x=augmentData?augmentedInput(it,r):it.x,enc=encode(p,x,true);return {enc,h:enc.h,out:head(p,enc.h,enc.f)};});
   const ds=new Float32Array(b.length),pairs=rankingPairs(b);let wsum=0;for(const it of b)wsum+=weights[it.y]*it.weight;wsum||=1;
   for(const [i,j] of pairs){const diff=passes[j].out.s-passes[i].out.s,q=sigmoid(-diff);rankSum+=Math.log1p(Math.exp(-diff));ds[j]-=q*rankWeight/pairs.length;ds[i]+=q*rankWeight/pairs.length;}
   b.forEach((it,k)=>{const pr=softmax(passes[k].out.z),w=weights[it.y]*it.weight/wsum,dz=pr.map((v,c)=>(v-(c===it.y?1:0))*w);lossSum-=Math.log(Math.max(1e-9,pr[it.y]))*weights[it.y]*it.weight;count+=weights[it.y]*it.weight;if(pr.indexOf(Math.max(...pr))===it.y)correct++;
    const dh=headBackward(p,passes[k].h,passes[k].out,dz,ds[k],g);if(!freezeEncoder)encoderBackward(p,passes[k].enc,dh,g);});
   opt.step(g);
   if(shouldStop?.())return {params:p,history,stopped:true};
  }
  const entry={epoch:epoch+1,loss:lossSum/Math.max(1e-9,count),rankLoss:rankSum,trainAccuracy:correct/train.length};
  if(validation?.length&&(epoch===epochs-1||(epoch+1)%5===0))entry.valF1=evaluate(p,validation).macroF1;
  history.push(entry);onProgress?.(entry);
 }
 return {params:p,history};
}

export function predictItems(params,items){return items.map(it=>{const enc=encode(params,it.x),out=head(params,enc.h,enc.f),probs=softmax(out.z);return {item:it,h:enc.h,e:out.e,probs,pred:probs.indexOf(Math.max(...probs)),s:out.s};});}
export function spearman(x,y){const rank=v=>{const idx=v.map((val,i)=>[val,i]).sort((a,b)=>a[0]-b[0]),r=new Array(v.length);for(let i=0;i<idx.length;){let j=i;while(j+1<idx.length&&idx[j+1][0]===idx[i][0])j++;for(let k=i;k<=j;k++)r[idx[k][1]]=(i+j)/2;i=j+1;}return r;};const rx=rank(x),ry=rank(y),mx=rx.reduce((a,b)=>a+b,0)/rx.length,my=ry.reduce((a,b)=>a+b,0)/ry.length;let num=0,dx=0,dy=0;for(let i=0;i<rx.length;i++){num+=(rx[i]-mx)*(ry[i]-my);dx+=(rx[i]-mx)**2;dy+=(ry[i]-my)**2;}return dx&&dy?num/Math.sqrt(dx*dy):0;}
// 指标：混淆矩阵、宏平均 F1、误触发率、漏识别率、力度排序。predictions 可传入融合了个人原型的预测。
export function metricsFrom(predictions){
 const K=CLASSES.length,confusion=Array.from({length:K},()=>new Array(K).fill(0)),labeled=predictions.filter(p=>p.item.y!==null);
 for(const p of labeled)confusion[p.item.y][p.pred]++;
 const perClass=CLASSES.map((name,c)=>{const tp=confusion[c][c],fn=confusion[c].reduce((a,b)=>a+b,0)-tp,fp=confusion.reduce((a,row)=>a+row[c],0)-tp,precision=tp+fp?tp/(tp+fp):0,recall=tp+fn?tp/(tp+fn):0;return {name,support:tp+fn,precision,recall,f1:precision+recall?2*precision*recall/(precision+recall):0};});
 const present=perClass.filter(c=>c.support>0),other=CLASSES.indexOf('other'),others=labeled.filter(p=>p.item.y===other),swings=labeled.filter(p=>p.item.y!==other);
 const groups=new Map();for(const p of labeled)if(p.item.tier!==null&&p.item.y!==other){const k=p.item.profile+'|'+p.item.y;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(p);}
 let rho=0,rhoN=0,pairOk=0,pairN=0;for(const list of groups.values()){if(list.length<4||new Set(list.map(p=>p.item.tier)).size<2)continue;rho+=spearman(list.map(p=>p.s),list.map(p=>p.item.tier))*list.length;rhoN+=list.length;for(const a of list)for(const b of list)if(a.item.tier<b.item.tier){pairN++;if(b.s>a.s)pairOk++;}}
 return {count:labeled.length,accuracy:labeled.length?labeled.filter(p=>p.pred===p.item.y).length/labeled.length:0,macroF1:present.length?present.reduce((s,c)=>s+c.f1,0)/present.length:0,perClass,confusion,falseTrigger:others.length?others.filter(p=>p.pred!==other).length/others.length:null,missRate:swings.length?swings.filter(p=>p.pred===other).length/swings.length:null,intensityRho:rhoN?rho/rhoN:null,pairOrder:pairN?pairOk/pairN:null};
}
export function evaluate(params,items){return metricsFrom(predictItems(params,items));}

// 按采集批次划分验证集；某类只有一个批次时，取该批次最后 20% 的样本。
// 困难负样本跟随它的原始录音：原始录音进入验证集时，这些负样本不参与训练，也不计入分类指标。
export function splitBySession(items,ratio=.2,seed=3){
 const extras=items.filter(it=>it.extra),main=items.filter(it=>!it.extra),out=splitMain(main,ratio,seed),valIds=new Set(out.val.map(it=>it.id));
 return {train:[...out.train,...extras.filter(it=>!valIds.has(it.parent))],val:out.val};
}
function splitMain(items,ratio,seed){
 const r=rng(seed),labeled=items.filter(it=>it.y!==null),train=[],val=[];
 for(let c=0;c<CLASSES.length;c++){const ofClass=labeled.filter(it=>it.y===c);if(!ofClass.length)continue;const sessions=[...new Set(ofClass.map(it=>it.profile+'|'+it.session))];
  if(sessions.length>=3){for(let i=sessions.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[sessions[i],sessions[j]]=[sessions[j],sessions[i]];}const pick=new Set(sessions.slice(0,Math.max(1,Math.round(sessions.length*ratio))));for(const it of ofClass)(pick.has(it.profile+'|'+it.session)?val:train).push(it);}
  else{const cut=Math.floor(ofClass.length*(1-ratio));ofClass.forEach((it,i)=>(i>=cut&&ofClass.length>=5?val:train).push(it));}
 }
 return {train:[...train,...items.filter(it=>it.y===null)],val};
}
// 手工特征最近质心：作为参照基线。
export function centroidBaseline(trainAll,test){
 const train=trainAll.filter(it=>!it.extra);
 const vec=it=>featureVector(features(it.res,it.anchor)),stats=new Map(),all=train.filter(it=>it.y!==null).map(vec);if(!all.length)return null;
 const mean=all[0].map((_,k)=>all.reduce((s,v)=>s+v[k],0)/all.length),std=all[0].map((_,k)=>Math.sqrt(all.reduce((s,v)=>s+(v[k]-mean[k])**2,0)/all.length)||1),norm=v=>v.map((x,k)=>(x-mean[k])/std[k]);
 for(const it of train.filter(it=>it.y!==null)){const v=norm(vec(it));if(!stats.has(it.y))stats.set(it.y,{sum:new Array(v.length).fill(0),n:0});const s=stats.get(it.y);v.forEach((x,k)=>s.sum[k]+=x);s.n++;}
 const centroids=[...stats].map(([y,s])=>({y,c:s.sum.map(x=>x/s.n)}));
 return metricsFrom(test.map(it=>{const v=norm(vec(it));let best=centroids[0],bd=Infinity;for(const c of centroids){const d=c.c.reduce((s,x,k)=>s+(x-v[k])**2,0);if(d<bd){bd=d;best=c;}}const probs=CLASSES.map((_,k)=>k===best.y?1:0);return {item:it,probs,pred:best.y,s:Math.log1p(features(it.res,it.anchor).peak)};}));
}
export {WINDOW};
