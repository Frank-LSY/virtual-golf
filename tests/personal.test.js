import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {synthDataset,synthRecording} from '../shared/ml/synthetic.js';
import {prepare,trainModel} from '../shared/ml/train.js';
import {FEATURES} from '../shared/ml/signal.js';
import {HEAD_PARAMS,ENCODER_PARAMS,countParams} from '../shared/ml/net.js';
import {chooseThreshold,STREAM} from '../shared/ml/stream.js';
import {adaptPersonal,serializeHead,deserializeHead,withAdapter,replaySelection,PERSONAL,QUICK_PLAN} from '../shared/ml/personal.js';
import {emptyProfile,observe,powerCurve,powerFromScore,predictWindow} from '../shared/ml/adapt.js';
import {ADAPT_PLAN,ADAPT_MIN,STREAM_VERSION} from '../shared/ml/labels.js';
import {axisAngle} from '../shared/ml/augment.js';
import {MLStore,RawRecordings} from '../local-gateway/ml-store.js';
import {AdapterStore} from '../local-gateway/ml-adapters.js';
import {encodeRecording} from '../shared/ml/codec.js';

test('触发置信度按验证结果自动选择：截图中的数据选 80%；并列档位取中间，空曲线退回默认',()=>{
 const curve=[[.5,.73,.2],[.6,.75,.2],[.7,.78,.15],[.8,.78,.15],[.9,.75,.1]].map(([threshold,onTimeRate,falseTriggerRate])=>({threshold,onTimeRate,falseTriggerRate,swings:40,others:20}));
 const c=chooseThreshold(curve);assert.equal(c.threshold,.8);assert.deepEqual(c.candidates,[.7,.8,.9]);assert.ok(Math.abs(c.best-.65)<1e-9);
 // 样本多时并列区间变窄：明显最优的档位直接胜出。
 const many=curve.map(r=>({...r,swings:400,others:200,...(r.threshold===.9?{onTimeRate:.8}:{})}));assert.equal(chooseThreshold(many).threshold,.9);
 const clear=[[.5,.9,.4],[.6,.9,.2],[.7,.88,.05],[.8,.7,.02],[.9,.5,0]].map(([threshold,onTimeRate,falseTriggerRate])=>({threshold,onTimeRate,falseTriggerRate,swings:40,others:20}));assert.equal(chooseThreshold(clear).threshold,.7);
 assert.equal(chooseThreshold([]).threshold,STREAM.threshold);assert.equal(chooseThreshold([]).auto,false);
});

test('快速个性化计划：5 次挥杆（最少 3 次），提示文字含力度档位',()=>{
 assert.equal(ADAPT_PLAN.length,5);assert.equal(ADAPT_MIN,3);assert.deepEqual(QUICK_PLAN.map(s=>s.level),[5,3,5,2,4]);assert.ok(QUICK_PLAN.every(s=>/%/.test(s.prompt)));assert.equal(PERSONAL.min,3);
});

test('个人头很小、编码器共享；序列化往返一致，尺寸不符时拒绝',()=>{
 const items=prepare(synthDataset({profile:'A',seed:5,counts:{swing:6,putt:4,other:6}})),model={id:'m1',params:trainModel(items,{epochs:2}).params,features:FEATURES};
 const headCount=HEAD_PARAMS.reduce((n,k)=>n+model.params[k].length,0),total=countParams(model.params);assert.ok(headCount<2400&&headCount/total<.35,`个人头 ${headCount} / 全模型 ${total} 个参数`);
 const head=Object.fromEntries(HEAD_PARAMS.map(k=>[k,model.params[k].map(v=>v+.01)])),text=serializeHead(head),size=JSON.stringify(text).length;assert.ok(size<14000,`序列化约 ${size} 字节`);
 const back=deserializeHead(text,model);for(const k of HEAD_PARAMS)assert.deepEqual(Array.from(back[k]),Array.from(head[k]));
 const composite=withAdapter(model,back,3);for(const k of ENCODER_PARAMS)assert.equal(composite.params[k],model.params[k],'编码器参数共用同一份内存');for(const k of HEAD_PARAMS)assert.equal(composite.params[k],back[k]);assert.equal(composite.adapterId,3);
 const bad={...text,cw:serializeHead({...head,cw:new Float32Array(5)}).cw};assert.throws(()=>deserializeHead(bad,model),/尺寸不符/);
});

test('回放样本按类别平衡、排除本人，最多 240 条',()=>{
 const pool=[];for(let i=0;i<300;i++)pool.push({id:'a'+i,profile:'A',label:['swing','putt','other'][i%3],time:`2026-10-${String(1+i%28).padStart(2,'0')}`});for(let i=0;i<30;i++)pool.push({id:'b'+i,profile:'B',label:'swing',time:'2026-10-30'});
 const r=replaySelection(pool,'B');assert.ok(r.length<=240);assert.ok(r.every(s=>s.profile!=='B'));const by=l=>r.filter(s=>s.label===l).length;assert.equal(by('swing'),by('other'));assert.equal(by('putt'),80);
});

