// 机器学习通道集成测试：手机经 WebSocket 引导采集 → 电脑训练并自动部署 → 实战挥杆影子推理与伪标签 → 每 15 杆在线微调 → 改标与删除。
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {synthRecording} from '../shared/ml/synthetic.js';
import {encodeRecording} from '../shared/ml/codec.js';
import {axisAngle} from '../shared/ml/augment.js';

const base='http://localhost:5199',dataDir=path.resolve('.local/ml-integration-'+Date.now());
await mkdir(dataDir,{recursive:true});
const server=spawn(process.execPath,['local-gateway/server.js'],{env:{...process.env,PORT:'5199',HTTPS_PORT:'8499',SWINGLINK_DATA_DIR:dataDir},stdio:['ignore','pipe','pipe']});
const stop=setTimeout(()=>{server.kill();console.error('ML integration timed out');process.exit(1);},240000);
let screen,phone;
try{
 await new Promise((resolve,reject)=>{server.stdout.on('data',b=>{if(b.toString().includes('本机地址：'))resolve();});server.once('exit',code=>reject(Error('Server exited '+code)));});
 const config=await fetch(base+'/api/config').then(r=>r.json());
 for(const file of ['/shared/ml/net.js','/shared/ml/adapt.js','/phone-web/ml-recorder.js','/screen-web/ml-lab.js','/screen-web/ml-lab.css'])assert.equal((await fetch(base+file)).status,200,file);
 async function connect(role,id){const ws=new WebSocket(`${base.replace('http','ws')}/ws?token=${config.token}`,{origin:base});ws.queue=[];ws.on('message',m=>ws.queue.push(JSON.parse(m)));await once(ws,'open');ws.send(JSON.stringify({type:'hello',role,clientId:id,protocolVersion:1}));return ws;}
 async function wait(ws,predicate,limit=60000){const end=Date.now()+limit;while(Date.now()<end){const i=ws.queue.findIndex(predicate);if(i>=0)return ws.queue.splice(i,1)[0];await new Promise(r=>setTimeout(r,10));}throw Error('Expected message not received: '+predicate);}
 const send=(ws,m)=>ws.send(JSON.stringify(m)),drain=ws=>{ws.queue.length=0;};
 screen=await connect('screen','ml-screen');phone=await connect('phone','ml-phone-1');await wait(phone,m=>m.type==='ready');
 send(screen,{type:'practice_view',active:true});send(screen,{type:'ml_view',active:true});await wait(screen,m=>m.type==='ml_state');
 // 未启用体感时不能开始采集
 send(screen,{type:'ml_session',action:'start',label:'full',tier:'cycle',count:3});assert.match((await wait(screen,m=>m.type==='error')).message,/启用体感/);
 send(phone,{type:'ml_motion',ready:true,hz:60});await new Promise(r=>setTimeout(r,200));
 let n=0;const id=()=>`it${Date.now().toString(36)}${(n++).toString(36).padStart(4,'0')}`;
 async function collect(label,count,person,device={hz:60},gain=1){
  drain(phone);send(screen,{type:'ml_session',action:'start',label,tier:'cycle',count,person});
  for(let i=0;i<count;i++){const trial=(await wait(phone,m=>m.type==='ml_collect'&&m.active&&m.session.index===i)).session;assert.equal(trial.label,label);assert.equal(trial.person,person);
   const rec=synthRecording({label,tier:trial.tier||'mid',person:{gain,tempo:1},device,seed:1000+n*17});send(phone,{type:'ml_sample',id:id(),source:'collect',sessionId:trial.id,trialIndex:trial.index,recording:encodeRecording(rec),device:{ua:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)',name:'测试 iPhone'}});
   const ack=await wait(phone,m=>m.type==='ml_sample_ack');assert.equal(ack.ok,true,ack.reason);assert.equal(ack.label,label);}
  await wait(phone,m=>m.type==='ml_collect'&&!m.active);
 }
 // 采集进度过期的上传会被拒绝
 drain(phone);send(screen,{type:'ml_session',action:'start',label:'putt',tier:'light',count:2,person:'小李'});const t0=(await wait(phone,m=>m.type==='ml_collect'&&m.active)).session;
 send(phone,{type:'ml_sample',id:id(),source:'collect',sessionId:t0.id,trialIndex:5,recording:encodeRecording(synthRecording({label:'putt',seed:1}))});assert.equal((await wait(phone,m=>m.type==='ml_sample_ack')).ok,false);
 send(phone,{type:'ml_sample',id:id(),source:'collect',sessionId:t0.id,trialIndex:0,recording:encodeRecording(synthRecording({label:'putt',tier:'light',seed:2}))});assert.equal((await wait(phone,m=>m.type==='ml_sample_ack')).ok,true);
 send(phone,{type:'ml_session',action:'undo'});const back=await wait(phone,m=>m.type==='ml_collect'&&m.active&&m.session.index===0);assert.equal(back.session.index,0);send(screen,{type:'ml_session',action:'stop'});await wait(phone,m=>m.type==='ml_collect'&&!m.active);
 for(const [label,count] of [['full',12],['partial',9],['putt',9],['other',12]])await collect(label,count,'小李');
 for(const [label,count] of [['full',6],['putt',6],['other',6],['partial',6]])await collect(label,count,'阿杰',{hz:100,rotation:axisAngle([0,0,1],Math.PI)},1.2);
 drain(screen);send(screen,{type:'ml_list',profile:'ml-phone-1|小李'});const list=await wait(screen,m=>m.type==='ml_list');assert.equal(list.total,42);assert.ok(list.samples[0].spark.length===48);
 const detail=(send(screen,{type:'ml_detail',id:list.samples[0].id}),await wait(screen,m=>m.type==='ml_detail'));assert.ok(detail.g.length===detail.n*3&&detail.window[1]>detail.window[0]);
 // 完整训练：后台线程，首次训练自动部署并下发到手机
 drain(phone);send(screen,{type:'ml_train',kind:'full',epochs:24});
 const done=await wait(screen,m=>m.type==='ml_state'&&m.job?.finished,200000);assert.equal(done.job.error,null);assert.ok(done.current);const metrics=done.models[0].metrics;assert.ok(metrics.validation.macroF1>.7,'验证集宏平均 F1 '+metrics.validation.macroF1);assert.ok(metrics.rule&&metrics.baseline);
 const deployed=await wait(phone,m=>m.type==='ml_model'&&m.model);assert.equal(deployed.model.format,'swingnet-v1');
 const rebuilt=done.profiles.find(p=>p.key==='ml-phone-1|小李');assert.ok(rebuilt.adaptation.prototypes.full>=10);assert.ok(rebuilt.adaptation.curves.full);assert.equal(rebuilt.deviceName,'测试 iPhone');
 assert.equal(done.models[0].stream,1,'新训练的模型支持流式识别');assert.ok(done.models[0].metrics.stream?.onTimeRate>=.6,'流式回放准时识别 '+done.models[0].metrics.stream?.onTimeRate);assert.equal(done.readiness.checks.find(c=>c.key==='features').ok,true,'新模型含姿态解算特征');assert.equal(done.settings.detector,'model');assert.ok(done.readiness.available);assert.equal(deployed.settings.detector,'model');
 await new Promise(r=>setTimeout(r,700));const saved=JSON.parse(await readFile(path.join(dataDir,'ml','index.json'),'utf8'));assert.equal(saved.current,done.current);
 // 实战挥杆：影子推理 + 球杆弱标签 → 伪标签；累计 15 杆触发头部在线微调
 send(phone,{type:'player_profile',name:'小李',style:'sage'});await wait(phone,m=>m.type==='player_identity');
 let pseudo=0;for(let i=0;i<16;i++){const club=['driver','putter','chip','iron'][i%4],label={driver:'full',putter:'putt',chip:'partial',iron:'full'}[club];send(phone,{type:'ml_sample',id:id(),source:'play',seq:i+1,recording:encodeRecording(synthRecording({label,tier:['light','mid','heavy'][i%3],seed:5000+i})),rule:{triggered:true,power:.5,dir:0,peak:400,axis:'beta'},context:{mode:'play',scope:'round',clubId:club}});const ack=await wait(phone,m=>m.type==='ml_sample_ack'&&m.source==='play');assert.ok(ack.prediction);if(ack.status==='pseudo')pseudo++;}
 assert.ok(pseudo>=10,'高置信且与球杆一致的实战挥杆被接受为伪标签：'+pseudo);
 const tuned=await wait(screen,m=>m.type==='ml_state'&&m.job?.kind==='head'&&m.job.finished,120000);assert.equal(tuned.job.error,null);assert.ok(tuned.current.includes('+'),'在线微调生成新版本');assert.equal(tuned.online.acceptedSinceTune,0);
 // 模型识别：手机免校准就绪；模型触发的挥杆被训练场接受并记录识别方式；待定动作进入复核；开关可从手机与电脑切换
 send(phone,{type:'ml_status',detector:'model',reason:'',modelId:tuned.current,device:{name:'测试 iPhone'}});send(phone,{type:'calibrated',version:'0.1.0',peakMax:600,dirZero:0,axis:'beta',noise:0,auto:true,mode:'model'});await new Promise(r=>setTimeout(r,200));
 drain(phone);send(phone,{type:'test_swing',power:.62,dir:.05,peak:700,seq:9001,stateVersion:0,clientTime:Date.now(),path:['MODEL','full'],backswingMs:600,downswingMs:240,detector:'model',ml:{label:'full',confidence:.93,learned:true,modelId:tuned.current}});
 const swingAck=await wait(phone,m=>m.type==='practice_rehearsal_ack'||m.type==='practice_ack');assert.equal(swingAck.detector,'model');assert.equal(swingAck.ml.label,'full');
 send(phone,{type:'ml_sample',id:id(),source:'candidate',detector:'model',recording:encodeRecording(synthRecording({label:'partial',seed:4242})),rule:{triggered:true,power:.3,dir:0,peak:200,axis:'beta'},stream:{reason:'rule',label:'other',confidence:.7},context:{mode:'practice',scope:'practice',clubId:'chip',armed:true},device:{ua:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)',name:'测试 iPhone'}});
 const candAck=await wait(phone,m=>m.type==='ml_sample_ack'&&m.source==='candidate');assert.equal(candAck.ok,true,candAck.reason);assert.equal(candAck.status,'review');
 drain(phone);drain(screen);send(phone,{type:'ml_detector',detector:'rule'});assert.equal((await wait(phone,m=>m.type==='ml_settings')).settings.detector,'rule');
 const viewState=await wait(screen,m=>m.type==='ml_state'&&m.settings.detector==='rule'&&m.phones?.some(p=>p.deviceName==='测试 iPhone'));assert.equal(viewState.phones[0].calibrationMode,'model');assert.equal(viewState.phones[0].detector,'model');assert.ok(viewState.shadow.model.ruleOnly>=1);
 send(screen,{type:'ml_settings',detector:'model',threshold:.8});const st2=await wait(phone,m=>m.type==='ml_settings'&&m.settings.threshold===.8);assert.equal(st2.settings.detector,'model');
 drain(phone);send(phone,{type:'ml_session',action:'start',mode:'collect',label:'putt',tier:'cycle',count:2,person:'小李'});const phoneSession=await wait(phone,m=>m.type==='ml_collect'&&m.active);assert.equal(phoneSession.session.label,'putt');send(phone,{type:'ml_session',action:'stop'});await wait(phone,m=>m.type==='ml_collect'&&!m.active);
 // 采集可暂停、继续、跳过；电脑可替手机确认待定动作；结束后保留本组统计
 drain(phone);drain(screen);send(screen,{type:'ml_session',action:'start',mode:'collect',label:'full',tier:'cycle',count:3,person:'小李'});await wait(phone,m=>m.type==='ml_collect'&&m.active);
 send(phone,{type:'ml_session',action:'pause'});assert.equal((await wait(phone,m=>m.type==='ml_collect'&&m.active&&m.session.paused)).session.paused,true);
 send(screen,{type:'ml_session',action:'resume'});await wait(phone,m=>m.type==='ml_collect'&&m.active&&!m.session.paused);
 send(phone,{type:'ml_trial_state',state:'review',reason:'没有上杆'});assert.equal((await wait(screen,m=>m.type==='ml_state'&&m.phoneState==='review')).phoneReason,'没有上杆');
 send(screen,{type:'ml_session',action:'review',decision:'discard'});assert.equal((await wait(phone,m=>m.type==='ml_review')).decision,'discard');send(phone,{type:'ml_trial_state',state:'settle',discarded:true});
 send(screen,{type:'ml_session',action:'skip'});const skipped=(await wait(phone,m=>m.type==='ml_collect'&&m.active&&m.session.index===1)).session;assert.equal(skipped.stats.skipped,1);assert.equal(skipped.stats.discarded,1);
 send(phone,{type:'ml_session',action:'stop'});assert.equal((await wait(screen,m=>m.type==='ml_state'&&!m.session&&m.lastSummary)).lastSummary.skipped,1);
 // 误触发反馈改标为非挥杆
 const last=tuned.recent.find(s=>s.source==='play');send(phone,{type:'ml_feedback',id:last.id,feeling:'误触发'});await new Promise(r=>setTimeout(r,300));drain(screen);send(screen,{type:'ml_list',source:'play'});const plays=await wait(screen,m=>m.type==='ml_list');assert.equal(plays.samples.find(s=>s.id===last.id).label,'other');
 // 电脑改标与删除
 send(screen,{type:'ml_update',id:list.samples[1].id,label:'partial',tier:'mid'});send(screen,{type:'ml_update',id:list.samples[2].id,deleted:true});await new Promise(r=>setTimeout(r,800));drain(screen);send(screen,{type:'ml_list',profile:'ml-phone-1|小李',source:'collect'});const after=await wait(screen,m=>m.type==='ml_list');assert.equal(after.total,41);assert.equal(after.samples.find(s=>s.id===list.samples[1].id).label,'partial');
 send(phone,{type:'ml_update',id:list.samples[1].id,deleted:true});assert.match((await wait(phone,m=>m.type==='error')).message,/电脑/);
 console.log('PASS: 引导采集与进度校验、撤销、两名球手两台设备、后台完整训练（含流式回放）与自动部署、影子推理与伪标签、15 杆在线微调、模型识别免校准击球、待定动作、识别方式开关、手机发起采集、暂停 / 跳过 / 远程确认、误触发改标、电脑改标与删除。验证 F1',metrics.validation.macroF1.toFixed(3),'流式准时',metrics.stream?.onTimeRate?.toFixed(3));
}finally{clearTimeout(stop);screen?.close();phone?.close();server.kill();}
