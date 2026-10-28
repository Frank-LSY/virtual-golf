import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeRecording,decodeRecording,ENCODING} from '../shared/ml/codec.js';
import {resample,findAnchor,windowAt,quality,swingFrame,attitude,WINDOW,FEATURES} from '../shared/ml/signal.js';
import {createParams,encode,head,headBackward,encoderBackward,zerosLike,softmax,serializeModel,deserializeModel,countParams} from '../shared/ml/net.js';
import {axisAngle,rotate,wristRoll,uniformRotation,principalAxis,gyroBias,rng as arng} from '../shared/ml/augment.js';
import {synthRecording,synthDataset} from '../shared/ml/synthetic.js';
import {prepare,trainModel,evaluate,splitBySession,spearman} from '../shared/ml/train.js';
import {emptyProfile,predictWindow,observe,powerFromScore,powerCurve,acceptance,fineTuneHead,normalizeProfile} from '../shared/ml/adapt.js';
import {CLASSES,weakLabelForClub,profileKey,tierAt} from '../shared/ml/labels.js';
import {MotionRecorder,TrialSegmenter} from '../phone-web/ml-recorder.js';
import {PeakTracker,streamCandidates,StreamDetector,MotionBuffer,replayStream,streamMetrics,streamPower,streamDecision,isSwing,swingTiming,wristRollAngle,STREAM} from '../shared/ml/stream.js';
import {streamExtras} from '../shared/ml/train.js';
import {motionSVG,gripSVG,GRIP_TIPS,GRIPS} from '../shared/ml/illustrations.js';
import {deviceLabel,STREAM_VERSION,SOURCES} from '../shared/ml/labels.js';

test('录音编码往返保持精度，5 秒 100 Hz 仍低于 WebSocket 16 KB 上限',()=>{
 const rec=synthRecording({label:'full',device:{hz:100},seed:3}),enc=encodeRecording(rec),dec=decodeRecording(enc);
 assert.equal(enc.enc,ENCODING);assert.equal(dec.n,rec.n);for(let i=0;i<rec.n;i+=7){assert.ok(Math.abs(dec.g[i*3]-rec.g[i*3])<=.051);assert.ok(Math.abs(dec.a[i*3+1]-rec.a[i*3+1])<=.0026);assert.ok(Math.abs(dec.t[i]-(rec.t[i]-rec.t[0]))<=.5);}
 const long={t:Float64Array.from({length:500},(_,i)=>i*10),g:new Float32Array(1500).fill(800),a:new Float32Array(1500).fill(9.8)};assert.ok(JSON.stringify(encodeRecording(long)).length<14000);
 assert.throws(()=>decodeRecording({...enc,n:enc.n+1}),/长度/);
});

test('统一到 50 Hz 后锚点落在下挥峰值，窗口为 8 通道 × 96 帧',()=>{
 const rec=synthRecording({label:'full',device:{hz:60},seed:5}),res=resample(rec);assert.equal(res.hz,50);assert.ok(Math.abs(res.n-(rec.t.at(-1)-rec.t[0])/20)<2);
 const anchor=findAnchor(res),x=windowAt(res,anchor);assert.equal(x.length,WINDOW.channels*WINDOW.length);
 const L=WINDOW.length;let best=0;for(let i=0;i<L;i++)if(x[3*L+i]>x[3*L+best])best=i;assert.ok(Math.abs(best-(WINDOW.before-1))<=2,'锚点位于窗口末段');
 const q=quality(rec);assert.ok(q.ok&&q.peak>500&&Math.abs(q.hz-60)<3);
});

test('挥杆坐标系使输入与手机朝向无关：任意旋转后窗口几乎不变',()=>{
 const res=resample(synthRecording({label:'full',seed:8})),anchor=findAnchor(res),base=windowAt(res,anchor);
 for(const R of [axisAngle([0,0,1],Math.PI),axisAngle([1,1,0],2.1),axisAngle([.2,-1,.4],-1.3)]){const turned=windowAt(rotate(res,R),anchor);let diff=0,norm=0;for(let i=0;i<base.length;i++){diff+=(base[i]-turned[i])**2;norm+=base[i]**2;}assert.ok(Math.sqrt(diff/norm)<.02,'旋转后差异 '+Math.sqrt(diff/norm));}
 const Rf=swingFrame(res,anchor);assert.ok(Math.abs(Rf[6]**2+Rf[7]**2+Rf[8]**2-1)<1e-6);
});