test('个人迁移：5 次挥杆让新球手的识别把握提升，其他人的识别不变差；回放不足时只做力度映射',()=>{
 // 共享模型只见过 A、C 两人；B 力量更大、节奏更快、握持旋转 —— 典型的“新球手 × 新手机”。
 const base=[...synthDataset({profile:'A',seed:21,session:'a'}),...synthDataset({profile:'C',person:{gain:.9,tempo:.95},seed:22,session:'c'})],items=prepare(base);
 const model={id:'base',params:trainModel(items,{epochs:14,seed:3}).params,features:FEATURES,stream:STREAM_VERSION,classes:['swing','putt','other']};
 const person={gain:1.35,tempo:1.25},device={rotation:axisAngle([0,1,0],.9)};
 const own=prepare(ADAPT_PLAN.map((s,i)=>({id:`B-${i}`,profile:'B',label:'swing',level:s.level,power:s.level/5,source:'adapt',recording:synthRecording({label:'swing',level:s.level,person,device,seed:900+i})})));
 const replay=prepare(replaySelection(base,'B'));
 const r=adaptPersonal(model,own,replay,{epochs:PERSONAL.epochs});
 assert.ok(r.head,'生成个人头：'+r.reason);assert.equal(r.accepted,true);assert.ok(r.metrics.after.own>=r.metrics.before.own,`本人挥杆置信度 ${r.metrics.before.own.toFixed(3)} → ${r.metrics.after.own.toFixed(3)}`);
 assert.ok(r.metrics.after.checkF1>=r.metrics.before.checkF1-PERSONAL.tolerance.f1,'回放检查集不明显变差');
 // 用个人头重建力度映射：5 次挥杆的档位锚点足以形成单调映射，力度随上杆幅度增加。
 const composite=withAdapter(model,r.head),profile=emptyProfile('B');for(const it of own){const p=predictWindow(composite,profile,it.x);observe(profile,{e:p.e,label:'swing',s:p.s,power:it.power});}
 const curve=powerCurve(profile,'swing');assert.ok(curve&&curve.length>=2,'少量样本也能形成力度映射');for(let i=1;i<curve.length;i++)assert.ok(curve[i][0]>curve[i-1][0]&&curve[i][1]>curve[i-1][1]);
 const light=prepare([{id:'q1',label:'swing',power:.4,recording:synthRecording({label:'swing',level:2,person,device,seed:1991})}])[0],full=prepare([{id:'q2',label:'swing',power:1,recording:synthRecording({label:'swing',level:5,person,device,seed:1992})}])[0];
 const pl=powerFromScore(profile,'swing',predictWindow(composite,profile,light.x).s),pf=powerFromScore(profile,'swing',predictWindow(composite,profile,full.x).s);assert.ok(pf>pl,`40% ${pl?.toFixed(2)} < 100% ${pf?.toFixed(2)}`);
 const none=adaptPersonal(model,own,replay.filter(it=>it.label==='swing').slice(0,8));assert.equal(none.head,null);assert.equal(none.accepted,false);assert.match(none.reason,/样本不足/);
 assert.throws(()=>adaptPersonal(model,[],replay),/还没有这位球手的挥杆样本/);
});

test('原始录音按需读取：写盘后不常驻内存，重启只建索引，训练样本只带文件位置',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'swinglink-raw-'));const store=await new MLStore(dir).load();
 for(let i=0;i<80;i++)store.add({id:`r${i}`,time:'2026-10-30T10:00:00.000Z',label:i%2?'swing':'other',profile:'P',status:'labeled'},encodeRecording(synthRecording({label:i%2?'swing':'other',seed:i})));
 assert.equal(store.raw.pending.size,80);await store.flush();assert.equal(store.raw.pending.size,0);assert.ok(store.raw.lru.size<=64,'只缓存最近的录音');
 const samples=store.trainingSamples();assert.equal(samples.length,80);assert.ok(samples.every(s=>s.ref&&!s.recording),'训练样本只带位置');
 const again=await new MLStore(dir).load();assert.equal(again.raw.size,80);assert.equal(again.raw.lru.size,0,'启动时不载入录音内容');assert.deepEqual(again.raw.get('r7'),store.raw.get('r7'));
 const {resolveRecordings}=await import('../local-gateway/ml-worker.js');const resolved=resolveRecordings(again.trainingSamples().slice(0,3),dir);assert.ok(resolved.every(s=>typeof s.recording==='object'||typeof s.recording==='string'));assert.equal(JSON.stringify(resolved[0].recording),JSON.stringify(again.raw.get(resolved[0].id)));
 const rr=new RawRecordings(dir,{cache:2});await rr.index('raw-202610.jsonl');rr.get('r1');rr.get('r2');rr.get('r3');assert.equal(rr.lru.size,2);
});

test('个人头存储：按人单独存盘、内存 LRU 限量，共享模型换代后自动视为过期',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'swinglink-adapters-'));const a=await new AdapterStore(dir,{limit:2}).load();
 const items=prepare(synthDataset({profile:'A',seed:7,counts:{swing:4,putt:2,other:4}})),model={id:'m1',params:trainModel(items,{epochs:1}).params};const head=serializeHead(model.params);
 for(const k of ['p1|甲','p2|乙','p3|丙'])await a.save(k,{modelId:'m1',head,accepted:true,samples:5,metrics:{after:{own:.9}}});
 assert.ok(a.cache.size<=2,'内存里最多缓存 2 个');assert.equal(a.valid('p1|甲','m1'),true);assert.ok(a.head('p1|甲',model).cw instanceof Float32Array);assert.ok(a.cache.size<=2);
 await a.save('p4|丁',{modelId:'m1',head:null,accepted:false,samples:3,reason:'回放样本不足'});assert.equal(a.valid('p4|丁','m1'),false);assert.equal(a.serialized('p4|丁','m1'),null);
 const b=await new AdapterStore(dir).load();assert.equal(b.cache.size,0);assert.equal(b.serialized('p2|乙','m1').cw,head.cw);assert.equal(b.valid('p2|乙','m2'),false,'换代后过期');assert.deepEqual(b.stale('m2').sort(),['p1|甲','p2|乙','p3|丙','p4|丁']);
 const index=JSON.parse(await readFile(path.join(dir,'adapters','index.json'),'utf8'));assert.equal(Object.keys(index).length,4);assert.ok(!JSON.stringify(index).includes(head.cw),'索引里不含参数');
});
