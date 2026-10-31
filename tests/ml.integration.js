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
 send(screen,{type:'ml_session',action:'start',label:'swing',level:'ladder',count:3});assert.match((await wait(screen,m=>m.type==='error')).message,/启用体感/);
 send(phone,{type:'ml_motion',ready:true,hz:60});await new Promise(r=>setTimeout(r,200));
 let n=0;const id=()=>`it${Date.now().toString(36)}${(n++).toString(36).padStart(4,'0')}`;
 async function collect(label,count,person,device={hz:60},gain=1){
  drain(phone);send(screen,{type:'ml_session',action:'start',label,level:'ladder',count,person});
  for(let i=0;i<count;i++){const trial=(await wait(phone,m=>m.type==='ml_collect'&&m.active&&m.session.index===i)).session;assert.equal(trial.label,label);assert.equal(trial.person,person);if(label!=='other'){assert.equal(trial.level,i%5+1,'20%→100% 轮换');assert.match(trial.levelText,/%/);}
   const rec=synthRecording({label,level:trial.level||3,person:{gain,tempo:1},device,seed:1000+n*17});send(phone,{type:'ml_sample',id:id(),source:'collect',sessionId:trial.id,trialIndex:trial.index,recording:encodeRecording(rec),device:{ua:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)',name:'测试 iPhone'}});
   const ack=await wait(phone,m=>m.type==='ml_sample_ack');assert.equal(ack.ok,true,ack.reason);assert.equal(ack.label,label);assert.equal(ack.level,trial.level);if(label==='swing')assert.ok(ack.kin.top>10,'入库时计算上杆弧度');}
  await wait(phone,m=>m.type==='ml_collect'&&!m.active);
 }
 // 采集进度过期的上传会被拒绝
 drain(phone);send(screen,{type:'ml_session',action:'start',label:'putt',level:1,count:2,person:'小李'});const t0=(await wait(phone,m=>m.type==='ml_collect'&&m.active)).session;
 send(phone,{type:'ml_sample',id:id(),source:'collect',sessionId:t0.id,trialIndex:5,recording:encodeRecording(synthRecording({label:'putt',seed:1}))});assert.equal((await wait(phone,m=>m.type==='ml_sample_ack')).ok,false);
 send(phone,{type:'ml_sample',id:id(),source:'collect',sessionId:t0.id,trialIndex:0,recording:encodeRecording(synthRecording({label:'putt',level:1,seed:2}))});assert.equal((await wait(phone,m=>m.type==='ml_sample_ack')).ok,true);
 send(phone,{type:'ml_session',action:'undo'});const back=await wait(phone,m=>m.type==='ml_collect'&&m.active&&m.session.index===0);assert.equal(back.session.index,0);send(screen,{type:'ml_session',action:'stop'});await wait(phone,m=>m.type==='ml_collect'&&!m.active);
 for(const [label,count] of [['swing',15],['putt',10],['other',12]])await collect(label,count,'小李');
 for(const [label,count] of [['swing',10],['putt',5],['other',6]])await collect(label,count,'阿杰',{hz:100,rotation:axisAngle([0,0,1],Math.PI)},1.2);
 // 动作采样：停在腰 / 肩 / 顶点与完整挥杆收杆，入库为非挥杆（停住）或挥杆 100%（收杆），并计算停住弧度
 drain(phone);send(screen,{type:'ml_session',action:'start',mode:'motion',person:'小李'});
 for(let i=0;i<4;i++){const trial=(await wait(phone,m=>m.type==='ml_collect'&&m.active&&m.session.index===i)).session;assert.equal(trial.mode,'motion');assert.equal(trial.count,8);const finish=trial.pose==='finish';
  send(phone,{type:'ml_sample',id:id(),source:'motion',sessionId:trial.id,trialIndex:trial.index,recording:encodeRecording(synthRecording(finish?{label:'swing',level:5,pose:'finish',seed:700+i}:{label:'other',pose:trial.pose,seed:700+i})),device:{ua:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)',name:'测试 iPhone'}});
  const ack=await wait(phone,m=>m.type==='ml_sample_ack');assert.equal(ack.ok,true,ack.reason);assert.equal(ack.pose,trial.pose);assert.equal(ack.label,finish?'swing':'other');if(!finish)assert.ok(ack.kin.hold>10,'停住弧度 '+ack.kin.hold);}
 send(screen,{type:'ml_session',action:'stop'});await wait(phone,m=>m.type==='ml_collect'&&!m.active);
 const cov=await wait(screen,m=>m.type==='ml_state'&&m.profiles.some(p=>p.key==='ml-phone-1|小李'&&p.poses.top>=1));const me=cov.profiles.find(p=>p.key==='ml-phone-1|小李');assert.equal(me.counts.swing.levels[1],3);assert.equal(me.counts.swing.levels[5],4,'含收杆');assert.equal(me.counts.putt.levels[3],2);
 drain(screen);send(screen,{type:'ml_list',profile:'ml-phone-1|小李'});const list=await wait(screen,m=>m.type==='ml_list');assert.equal(list.total,41);assert.ok(list.samples[0].spark.length===48);
 const detail=(send(screen,{type:'ml_detail',id:list.samples[0].id}),await wait(screen,m=>m.type==='ml_detail'));assert.ok(detail.g.length===detail.n*3&&detail.window[1]>detail.window[0]);
 // 完整训练：后台线程，首次训练自动部署并下发到手机
 drain(phone);send(screen,{type:'ml_train',kind:'full',epochs:24});
 const done=await wait(screen,m=>m.type==='ml_state'&&m.job?.finished,200000);assert.equal(done.job.error,null);assert.ok(done.current);const metrics=done.models[0].metrics;assert.ok(metrics.validation.macroF1>.7,'验证集宏平均 F1 '+metrics.validation.macroF1);assert.ok(metrics.rule&&metrics.baseline);
 const deployed=await wait(phone,m=>m.type==='ml_model'&&m.model);assert.equal(deployed.model.format,'swingnet-v1');
 const rebuilt=done.profiles.find(p=>p.key==='ml-phone-1|小李');assert.ok(rebuilt.adaptation.prototypes.swing>=10);assert.ok(rebuilt.adaptation.curves.swing?.length>=4,'5 档力度映射');assert.ok(rebuilt.adaptation.motion?.swing?.length>=4,'动作幅度校准');assert.ok(Number.isFinite(metrics.validation.powerError),'力度误差');assert.ok(metrics.validation.intensityRho>.5,'力度排序 '+metrics.validation.intensityRho);assert.equal(rebuilt.deviceName,'测试 iPhone');
 assert.equal(done.models[0].stream,1,'新训练的模型支持流式识别');assert.ok(done.models[0].metrics.stream?.onTimeRate>=.6,'流式回放准时识别 '+done.models[0].metrics.stream?.onTimeRate);assert.equal(done.readiness.checks.find(c=>c.key==='features').ok,true,'新模型含姿态解算特征');assert.equal(done.settings.detector,'model');assert.ok(done.readiness.available);assert.equal(deployed.settings.detector,'model');
 await new Promise(r=>setTimeout(r,700));const saved=JSON.parse(await readFile(path.join(dataDir,'ml','index.json'),'utf8'));assert.equal(saved.current,done.current);
 // 实战挥杆：影子推理 + 球杆弱标签 → 伪标签；累计 15 杆触发头部在线微调
 send(phone,{type:'player_profile',name:'小李',style:'sage'});await wait(phone,m=>m.type==='player_identity');
 let pseudo=0;for(let i=0;i<16;i++){const club=['driver','putter','chip','iron'][i%4],label=club==='putter'?'putt':'swing';send(phone,{type:'ml_sample',id:id(),source:'play',seq:i+1,recording:encodeRecording(synthRecording({label,level:[2,4,5][i%3],seed:5000+i})),rule:{triggered:true,power:.5,dir:0,peak:400,axis:'beta'},context:{mode:'play',scope:'round',clubId:club}});const ack=await wait(phone,m=>m.type==='ml_sample_ack'&&m.source==='play');assert.ok(ack.prediction);if(ack.status==='pseudo')pseudo++;}
 assert.ok(pseudo>=10,'高置信且与球杆一致的实战挥杆被接受为伪标签：'+pseudo);
 // 0.23：累计 15 杆被接受的实战挥杆后，只为这位球手重新做个人迁移（不再改动共享模型）
 const tuned=await wait(screen,m=>m.type==='ml_state'&&m.job?.kind==='adapt'&&m.job.key==='ml-phone-1|小李'&&m.job.finished,120000);assert.equal(tuned.job.error,null);assert.equal(tuned.current,done.current,'共享模型不变');assert.equal(tuned.online.sinceTune['ml-phone-1|小李'],0);assert.ok(['ready','power'].includes(tuned.profiles.find(p=>p.key==='ml-phone-1|小李').personal.status));
 // 触发置信度跟随验证结果自动选择
 assert.equal(done.settings.thresholdMode,'auto');assert.ok(done.readiness.choice,'记录自动选择依据');assert.equal(done.readiness.choice.auto,done.readiness.curve.some(c=>c.others>0),'验证集没有非挥杆动作时保留默认值');assert.equal(done.settings.threshold,done.readiness.threshold);assert.ok(done.readiness.curve.length===5);
 // 0.23 快速个性化：新手机自己发起，录 3 次即可完成；同时另一台手机的采集不受影响；完成后自动迁移并把个人头下发给这台手机
 const phone2=await connect('phone','ml-phone-2');await wait(phone2,m=>m.type==='ready');send(phone2,{type:'player_profile',name:'小周',style:'coast'});await wait(phone2,m=>m.type==='player_identity');
 const intro=await wait(phone2,m=>m.type==='ml_model'&&m.model);assert.equal(intro.adapter,null);assert.ok(['none','no-model'].includes(intro.personal.status),intro.personal.status);
 send(phone2,{type:'ml_motion',ready:true,hz:60});await new Promise(r=>setTimeout(r,150));drain(phone);drain(phone2);
 send(phone,{type:'ml_session',action:'start',mode:'collect',label:'other',count:2,person:'小李'});send(phone2,{type:'ml_session',action:'start',mode:'adapt'});
 const other1=(await wait(phone,m=>m.type==='ml_collect'&&m.active)).session,quick=(await wait(phone2,m=>m.type==='ml_collect'&&m.active)).session;
 assert.notEqual(other1.id,quick.id,'两台手机各自一组');assert.equal(quick.mode,'adapt');assert.equal(quick.count,5);assert.equal(quick.min,3);assert.equal(quick.person,'小周');assert.equal(quick.canFinish,false);
 let trial=quick;for(let i=0;i<3;i++){if(i)trial=(await wait(phone2,m=>m.type==='ml_collect'&&m.active&&m.session.index===i)).session;assert.equal(trial.label,'swing');
  send(phone2,{type:'ml_sample',id:id(),source:'adapt',sessionId:trial.id,trialIndex:trial.index,recording:encodeRecording(synthRecording({label:'swing',level:trial.level,person:{gain:1.3,tempo:1.2},seed:7700+i})),device:{ua:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)',name:'小周的 iPhone'}});
  const ack=await wait(phone2,m=>m.type==='ml_sample_ack');assert.equal(ack.ok,true,ack.reason);}
 const third=(await wait(phone2,m=>m.type==='ml_collect'&&m.active&&m.session.index===3)).session;assert.equal(third.canFinish,true,'录满 3 次可以完成');
 const busyOther=await wait(screen,m=>m.type==='ml_state'&&m.sessions?.length===2);assert.ok(busyOther.sessions.some(x=>x.person==='小周')&&busyOther.sessions.some(x=>x.person==='小李'));
 send(phone2,{type:'ml_session',action:'finish'});await wait(phone2,m=>m.type==='ml_collect'&&!m.active);
 await wait(phone2,m=>m.type==='ml_personal'&&['queued','training'].includes(m.status));
 const personal=await wait(phone2,m=>m.type==='ml_model'&&['ready','power'].includes(m.personal?.status),120000);
 if(personal.personal.status==='ready'){assert.equal(personal.adapter.modelId,done.current);assert.equal(typeof personal.adapter.head.cw,'string');}else assert.equal(personal.adapter,null);
 assert.equal(personal.personal.samples,3);assert.ok(personal.profile?.power?.swing,'个人力度映射');
 const adapters=JSON.parse(await readFile(path.join(dataDir,'ml','adapters','index.json'),'utf8'));assert.ok(adapters['ml-phone-2|小周'],'个人头按人存盘');assert.equal(adapters['ml-phone-2|小周'].modelId,done.current);
 send(phone,{type:'ml_session',action:'stop'});await wait(phone,m=>m.type==='ml_collect'&&!m.active);phone2.close();
 // 模型识别：手机免校准就绪；模型触发的挥杆被训练场接受并记录识别方式；待定动作进入复核；开关可从手机与电脑切换
 send(phone,{type:'ml_status',detector:'model',reason:'',modelId:tuned.current,device:{name:'测试 iPhone'}});send(phone,{type:'calibrated',version:'0.1.0',peakMax:600,dirZero:0,axis:'beta',noise:0,auto:true,mode:'model'});await new Promise(r=>setTimeout(r,200));
 drain(phone);drain(screen);const kin={t0:1000,dt:40,u:Array.from({length:30},(_,i)=>i<20?i/19:Math.max(-1,1-(i-19)/3)),impactAt:1800,now:2200,top:150,topU:1};send(phone,{type:'test_swing',power:.62,dir:.05,peak:700,seq:9001,stateVersion:0,clientTime:Date.now(),path:['MODEL','swing'],backswingMs:600,downswingMs:240,detector:'model',ml:{label:'swing',confidence:.93,learned:true,modelId:tuned.current},kin});
 const swingAck=await wait(phone,m=>m.type==='practice_rehearsal_ack'||m.type==='practice_ack');assert.equal(swingAck.detector,'model');assert.equal(swingAck.ml.label,'swing');
 const shown=await wait(screen,m=>m.type==='practice_rehearsal'||m.type==='practice_result');assert.equal(shown.kin.u.length,30,'电脑收到真实挥杆轨迹，用于小人回放');assert.equal(shown.kin.impactAt,1800);
 // 小人实时跟随：手机的姿势样本转发给电脑练习室
 send(phone,{type:'sensor_sample',sample:{alpha:1,beta:2,gamma:3,axis:'auto',state:'idle',stage:'ready',tilt:0,hz:60,t:5000,u:.42,arc:61,phase:'back'}});const tele=await wait(screen,m=>m.type==='sensor_sample'&&m.sample.u===.42);assert.equal(tele.sample.phase,'back');assert.equal(tele.sample.t,5000);
 send(phone,{type:'ml_sample',id:id(),source:'candidate',detector:'model',recording:encodeRecording(synthRecording({label:'swing',level:2,seed:4242})),rule:{triggered:true,power:.3,dir:0,peak:200,axis:'beta'},stream:{reason:'rule',label:'other',confidence:.7},context:{mode:'practice',scope:'practice',clubId:'chip',armed:true},device:{ua:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)',name:'测试 iPhone'}});
 const candAck=await wait(phone,m=>m.type==='ml_sample_ack'&&m.source==='candidate');assert.equal(candAck.ok,true,candAck.reason);assert.equal(candAck.status,'review');
 drain(phone);drain(screen);send(phone,{type:'ml_detector',detector:'rule'});assert.equal((await wait(phone,m=>m.type==='ml_settings')).settings.detector,'rule');
 const viewState=await wait(screen,m=>m.type==='ml_state'&&m.settings.detector==='rule'&&m.phones?.some(p=>p.deviceName==='测试 iPhone'));assert.equal(viewState.phones[0].calibrationMode,'model');assert.equal(viewState.phones[0].detector,'model');assert.ok(viewState.shadow.model.ruleOnly>=1);
 send(screen,{type:'ml_settings',detector:'model',threshold:.8});const st2=await wait(phone,m=>m.type==='ml_settings'&&m.settings.threshold===.8);assert.equal(st2.settings.detector,'model');
 drain(phone);send(phone,{type:'ml_session',action:'start',mode:'collect',label:'putt',level:'ladder',count:2,person:'小李'});const phoneSession=await wait(phone,m=>m.type==='ml_collect'&&m.active);assert.equal(phoneSession.session.label,'putt');send(phone,{type:'ml_session',action:'stop'});await wait(phone,m=>m.type==='ml_collect'&&!m.active);
 // 采集可暂停、继续、跳过；电脑可替手机确认待定动作；结束后保留本组统计
 drain(phone);drain(screen);send(screen,{type:'ml_session',action:'start',mode:'collect',label:'swing',level:3,count:3,person:'小李'});await wait(phone,m=>m.type==='ml_collect'&&m.active);
 send(phone,{type:'ml_session',action:'pause'});assert.equal((await wait(phone,m=>m.type==='ml_collect'&&m.active&&m.session.paused)).session.paused,true);
 send(screen,{type:'ml_session',action:'resume'});await wait(phone,m=>m.type==='ml_collect'&&m.active&&!m.session.paused);
 send(phone,{type:'ml_trial_state',state:'review',reason:'没有上杆'});assert.equal((await wait(screen,m=>m.type==='ml_state'&&m.phoneState==='review')).phoneReason,'没有上杆');
 send(screen,{type:'ml_session',action:'review',decision:'discard'});assert.equal((await wait(phone,m=>m.type==='ml_review')).decision,'discard');send(phone,{type:'ml_trial_state',state:'settle',discarded:true});
 send(screen,{type:'ml_session',action:'skip'});const skipped=(await wait(phone,m=>m.type==='ml_collect'&&m.active&&m.session.index===1)).session;assert.equal(skipped.stats.skipped,1);assert.equal(skipped.stats.discarded,1);
 send(phone,{type:'ml_session',action:'stop'});assert.equal((await wait(screen,m=>m.type==='ml_state'&&!m.session&&m.lastSummary)).lastSummary.skipped,1);
 // 误触发反馈改标为非挥杆
 const last=tuned.recent.find(s=>s.source==='play');send(phone,{type:'ml_feedback',id:last.id,feeling:'误触发'});await new Promise(r=>setTimeout(r,300));drain(screen);send(screen,{type:'ml_list',source:'play'});const plays=await wait(screen,m=>m.type==='ml_list');assert.equal(plays.samples.find(s=>s.id===last.id).label,'other');
 // 电脑改标与删除
 const target=list.samples.find(s=>s.source==='collect'&&s.label==='putt'),gone=list.samples.find(s=>s.source==='collect'&&s.id!==target.id);send(screen,{type:'ml_update',id:target.id,label:'swing',level:2});send(screen,{type:'ml_update',id:gone.id,deleted:true});await new Promise(r=>setTimeout(r,800));drain(screen);send(screen,{type:'ml_list',profile:'ml-phone-1|小李',source:'collect'});const after=await wait(screen,m=>m.type==='ml_list');assert.equal(after.total,36);const changed=after.samples.find(s=>s.id===target.id);assert.equal(changed.label,'swing');assert.equal(changed.level,2);assert.equal(changed.power,.4);
 send(screen,{type:'ml_update',id:target.id,level:9});assert.match((await wait(screen,m=>m.type==='error')).message,/力度档位/);
 send(phone,{type:'ml_update',id:target.id,deleted:true});assert.match((await wait(phone,m=>m.type==='error')).message,/电脑/);
 console.log('PASS: 5 档力度引导采集与进度校验、撤销、动作采样（停住 / 收杆）、两名球手两台设备、后台完整训练（含流式回放）与自动部署、影子推理与伪标签、15 杆后按人重新迁移、快速个性化（两台手机同时采集、3 次即完成、个人迁移与个人头下发）、触发置信度自动选择、模型识别免校准击球（附真实挥杆轨迹）、小人姿势转发、待定动作、识别方式开关、手机发起采集、暂停 / 跳过 / 远程确认、误触发改标、电脑改标与删除。验证 F1',metrics.validation.macroF1.toFixed(3),'流式准时',metrics.stream?.onTimeRate?.toFixed(3));
}finally{clearTimeout(stop);screen?.close();phone?.close();server.kill();}