test('SwingNet 反向传播与数值梯度一致，模型可序列化往返',()=>{
 const p=createParams(5),x=new Float32Array(8*96).map((_,i)=>Math.sin(i*.37)*.5+(i>=288&&i<384?.6:0));
 const loss=pp=>{const e=encode(pp,x),o=head(pp,e.h,e.f),pr=softmax(o.z);return -Math.log(pr[2])+.3*o.s;};
 const enc=encode(p,x,true),out=head(p,enc.h,enc.f),pr=softmax(out.z),g=zerosLike(p);encoderBackward(p,enc,headBackward(p,enc.h,out,pr.map((v,c)=>v-(c===2?1:0)),.3,g),g);
 for(const name of Object.keys(p))for(let t=0;t<4;t++){const i=(t*7919+name.length*31)%p[name].length,old=p[name][i],eps=2e-3;p[name][i]=old+eps;const lp=loss(p);p[name][i]=old-eps;const lm=loss(p);p[name][i]=old;const num=(lp-lm)/(2*eps);assert.ok(Math.abs(num-g[name][i])<2e-3+.05*Math.abs(num),`${name}[${i}] 数值 ${num} 解析 ${g[name][i]}`);}
 assert.ok(countParams(p)<8000);const back=deserializeModel(JSON.parse(JSON.stringify(serializeModel({params:p,id:'t'}))));assert.deepEqual(Array.from(back.params.c1w),Array.from(p.c1w));
 assert.throws(()=>deserializeModel({format:'swingnet-v1',params:{}}),/缺少参数/);
});

test('合成数据上训练：同域验证 F1 ≥ 0.9，力度分数与档位正相关；未见过的人与设备零样本仍可用',()=>{
 const A=synthDataset({profile:'A',seed:1,session:'a1'}).concat(synthDataset({profile:'A',seed:2,session:'a2'})),B=synthDataset({profile:'B',person:{gain:1.25,tempo:.9},device:{hz:100,rotation:axisAngle([1,0,0],.3)},seed:3,session:'b1'});
 const items=prepare([...A,...B]),{train,val}=splitBySession(items);assert.ok(val.length>=10);
 const {params,history}=trainModel(train,{epochs:24});assert.ok(history.at(-1).loss<history[0].loss);
 const m=evaluate(params,val);assert.ok(m.macroF1>=.9,'验证 F1 '+m.macroF1);assert.ok(m.intensityRho>.6,'力度相关 '+m.intensityRho);
 const C=prepare(synthDataset({profile:'C',person:{gain:.8,tempo:1.1},device:{hz:60,rotation:axisAngle([0,0,1],Math.PI)},seed:9}));assert.ok(evaluate(params,C).macroF1>=.75,'旋转 180° 的新设备零样本');
});

test('个人适配：原型与头部微调提升困难新域，力度映射按轻中重单调',()=>{
 const train=prepare(synthDataset({profile:'A',seed:11}).concat(synthDataset({profile:'B',person:{gain:1.2},seed:12,session:'b'})));const model={params:trainModel(train,{epochs:20}).params};
 const hard={gain:.55,tempo:1.35},device={hz:100,rotation:axisAngle([.3,.2,1],2.5)},support=prepare(synthDataset({profile:'D',person:hard,device,seed:21,counts:{full:6,partial:6,putt:6,other:6}})),query=prepare(synthDataset({profile:'D',person:hard,device,seed:22,session:'q',counts:{full:9,partial:9,putt:9,other:9}}));
 const zero=evaluate(model.params,query).macroF1,tuned=fineTuneHead(model,[...train,...support.map(it=>({...it,weight:2}))],{epochs:5}),state=emptyProfile('D');
 for(const it of support){const p=predictWindow(tuned,state,it.x);observe(state,{e:p.e,label:CLASSES[it.y],s:p.s,tier:it.tier===null?null:['light','mid','heavy'][it.tier]});}
 const preds=query.map(it=>predictWindow(tuned,state,it.x)),adapted=preds.filter((p,i)=>p.label===CLASSES[query[i].y]).length/query.length;
 assert.ok(adapted>=Math.min(.95,zero+.05)||adapted>=.95,`零样本 ${zero.toFixed(2)} → 适应后准确率 ${adapted.toFixed(2)}`);
 const full=query.map((it,i)=>[it,preds[i]]).filter(([it])=>CLASSES[it.y]==='full'),mean=t=>{const v=full.filter(([it])=>it.tier===t).map(([,p])=>powerFromScore(state,'full',p.s));return v.reduce((a,b)=>a+b,0)/v.length;};
 assert.ok(mean(0)<mean(1)&&mean(1)<mean(2),`轻 ${mean(0)} 中 ${mean(1)} 重 ${mean(2)}`);
 const curve=powerCurve(state,'full');for(let i=1;i<curve.length;i++){assert.ok(curve[i][0]>curve[i-1][0]&&curve[i][1]>curve[i-1][1]);}
 assert.deepEqual(normalizeProfile(JSON.parse(JSON.stringify(state)),'D').power.full.anchors,state.power.full.anchors);
});

test('伪标签策略：人工标签总接受，实战需高置信且与球杆一致；工具函数',()=>{
 assert.equal(acceptance(null,{label:'putt'}).weight,1);assert.equal(acceptance({label:'full',confidence:.9},{weak:'full'}).accept,true);
 assert.equal(acceptance({label:'full',confidence:.9},{weak:'putt'}).review,true);assert.equal(acceptance({label:'full',confidence:.6},{weak:'full'}).accept,false);assert.equal(acceptance({label:'other',confidence:.99},{}).accept,false);
 assert.equal(weakLabelForClub('putter'),'putt');assert.equal(weakLabelForClub('wedge'),null);assert.equal(profileKey('p1',' 小李 '),'p1|小李');assert.deepEqual([0,1,2,3].map(i=>tierAt('cycle',i)),['light','mid','heavy','light']);
 assert.ok(Math.abs(spearman([1,2,3,4],[10,20,30,45])-1)<1e-9);
});

test('手机分段：静止后起始录制、停稳结束；环形缓冲切片带预录并限制点数',()=>{
 const rec=new MotionRecorder(6,120),seg=new TrialSegmenter({onset:50,label:'full'});let t=0,segment=null;const states=[];
 const feed=(w,ms)=>{for(let k=0;k<ms/16;k++){t+=16;rec.push(t,[w,0,0],[0,0,9.81]);const e=seg.sample(t,Math.abs(w),9.81);if(e?.state)states.push(e.state);if(e?.segment)segment=e.segment;}};
 feed(5,700);feed(300,400);feed(5,600);assert.deepEqual(states,['ready','recording']);assert.ok(segment&&segment.peak>=300&&segment.from<segment.to);
 const slice=rec.slice(segment.from,segment.to);assert.ok(slice.n>40&&slice.t[0]>=segment.from);
 const many=new MotionRecorder(6,120);for(let i=0;i<720;i++)many.push(i*8,[1,2,3],[0,0,9.8]);assert.ok(many.slice(0,6000,200).n<=201);
 const other=new TrialSegmenter({onset:30,label:'other'});let fired=false;t=0;for(let k=0;k<40;k++){t+=16;other.sample(t,2,9.81);}for(let k=0;k<10;k++){t+=16;if(other.sample(t,5,13)?.state==='recording')fired=true;}assert.ok(fired,'非挥杆动作可由加速度变化触发');
});

test('流式候选：上杆峰与下挥峰各判断一次，均在峰值后 130 ms；回落下坡不产生候选',()=>{
 const tr=new PeakTracker(),out=[];let t=0;const seg=(from,to,ms)=>{for(let k=0;k<ms/10;k++){t+=10;const v=from+(to-from)*k/(ms/10);const c=tr.push(t,v);if(c)out.push({...c,at:t});}};
 seg(5,300,300);seg(300,20,200);seg(20,800,150);seg(800,100,300);seg(100,5,400);seg(5,5,500);
 assert.equal(out.length,2);assert.ok(out[0].value>250&&out[0].value<310);assert.ok(out[1].value>700);
 for(const c of out)assert.ok(c.at-c.time>=STREAM.evalDelay&&c.at-c.time<STREAM.evalDelay+20);
 const rec=synthRecording({label:'full',tier:'heavy',seed:4}),cands=streamCandidates(rec),res=resample(rec),A=findAnchor(res,{from:20}),tA=rec.t[0]+A*20;
 assert.ok(cands.some(c=>c.time<tA-200),'上杆峰会被判断');assert.ok(cands.some(c=>Math.abs(c.time-tA)<=60),'下挥峰会被判断');
});

test('困难负样本：挥杆录音中下挥峰之前的候选标为非挥杆，冷却期内的收杆候选不使用；验证集录音的负样本不进入训练',()=>{
 const [full]=prepare([{id:'f1',label:'full',tier:'mid',session:'s1',recording:synthRecording({label:'full',seed:6})}]),extras=streamExtras(full);
 assert.ok(extras.length>=1);for(const e of extras){assert.equal(e.label,'other');assert.equal(e.parent,'f1');assert.equal(e.tier,null);assert.ok(e.weight<1);assert.ok(e.anchor<full.anchor-3||e.anchor>full.anchor+Math.round(STREAM.cooldown/20),'负样本锚点 '+e.anchor+' 主锚点 '+full.anchor);}
 const items=prepare(synthDataset({seed:3,session:'a'}).concat(synthDataset({seed:4,session:'b'}),synthDataset({seed:5,session:'c'})),{extras:true}),{train,val}=splitBySession(items);
 const valIds=new Set(val.map(it=>it.id));assert.ok(val.every(it=>!it.extra));assert.ok(!train.some(it=>it.extra&&valIds.has(it.parent)));assert.ok(train.some(it=>it.extra));
});

test('流式识别：加入困难负样本训练后，下挥峰准时触发一次，上杆峰与非挥杆动作不触发；力量与方向辅助函数',()=>{
 const train=prepare(synthDataset({profile:'A',seed:31,session:'t1'}).concat(synthDataset({profile:'A',seed:32,session:'t2'})),{extras:true}),model={params:trainModel(train,{epochs:20}).params,stream:STREAM_VERSION,features:FEATURES};
 const test=prepare(synthDataset({profile:'A',seed:41,session:'q',counts:{full:8,partial:6,putt:6,other:10}}));
 const m=streamMetrics(model,test.map(it=>({rec:it.rec,label:it.label,profile:null,anchorTime:it.anchorTime})),{threshold:.6});
 assert.ok(m.detectRate>=.8,'准时识别 '+JSON.stringify(m));assert.ok(m.earlyRate<=.1,'提前触发 '+m.earlyRate);assert.ok(m.falseTriggerRate<=.2,'误触发 '+m.falseTriggerRate);
 const one=test.find(it=>it.label==='full'),trig=replayStream(model,null,one.rec,{threshold:.6});assert.ok(trig.length<=1,'冷却期内只触发一次');
 const det=new StreamDetector({model,threshold:.6});let res=null;for(let i=0;i<one.rec.n;i++){const r=det.push(one.rec.t[i],[one.rec.g[i*3],one.rec.g[i*3+1],one.rec.g[i*3+2]],[one.rec.a[i*3],one.rec.a[i*3+1],one.rec.a[i*3+2]]);if(r?.kind==='swing'){res=r;break;}}
 if(res){assert.ok(res.decision.label!=='other');assert.ok(Number.isFinite(res.timing.tilt));assert.ok(res.ms<50);}
 const p={label:'putt',confidence:.9,probs:{full:.05,partial:.05,putt:.6,other:.3},global:{full:.05,partial:.05,putt:.9,other:0},s:1};assert.equal(streamDecision(p).label,'putt');assert.equal(isSwing(p,.85),true);assert.equal(isSwing({...p,global:{full:0,partial:0,putt:.4,other:.6}},.5),false);
 const fallback=streamPower('full',0,null,{peak:500});assert.equal(fallback.source,'peak');assert.ok(Math.abs(fallback.power-.5**1.6)<1e-9);assert.ok(streamPower('full',0,null,{peak:1900,gain:1.5}).power<=1);
 const pop=emptyProfile('*');for(const [t,v] of [['light',-1],['mid',0],['heavy',1]])for(let k=0;k<3;k++)observe(pop,{e:[0],label:'full',s:v+k*.01,tier:t});const viaPop=streamPower('full',0,emptyProfile('me'),{fallbackProfile:pop});assert.equal(viaPop.source,'population');assert.ok(Math.abs(viaPop.power-.55)<.05);
});

test('录音附带人、动作与设备：设备名解析；握持图解与动作示范为原创矢量图',()=>{
 assert.equal(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)'),'iPhone · iOS 18.7');assert.equal(deviceLabel(''),'未记录设备');assert.ok(SOURCES.candidate);
 const full=motionSVG('full','heavy'),putt=motionSVG('putt','light');assert.match(full,/^<svg[^>]*--top:128deg/);assert.match(putt,/--top:11deg/);assert.match(motionSVG('other'),/class="sl-fig other"/);assert.match(gripSVG('horizontal'),/屏幕朝向自己/);assert.match(gripSVG(),/上下叠握/);assert.equal(GRIP_TIPS.vertical.length,3);assert.equal(GRIPS.vertical,'竖握');assert.match(motionSVG('full','mid',{grip:'vertical'}),/height="40"/);
 const buf=new MotionBuffer(1,60);for(let i=0;i<200;i++)buf.push(i*16,[i,0,0],[0,0,9.8]);assert.ok(buf.size<=60);assert.equal(buf.latestTime(),199*16);
});

test('姿态解算：恒定角速度积分正确；手腕转动时特征 v2 的窗口变化明显小于 v1，任意握持仍不变',()=>{
 const res={n:51,hz:50,g:new Float32Array(51*3),a:new Float32Array(51*3)};for(let i=0;i<51;i++){res.g[i*3+2]=90;res.a[i*3+2]=9.81;}const R=attitude(res,0,50),last=R.slice(50*9,51*9);
 assert.ok(Math.abs(last[0]-Math.cos(Math.PI/2))<1e-3&&Math.abs(last[3]-1)<1e-3,'绕 z 轴 1 秒转 90°');
 const diff=(x,y)=>{let d=0,n=0;for(let i=0;i<x.length;i++){d+=(x[i]-y[i])**2;n+=x[i]**2;}return Math.sqrt(d/n);};let d1=0,d2=0;
 for(const seed of [8,9,10]){const base=resample(synthRecording({label:'full',seed})),A=findAnchor(base),r=arng(seed);for(let k=0;k<6;k++){const rolled=wristRoll(base,r,{amplitude:60}),A2=findAnchor(rolled,{from:A-4,to:A+4});d1+=diff(windowAt(base,A,{features:1}),windowAt(rolled,A2,{features:1}));d2+=diff(windowAt(base,A),windowAt(rolled,A2));}
  const turned=rotate(base,uniformRotation(r));assert.ok(diff(windowAt(base,A),windowAt(turned,A))<.01,'任意握持不变');}
 assert.ok(d2<d1*.8,`手腕转动的影响：v1 ${(d1/18).toFixed(3)} → v2 ${(d2/18).toFixed(3)}`);
 const still=wristRoll(base8(),arng(1),{angle:30,wobble:0,center:-5});const ref=base8();let sameAccel=true;for(let i=0;i<ref.n*3;i+=17)if(Math.abs(Math.hypot(still.a[i],still.a[i+1]||0)-Math.hypot(ref.a[i],ref.a[i+1]||0))>50)sameAccel=false;assert.ok(sameAccel);
 const g=gyroBias(ref,arng(2),3);assert.ok(Math.abs(g.g[0]-ref.g[0])<=3.0001);
 function base8(){return resample(synthRecording({label:'full',seed:8}));}
});

test('手腕转动角：起杆到击球之间绕杆身的转动可被测量，额外转动 +40° 时测量值相应增加',()=>{
 const res=resample(synthRecording({label:'full',tier:'heavy',seed:12})),A=findAnchor(res,{from:20}),t=swingTiming(res,A);assert.ok(Number.isFinite(t.roll));assert.ok(t.backswingMs>100&&t.downswingMs>40,'上杆 '+t.backswingMs+' 下挥 '+t.downswingMs);
 const n=principalAxis(res),up=[res.a[t.startIndex*3],res.a[t.startIndex*3+1],res.a[t.startIndex*3+2]],ul=Math.hypot(...up),u=up.map(v=>v/ul),d=-(u[0]*n[0]+u[1]*n[1]+u[2]*n[2]);let s=u.map((v,i)=>-v-d*n[i]);const sl=Math.hypot(...s);s=s.map(v=>v/sl);
 const rolled=wristRoll(res,arng(3),{axis:s,angle:40,wobble:0,center:-.3}),A2=findAnchor(rolled,{from:A-4,to:A+4}),t2=swingTiming(rolled,A2);
 assert.ok(t2.roll-t.roll>22&&t2.roll-t.roll<50,`转动角 ${t.roll} → ${t2.roll}`);assert.equal(wristRollAngle(res,0,2),null);
});
