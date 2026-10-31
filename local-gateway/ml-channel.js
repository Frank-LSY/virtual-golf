// 机器学习通道：引导采集、实战挥杆入库、影子推理、伪标签与在线微调、训练任务与模型下发。
import {Worker} from 'node:worker_threads';
import path from 'node:path';
import {MLStore} from './ml-store.js';
import {AdapterStore} from './ml-adapters.js';
import {withAdapter,replaySelection,PERSONAL} from '../shared/ml/personal.js';
import {decodeRecording} from '../shared/ml/codec.js';
import {resample,findAnchor,windowAt,quality,sparkline,WINDOW} from '../shared/ml/signal.js';
import {deserializeModel} from '../shared/ml/net.js';
import {normalizeProfile,emptyProfile,predictWindow,observe,acceptance,powerCurve,protoWeight,motionCalibration} from '../shared/ml/adapt.js';
import {CLASSES,CLASS_NAMES,SWING_CLASSES,LEVELS,LEVEL_NAMES,POSES,MOTION_PLAN,SOURCES,OTHER_PROMPTS,ADAPT_PLAN,ADAPT_MIN,TARGETS,LEVEL_TARGETS,ONSET,ML_VERSION,LABELS_VERSION,STREAM_VERSION,DETECTORS,weakLabelForClub,levelAt,levelPower,levelText,normalizeLabel,profileKey,deviceLabel} from '../shared/ml/labels.js';
import {STREAM} from '../shared/ml/stream.js';
import {recordingKinematics} from '../shared/ml/kinematics.js';

const FULL_GROWTH=.3,FULL_EPOCHS=100;
// 建议开启模型识别的门槛（练习室显示，开关本身不受限制）。
const GATES=Object.freeze({macroF1:.85,falseTrigger:.1,streamOnTime:.85,streamFalseTrigger:.1});
const text=(v,max)=>typeof v==='string'?v.replace(/[\x00-\x1f<>]/g,'').trim().slice(0,max):'';
const num=v=>Number.isFinite(v)?Math.round(v*1000)/1000:null;
export class MLChannel {
 // sessions：每台手机各自一组采集（多人可以同时做快速个性化）；queue：训练任务排队，一次只跑一个后台线程。
 constructor(clients,send,{dir,training,players}){this.clients=clients;this.send=send;this.training=training;this.players=players;this.dir=dir;this.store=new MLStore(dir);this.adapters=new AdapterStore(dir);this.sessions=new Map();this.job=null;this.worker=null;this.queue=[];this.personal=new Map();this.model=null;this.profiles={};this.online={labeledAtFull:0,sinceTune:{}};}
 async load(){await this.store.load();await this.adapters.load();const st=this.store.settings;if(!Object.hasOwn(DETECTORS,st.detector))st.detector='model';if(!Number.isFinite(st.threshold))st.threshold=STREAM.threshold;st.thresholdMode??='auto';this.restore();this.fillKinematics();this.upgradeModel();if(this.model)setTimeout(()=>this.queueStale(),2500);return this;}
 // 兼容：电脑练习室显示的“当前一组”——优先练习室所选手机的那一组，否则取最近开始的一组。
 get session(){const phone=this.training.phone(),own=phone&&this.sessions.get(phone.clientId);if(own)return own;let last=null;for(const s of this.sessions.values())if(!last||s.startedAt>last.startedAt)last=s;return last;}
 // 运动学摘要（上杆 / 送杆弧度、时长、回放轨迹）：旧样本补算一次。
 fillKinematics(){let n=0;for(const s of this.store.active()){if(s.kin||!this.store.raw.has(s.id))continue;try{s.kin=this.kinematics(decodeRecording(this.store.raw.get(s.id)));n++;}catch{}}if(n)this.store.saveIndex();return n;}
 kinematics(rec){const res=resample(rec),anchor=findAnchor(res,{from:Math.min(res.n-1,20)}),k=recordingKinematics(rec,{anchorTime:rec.t[0]+anchor*1000/res.hz});return {top:k.top,finish:k.finish,impact:k.impact,hold:k.hold,backswingMs:k.backswingMs,downswingMs:k.downswingMs,followMs:k.followMs,trace:k.trace.arc.slice(0,150)};}
 // 标签升级后，旧版（4 类）模型仍可推理；有足够数据时自动用新标签重新完整训练一次。
 upgradeModel(){if(!this.model?.legacy||this.store.settings.autoUpgradeAt||this.labeledCount()<12)return;this.store.settings.autoUpgradeAt=new Date().toISOString();this.store.saveIndex();setTimeout(()=>{try{this.startJob('full',{epochs:45,upgrade:true});}catch{}},1500);}
 restore(){const m=this.store.model();this.model=m?deserializeModel(m):null;const saved=this.store.profiles||{};this.profiles={};if(this.model&&saved.modelId===this.model.id)for(const [k,v] of Object.entries(saved.data||{}))this.profiles[k]=normalizeProfile(v,k);this.online={...this.online,...(this.store.settings.online||{})};this.online.sinceTune??={};}
 observers(){return [...this.clients].filter(c=>c.role==='screen'&&c.mlView);}
 phones(){return [...this.clients].filter(c=>c.role==='phone');}
 person(ws){return this.players?.ensure(ws.clientId)?.name||'球手';}
 profile(key){return this.profiles[key]||(this.profiles[key]=emptyProfile(key));}
 saveProfiles(){this.store.profiles={modelId:this.model?.id||null,data:this.profiles};this.store.saveProfiles();}
 saveOnline(){this.store.settings.online=this.online;this.store.saveIndex();}

 // ---------- 采集计划（每台手机一组，可同时进行） ----------
 trial(s=this.session){if(!s)return null;const step=s.plan[s.index],saved=s.stats.saved,base={id:s.id,mode:s.mode,person:s.person,phoneId:s.phoneId,index:s.index,count:s.plan.length,paused:!!s.paused,stats:{...s.stats},min:s.mode==='adapt'?ADAPT_MIN:null,canFinish:s.mode==='adapt'&&saved>=ADAPT_MIN};return step?{...base,label:step.label,labelName:step.pose?POSES[step.pose].name:CLASS_NAMES[step.label],level:step.level??null,levelName:step.level?LEVEL_NAMES[step.level]:null,levelText:step.level?levelText(step.label,step.level):null,pose:step.pose||null,prompt:step.prompt,onset:step.pose&&step.pose!=='finish'?ONSET.pose:ONSET[step.label],done:false}:{...base,done:true};}
 // 只通知这一组所属的手机（其他手机各自的采集不受影响）。
 pushTrial(s){if(s){s.phoneState=null;s.phoneReason=null;const phone=this.phones().find(c=>c.clientId===s.phoneId),t=this.sessions.get(s.phoneId)===s?this.trial(s):null;if(phone)this.send(phone,{type:'ml_collect',active:!!t&&!t.done,session:t&&!t.done?t:null});}this.changed();}
 plan(mode,rawLabel,levelMode,count){
  if(mode==='adapt')return ADAPT_PLAN.map(step=>({label:step.label,level:step.level??null,pose:null,prompt:step.prompt||null}));
  if(mode==='motion')return MOTION_PLAN.map(pose=>({label:POSES[pose].label,level:POSES[pose].level??null,pose,prompt:POSES[pose].prompt}));
  const label=normalizeLabel(rawLabel);if(!CLASSES.includes(label))throw Error('请选择要采集的动作类别。');const n=Math.max(1,Math.min(50,Math.round(Number(count)||10)));
  return Array.from({length:n},(_,i)=>({label,level:label==='other'?null:levelAt(levelMode,i),pose:null,prompt:label==='other'?OTHER_PROMPTS[i%OTHER_PROMPTS.length]:null}));
 }
 startSession(m,from=null){
  const phone=from||this.training.phone();if(!phone)throw Error('请先在练习室选择一台已连接的手机。');
  if(!phone.calibrated&&!phone.motionReady)throw Error('请先在手机上启用体感。');
  // 同一台手机的旧一组直接结束；不同手机互不影响，可以同时采集。
  const old=this.sessions.get(phone.clientId);if(old)this.stopSession(old,{silent:true});
  const person=text(m.person,24)||this.person(phone),mode=['adapt','motion'].includes(m.mode)?m.mode:'collect',levelMode=m.level??(m.tier==='cycle'?'ladder':m.tier)??'ladder';
  const s={id:`s${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`,phoneId:phone.clientId,startedBy:from?'phone':'screen',paused:false,stats:{saved:0,discarded:0,skipped:0,small:0},person,profile:profileKey(phone.clientId,person),mode,plan:this.plan(mode,m.label,levelMode,m.count),index:0,sampleIds:[],startedAt:new Date().toISOString()};
  this.sessions.set(phone.clientId,s);this.pushTrial(s);return s;
 }
 // 进入下一条；整组完成时结束（快速个性化结束后自动做个人迁移训练）。
 advance(s){s.index++;if(this.trial(s)?.done)this.stopSession(s);else this.pushTrial(s);}
 skip(s){if(!s)throw Error('当前没有进行中的采集。');s.stats.skipped++;this.advance(s);}
 pause(s,paused){if(!s)throw Error('当前没有进行中的采集。');s.paused=paused;this.pushTrial(s);}
 review(s,decision){if(!s)throw Error('当前没有进行中的采集。');const phone=this.phones().find(c=>c.clientId===s.phoneId);if(phone)this.send(phone,{type:'ml_review',decision:decision==='save'?'save':'discard'});}
 stopSession(s,{silent=false}={}){if(!s)return;if(this.sessions.get(s.phoneId)===s)this.sessions.delete(s.phoneId);this.lastSummary={...s.stats,mode:s.mode,person:s.person,phoneId:s.phoneId,at:new Date().toISOString()};this.pushTrial(s);
  if(!silent&&s.mode==='adapt'&&s.sampleIds.length>=ADAPT_MIN)this.scheduleAdapt(s.profile,{reason:'calibration'});}
 undo(s){if(!s?.sampleIds.length)throw Error('这一组还没有可撤销的样本。');const id=s.sampleIds.pop();this.store.remove(id);s.index=Math.max(0,s.index-1);s.stats.saved=Math.max(0,s.stats.saved-1);this.rebuildSoon();this.pushTrial(s);}

 // ---------- 样本 ----------
 // 推理用模型：共享编码器 + 这位球手的个人输出头（没有或已过期时用共享头）。
 modelFor(key){if(!this.model)return null;const head=this.adapters.head(key,this.model);return head?withAdapter(this.model,head,this.adapters.info(key)?.version):this.model;}
 predict(profileKeyValue,x){if(!this.model)return null;const model=this.modelFor(profileKeyValue),p=predictWindow(model,this.profiles[profileKeyValue]||emptyProfile(profileKeyValue),x);return {...p,modelId:this.model.id,personal:model!==this.model,base:model===this.model?p:null,x};}
 publicPrediction(p){return p?{label:p.label,labelName:CLASS_NAMES[p.label],confidence:num(p.confidence),power:num(p.power),s:num(p.s),probs:Object.fromEntries(Object.entries(p.probs).map(([k,v])=>[k,num(v)])),protoWeight:num(p.protoWeight),modelId:p.modelId}:null;}
 ingest(ws,m){
  const source=Object.hasOwn(SOURCES,m.source)?m.source:null;if(!source)throw Error('样本来源无效。');
  if(typeof m.id!=='string'||!/^[\w-]{8,64}$/.test(m.id))throw Error('样本编号无效。');
  const rec=decodeRecording(m.recording),q=quality(rec),res=resample(rec),anchor=findAnchor(res,{from:Math.min(res.n-1,20)}),x=windowAt(res,anchor,{features:this.model?.features||1});
  let label=null,level=null,power=null,pose=null,prompt=null,person=this.person(ws),sessionId=null,trialIndex=null,status='unlabeled',weight=1,weak=null;
  if(source==='collect'||source==='adapt'||source==='motion'){
   const s=this.sessions.get(ws.clientId);if(!s||m.sessionId!==s.id||m.trialIndex!==s.index)throw Error('采集进度已变化，请等待下一条提示。');const step=s.plan[s.index];if(!step)throw Error('这一组已经采集完成。');
   if(!q.ok)return {ok:false,reason:q.gaps?'录音中断，请保持页面在前台后重来。':'录音太短，请完整做完动作。'};
   const onset=step.pose&&step.pose!=='finish'?ONSET.pose:ONSET[step.label];if(q.peak<onset*.8&&!(step.label==='other'&&!step.pose&&q.accelDev>=1.5))return {ok:false,reason:'动作太轻，未达到录制阈值，请重来。'};
   ({label,level,pose,prompt}=step);power=levelPower(level);person=s.person;sessionId=s.id;trialIndex=s.index;status='labeled';
  }else if(source==='play'){weak=weakLabelForClub(text(m.context?.clubId,12));sessionId=`play-${new Date().toISOString().slice(0,10)}`;}
  else{if(source==='candidate')weak=weakLabelForClub(text(m.context?.clubId,12));sessionId=`${source}-${new Date().toISOString().slice(0,10)}`;}
  const profile=profileKey(ws.clientId,person),prediction=this.predict(profile,x);
  if(source==='play'){const a=acceptance(prediction,{weak});if(a.accept){label=a.label;weight=a.weight;status='pseudo';}else status=a.review?'review':'unlabeled';}
  if(source==='missed'||source==='candidate')status='review';
  let kin=null;try{kin=this.kinematics(rec);}catch{}
  const ua=text(m.device?.ua,160),deviceName=text(m.device?.name,32)||ws.deviceName||deviceLabel(ua),st=m.stream&&typeof m.stream==='object'?{label:normalizeLabel(m.stream.label),confidence:num(m.stream.confidence),s:num(m.stream.s),power:num(m.stream.power),learned:!!m.stream.learned,threshold:num(m.stream.threshold),ms:num(m.stream.ms),reason:text(m.stream.reason,24)||null,modelId:text(m.stream.modelId,40)||null}:null;
  const meta={id:m.id,time:new Date().toISOString(),source,deviceId:ws.clientId,person,profile,sessionId,trialIndex,label,power,level,pose,prompt,status,weight,weak,kin,seq:Number.isSafeInteger(m.seq)?m.seq:null,n:rec.n,duration:Math.round(q.duration),hz:num(q.hz),peak:Math.round(q.peak),spark:sparkline(res),anchor,rule:m.rule&&typeof m.rule==='object'?{triggered:!!m.rule.triggered,power:num(m.rule.power),dir:num(m.rule.dir),peak:num(m.rule.peak)}:null,ruleAxis:['alpha','beta','gamma'].includes(m.ruleAxis)?m.ruleAxis:['alpha','beta','gamma'].includes(m.rule?.axis)?m.rule.axis:'beta',context:m.context&&typeof m.context==='object'?{mode:text(m.context.mode,12),clubId:text(m.context.clubId,12),scope:text(m.context.scope,12),armed:!!m.context.armed}:null,device:{ua,hz:num(m.device?.hz),name:deviceName,model:deviceLabel(ua)},deviceName,grip:['vertical','horizontal'].includes(m.grip)?m.grip:(ws.grip||null),detector:source==='play'||source==='candidate'?(m.detector==='model'?'model':'rule'):null,stream:st,prediction:this.publicPrediction(prediction),appVersion:ML_VERSION};
  this.store.add(meta,m.recording);
  if(prediction&&label){observe(this.profile(profile),{e:prediction.e,label,s:prediction.s,power,weight,kin,pose});const g=prediction.base||predictWindow(this.model,this.profile('*'),prediction.x);observe(this.profile('*'),{e:g.e,label,s:g.s,power,weight});this.saveProfiles();this.pushProfile(ws.clientId);}
  // 之后每位球手每新增 15 杆被接受的实战挥杆，就按人重新迁移一次（只更新这个人的输出头，不动别人的）。
  if(status==='pseudo'&&this.store.settings.autoTune!==false){const n=(this.online.sinceTune[profile]||0)+1;this.online.sinceTune[profile]=n;this.saveOnline();if(n>=PERSONAL.retuneEvery)this.scheduleAdapt(profile,{reason:'online'});}
  const own=this.sessions.get(ws.clientId);if(sessionId&&own?.id===sessionId){own.sampleIds.push(meta.id);own.stats.saved++;this.advance(own);}else this.changed();
  return {ok:true,id:meta.id,status,label,level,pose,prediction:meta.prediction,kin:kin&&{top:kin.top,finish:kin.finish,hold:kin.hold},quality:{duration:meta.duration,hz:meta.hz,peak:meta.peak}};
 }
 feedback(ws,m){const s=this.store.get(m.id);if(!s||s.deviceId!==ws.clientId)throw Error('未找到这条挥杆记录。');if(m.feeling==='误触发'){this.store.update(s.id,{label:'other',power:null,level:null,status:'labeled',weight:1,feedback:'误触发'});this.rebuildSoon();}else if(['偏轻','偏重','刚刚好'].includes(m.feeling))this.store.update(s.id,{feedback:m.feeling});this.changed();}

 // ---------- 训练与部署（任务排队，一次一个后台线程） ----------
 busy(){return !!(this.job&&!this.job.finished);}
 startJob(kind,payload={}){
  if(this.busy()){
   if(kind==='full'&&this.job.kind==='full')throw Error('已有训练任务在运行，请稍候。');
   // 个人迁移很快：完整训练排到队首；同一个人的迁移不重复排队。
   if(kind==='adapt'&&(this.queue.some(q=>q.kind==='adapt'&&q.payload.key===payload.key)))return false;
   if(kind==='full'&&this.queue.some(q=>q.kind==='full'))throw Error('完整训练已在排队。');
   if(kind==='rebuild'&&this.queue.some(q=>q.kind==='rebuild'))return false;
   const entry={kind,payload};if(kind==='full')this.queue.unshift(entry);else this.queue.push(entry);if(kind==='adapt')this.setPersonal(payload.key,'queued');this.changed();return true;
  }
  this.launch(kind,payload);return true;
 }
 jobSamples(kind,payload){
  if(kind!=='adapt')return this.store.trainingSamples();
  // 个人迁移只需要这个人的样本 + 按类别平衡的回放样本（≤240 条），不加载整份数据集。
  const pool=this.store.active().filter(x=>x.label&&x.profile!==payload.key&&this.store.raw.has(x.id)).map(x=>({id:x.id,profile:x.profile,label:x.label,time:x.time,weight:x.status==='pseudo'?(x.weight||.5):1})),ids=new Set(replaySelection(pool,payload.key).map(x=>x.id));
  return this.store.trainingSamples({filter:x=>x.profile===payload.key||ids.has(x.id)});
 }
 launch(kind,payload){
  const samples=this.jobSamples(kind,payload);
  const heads=kind==='rebuild'&&this.model?Object.fromEntries(this.adapters.keys().map(k=>[k,this.adapters.serialized(k,this.model.id)]).filter(([,v])=>v)):undefined;
  const job={kind,samples,dir:this.store.dir,heads,...payload};this.job={kind,key:payload.key||null,stage:'prepare',progress:0,startedAt:new Date().toISOString(),history:[],count:samples.length,upgrade:!!payload.upgrade,reason:payload.reason||null};
  if(kind==='adapt')this.setPersonal(payload.key,'training');
  const worker=new Worker(new URL('./ml-worker.js',import.meta.url),{workerData:job});this.worker=worker;
  worker.on('message',m=>{if(m.type==='progress'){Object.assign(this.job,{stage:m.stage,progress:m.value,epoch:m.epoch??this.job.epoch,loss:m.loss??this.job.loss,valF1:m.valF1??this.job.valF1});if(m.loss!==undefined&&kind!=='adapt')this.job.history.push({epoch:m.epoch,loss:+m.loss.toFixed(4),valF1:m.valF1??null});this.changed();}
   else if(m.type==='done')this.finish(kind,m.result).catch(e=>this.fail(e.message));else if(m.type==='error')this.fail(m.message);});
  worker.on('error',e=>this.fail(e.message));worker.on('exit',code=>{if(code&&this.job&&!this.job.finished)this.fail('训练线程意外退出。');this.worker=null;});
  this.changed();
 }
 next(){if(this.busy())return;const entry=this.queue.shift();if(entry){try{this.launch(entry.kind,entry.payload);}catch(e){this.fail(e.message);}}else if(this.pendingRebuild&&this.model){this.pendingRebuild=false;this.rebuildSoon();}}
 fail(message){if(this.job){this.job.finished=true;this.job.error=message;this.job.stage='error';if(this.job.kind==='adapt'&&this.job.key)this.setPersonal(this.job.key,'failed',{error:message});}this.changed();setTimeout(()=>this.next(),0);}
 cancel(){if(this.worker){this.worker.terminate();this.fail('已取消训练。');}}
 async finish(kind,result){
  if(kind==='adapt'){
   const a=result.adapter,stale=!this.model||a.modelId!==this.model.id;
   if(!stale){const owner=this.store.active().find(x=>x.profile===a.key);await this.adapters.save(a.key,{modelId:a.modelId,head:a.accepted?a.head:null,accepted:a.accepted,metrics:a.metrics,samples:a.samples,reason:a.reason,person:owner?.person||a.key.split('|')[1]||null,deviceId:owner?.deviceId||a.key.split('|')[0]||null});
    if(result.profile){this.profiles[a.key]=normalizeProfile(result.profile,a.key);this.saveProfiles();}
    this.online.sinceTune[a.key]=0;this.saveOnline();this.setPersonal(a.key,'done');const phone=this.phoneFor(a.key);if(phone)this.pushModel(phone);}
   Object.assign(this.job,{finished:true,stage:'done',progress:1,accepted:a.accepted,reason:a.reason||null});this.changed();setTimeout(()=>this.next(),0);return;
  }
  if(result.model){const saved=result.model;await this.store.saveModel(saved);
   // 首个模型、手动完整训练、在线微调，或新模型支持流式识别 / 使用更新的特征版本（替换旧版）时自动部署。
   const cur=this.store.model(),deploy=kind==='head'||(kind==='full'&&!this.job.upgrade)||!this.model||!!this.model.legacy||(!!saved.stream&&!cur?.stream)||(Number(saved.features)||1)>(Number(cur?.features)||1);
   if(deploy){this.store.setCurrent(saved.id);this.model=deserializeModel(saved);this.profiles=Object.fromEntries(Object.entries(result.profiles||{}).map(([k,v])=>[k,normalizeProfile(v,k)]));this.saveProfiles();this.applyThreshold(saved);this.pushModel();}
   if(kind==='full'){this.online.labeledAtFull=this.labeledCount();this.online.fullAt=new Date().toISOString();}this.saveOnline();this.job.modelId=saved.id;this.job.deployed=deploy;
   if(deploy)setTimeout(()=>this.queueStale(),0);}
  if(result.profiles&&kind==='rebuild'&&this.model){this.profiles=Object.fromEntries(Object.entries(result.profiles).map(([k,v])=>[k,normalizeProfile(v,k)]));this.saveProfiles();this.pushModel();}
  if(result.transfer){this.job.transfer=result.transfer;this.store.settings.transfer={...result.transfer,at:new Date().toISOString()};this.store.saveIndex();}
  Object.assign(this.job,{finished:true,stage:'done',progress:1});this.changed();
  setTimeout(()=>this.next(),0);
 }
 // 触发置信度跟随模型的验证结果（自动）；手动设置过的保持手动值。
 applyThreshold(saved){const st=this.store.settings,t=saved?.metrics?.streamThreshold;if(st.thresholdMode!=='manual'&&Number.isFinite(t)&&t!==st.threshold){st.threshold=t;this.store.saveIndex();this.pushSettings();}}
 deploy(id){if(!id){this.store.setCurrent(null);this.model=null;this.profiles={};this.saveProfiles();this.pushModel();this.changed();return;}const saved=this.store.model(id);if(!saved)throw Error('未找到这个模型。');this.store.setCurrent(id);this.model=deserializeModel(saved);this.profiles={};this.applyThreshold(saved);this.pushModel();this.rebuildSoon();this.queueStale();this.changed();}
 rebuildSoon(){if(!this.model)return;if(this.busy()){this.pendingRebuild=true;return;}clearTimeout(this.rebuildTimer);this.rebuildTimer=setTimeout(()=>{try{this.startJob('rebuild',{model:this.store.model()});}catch{this.pendingRebuild=true;}},600);}
 // 个人迁移：有共享模型时立即排队；没有模型时先记下，完整训练部署后自动补做。
 scheduleAdapt(key,{reason='calibration'}={}){
  if(!key)return false;if(!this.store.active().some(x=>x.profile===key&&x.label&&SWING_CLASSES.includes(x.label)))return false;
  if(!this.model||this.model.legacy){this.setPersonal(key,'waiting');return false;}
  return this.startJob('adapt',{key,model:this.store.model(),reason});
 }
 // 共享模型换代后，旧的个人头作废：给做过快速个性化（或有过个人头）的球手排队重新迁移。
 queueStale(){if(!this.model||this.model.legacy)return 0;const want=new Set(this.adapters.stale(this.model.id));for(const x of this.store.active())if(x.source==='adapt'&&x.label)want.add(x.profile);for(const [key,st] of this.personal)if(st.status==='waiting')want.add(key);
  let n=0;for(const key of want){if(this.adapters.info(key)?.modelId===this.model.id)continue;if(this.scheduleAdapt(key,{reason:'model'}))n++;}return n;}
 setPersonal(key,status,extra={}){this.personal.set(key,{status,at:new Date().toISOString(),...extra});this.pushPersonal(key);this.changed();}
 // 个性化状态：ready 已启用个人头；power 只做了力度映射（个人头未通过检查或回放样本不足）；stale 共享模型已更新、待重新迁移；
 // queued / training 排队或训练中；waiting 还没有共享模型；none 尚未个性化。
 personalStatus(key){const info=this.adapters.info(key),live=this.personal.get(key),current=!!this.model&&info?.modelId===this.model.id;
  const status=live&&['queued','training','failed','waiting'].includes(live.status)?live.status:current?(info.accepted?'ready':'power'):info?'stale':(this.model?'none':'no-model');
  return {status,accepted:!!(current&&info?.accepted),samples:info?.samples||0,trainedAt:info?.trainedAt||null,reason:(live?.status==='failed'?live.error:null)||info?.reason||null,metrics:current?info.metrics:null,adaptSamples:this.store.active().filter(x=>x.profile===key&&x.source==='adapt').length};}
 labeledCount(){return this.store.active().filter(s=>s.status==='labeled').length;}

 // ---------- 下发 ----------
 keyOf(ws){return profileKey(ws.clientId,this.person(ws));}
 phoneFor(key){return this.phones().find(c=>this.keyOf(c)===key)||null;}
 phoneProfile(ws){return this.profiles[this.keyOf(ws)]||null;}
 phoneSettings(){const st=this.store.settings;return {shadow:!!st.shadow,detector:st.detector,threshold:st.threshold,streamVersion:STREAM_VERSION};}
 // 下发：共享模型 + 这台手机所属球手的个人输出头（若有）+ 个人映射 + 个性化状态。
 pushModel(target=null){const model=this.model?this.store.model():null;for(const c of target?[target]:this.phones()){const key=this.keyOf(c),head=this.model?this.adapters.serialized(key,this.model.id):null;this.send(c,{type:'ml_model',model,adapter:head?{key,modelId:this.model.id,head,version:this.adapters.info(key)?.version||1}:null,profile:this.phoneProfile(c),fallback:this.profiles['*']||null,settings:this.phoneSettings(),personal:this.personalStatus(key)});}}
 pushPersonal(key){const ws=this.phoneFor(key);if(ws)this.send(ws,{type:'ml_personal',key,...this.personalStatus(key)});}
 pushSettings(){for(const c of this.phones())this.send(c,{type:'ml_settings',settings:this.phoneSettings()});}
 pushProfile(phoneId){const ws=this.phones().find(c=>c.clientId===phoneId);if(ws)this.send(ws,{type:'ml_profile',profile:this.phoneProfile(ws),fallback:this.profiles['*']||null,personal:this.personalStatus(this.keyOf(ws))});}
 // 采集手机断开时自动暂停，重新连上后继续。
 disconnected(ws){const s=ws.role==='phone'&&this.sessions.get(ws.clientId);if(s&&!this.phones().some(c=>c.clientId===ws.clientId)){s.paused=true;s.phoneState=null;this.changed();}}
 connected(ws){if(ws.role==='phone'){this.pushModel(ws);const s=this.sessions.get(ws.clientId);if(s)this.pushTrial(s);}}

 // ---------- 电脑端视图 ----------
 summary(){
  const empty=()=>({levels:Object.fromEntries(LEVELS.map(l=>[l,0])),legacy:0,none:0,total:0});
  const profiles=new Map();for(const s of this.store.active()){const key=s.profile;if(!profiles.has(key))profiles.set(key,{key,person:s.person,deviceId:s.deviceId,deviceName:null,phone:this.players?.profiles.get(s.deviceId)?.number??null,counts:Object.fromEntries(CLASSES.map(c=>[c,empty()])),poses:Object.fromEntries(Object.keys(POSES).map(p=>[p,0])),play:0,review:0,pseudo:0,total:0,grips:{vertical:0,horizontal:0,unknown:0},lastAt:s.time});const p=profiles.get(key);p.total++;p.grips[s.grip||'unknown']++;if(s.time>=p.lastAt||!p.deviceName)p.deviceName=s.deviceName||s.device?.name||deviceLabel(s.device?.ua)||p.deviceName;p.lastAt=s.time>p.lastAt?s.time:p.lastAt;if(s.source==='play')p.play++;if(s.status==='review')p.review++;if(s.status==='pseudo')p.pseudo++;if(s.pose&&POSES[s.pose])p.poses[s.pose]++;if(s.label&&s.status==='labeled'&&p.counts[s.label]){const c=p.counts[s.label];c.total++;if(s.level&&c.levels[s.level]!==undefined)c.levels[s.level]++;else if(s.legacy)c.legacy++;else c.none++;}}
  return [...profiles.values()].map(p=>{const state=this.profiles[p.key];return {...p,personal:this.personalStatus(p.key),connected:!!this.phoneFor(p.key),adaptation:state?{accepted:state.accepted,protoWeight:num(protoWeight(state)),prototypes:Object.fromEntries(CLASSES.map(c=>[c,state.prototypes[c]?.n||0])),curves:Object.fromEntries(SWING_CLASSES.map(c=>[c,powerCurve(state,c)?.map(([x,y])=>[num(x),num(y)])||null])),motion:motionCalibration(state)}:null};}).sort((a,b)=>String(b.lastAt).localeCompare(String(a.lastAt)));
 }
 shadow(){const active=this.store.active(),play=active.filter(s=>s.source==='play'&&s.prediction),ruleShots=play.filter(s=>s.detector!=='model');const agree=ruleShots.filter(s=>s.weak&&s.prediction.label===s.weak).length,weak=ruleShots.filter(s=>s.weak).length,modelShots=active.filter(s=>s.source==='play'&&s.detector==='model'),cands=active.filter(s=>s.source==='candidate');
  return {total:ruleShots.length,withWeak:weak,agree,agreeRate:weak?agree/weak:null,modelRejects:ruleShots.filter(s=>s.prediction.label==='other').length,confirmedMisfires:active.filter(s=>s.source==='play'&&s.feedback==='误触发').length,review:active.filter(s=>s.status==='review').length,
   model:{total:modelShots.length,ruleAlso:modelShots.filter(s=>s.rule?.triggered).length,clubAgree:modelShots.filter(s=>s.weak&&s.stream?.label===s.weak).length,withWeak:modelShots.filter(s=>s.weak).length,misfires:modelShots.filter(s=>s.feedback==='误触发').length,ruleOnly:cands.filter(s=>s.stream?.reason==='rule').length,nearMiss:cands.filter(s=>s.stream?.reason==='near').length,missed:active.filter(s=>s.source==='missed').length}};}
 readiness(){
  const saved=this.model?this.store.model():null,m=saved?.metrics,v=m?.validation,st=m?.stream,fin=x=>Number.isFinite(x);
  const checks=[{key:'labels',name:'使用新标签（挥杆 / 推杆 / 非挥杆 + 5 档力度）',ok:!!saved&&!this.model?.legacy,text:!saved?'尚未部署模型':this.model?.legacy?(this.job&&!this.job.finished?'正在用新标签重新训练':'旧版 4 类模型，请重新完整训练'):'已具备'},{key:'stream',name:'模型含流式训练',ok:!!saved?.stream,text:!saved?'尚未部署模型':saved.stream?'已具备':'旧版模型，请重新完整训练'},{key:'features',name:'含姿态解算与手腕转动增强',ok:(saved?.features||1)>=2,text:!saved?'—':(saved.features||1)>=2?'已具备':'旧版特征，建议重新完整训练'},{key:'f1',name:`验证宏平均 F1 ≥ ${GATES.macroF1*100}%`,ok:fin(v?.macroF1)&&v.macroF1>=GATES.macroF1,value:v?.macroF1??null},{key:'onTime',name:`流式回放准时识别 ≥ ${GATES.streamOnTime*100}%`,ok:fin(st?.onTimeRate)&&st.onTimeRate>=GATES.streamOnTime,value:st?.onTimeRate??null},{key:'false',name:`非挥杆误触发 ≤ ${GATES.streamFalseTrigger*100}%`,ok:fin(st?.falseTriggerRate)&&st.falseTriggerRate<=GATES.streamFalseTrigger,value:st?.falseTriggerRate??null}];
  return {available:!!saved?.stream,legacy:!!this.model?.legacy,modelId:saved?.id||null,checks,recommended:checks.every(c=>c.ok),stream:st||null,rule:m?.rule?.stream||null,curve:m?.streamCurve||[],threshold:m?.streamThreshold??null,choice:m?.thresholdChoice||null};
 }
 phoneList(){return this.phones().map(ws=>({id:ws.clientId,key:this.keyOf(ws),personal:this.personalStatus(this.keyOf(ws)),number:this.players?.profiles.get(ws.clientId)?.number??null,name:this.person(ws),deviceName:ws.deviceName||null,grip:ws.grip||null,detector:ws.mlDetector?.detector||null,reason:ws.mlDetector?.reason||null,calibrated:!!ws.calibrated,calibrationMode:ws.calibration?.mode||null,motionReady:!!ws.motionReady||!!ws.calibrated}));}
 state(){
  const phone=this.training.phone(),models=this.store.models.map(m=>({id:m.id,trainedAt:m.trainedAt,samples:m.samples,kind:m.kind||'full',stream:Number(m.stream)||0,legacy:!Array.isArray(m.classes)||m.classes.some(c=>c!==normalizeLabel(c)),current:m.id===this.store.current,metrics:m.metrics?{stream:m.metrics.stream||null,validation:m.metrics.validation?{macroF1:m.metrics.validation.macroF1,accuracy:m.metrics.validation.accuracy,falseTrigger:m.metrics.validation.falseTrigger,missRate:m.metrics.validation.missRate,intensityRho:m.metrics.validation.intensityRho,pairOrder:m.metrics.validation.pairOrder,powerError:m.metrics.validation.powerError??null,powerWithin:m.metrics.validation.powerWithin??null,powerLevels:m.metrics.validation.powerLevels||null,classes:Array.isArray(m.classes)?m.classes:['full','partial','putt','other'],confusion:m.metrics.validation.confusion,perClass:m.metrics.validation.perClass,count:m.metrics.validation.count}:null,baseline:m.metrics.baseline?{macroF1:m.metrics.baseline.macroF1,falseTrigger:m.metrics.baseline.falseTrigger,missRate:m.metrics.baseline.missRate}:null,rule:m.metrics.rule||null,trainCount:m.metrics.trainCount,valCount:m.metrics.valCount,history:m.metrics.history||[]}:null})).reverse();
  const labeled=this.labeledCount();
   const focus=this.session;
   return {type:'ml_state',version:ML_VERSION,session:this.trial(focus),sessionPhone:focus?.phoneId||null,phoneState:focus?focus.phoneState||null:null,phoneReason:focus?focus.phoneReason||null:null,sessions:[...this.sessions.values()].map(x=>({...this.trial(x),phoneState:x.phoneState||null,phoneNumber:this.players?.profiles.get(x.phoneId)?.number??null})),queue:this.queue.map(q=>({kind:q.kind,key:q.payload.key||null})),lastSummary:this.lastSummary||null,phone:phone?{id:phone.clientId,name:this.person(phone),deviceName:phone.deviceName||null,grip:phone.grip||null,number:this.players?.profiles.get(phone.clientId)?.number??null,calibrated:!!phone.calibrated,motionReady:!!phone.motionReady||!!phone.calibrated,hz:phone.mlHz||null}:null,
   profiles:this.summary(),recent:this.store.active().slice(-36).reverse().map(s=>this.publicSample(s)),job:this.job&&{kind:this.job.kind,key:this.job.key||null,accepted:this.job.accepted??null,reason:this.job.reason||null,upgrade:!!this.job.upgrade,stage:this.job.stage,progress:this.job.progress,epoch:this.job.epoch,loss:this.job.loss,valF1:this.job.valF1,history:this.job.history.slice(-80),finished:!!this.job.finished,error:this.job.error||null,startedAt:this.job.startedAt,modelId:this.job.modelId||null,deployed:!!this.job.deployed,count:this.job.count},
   models,current:this.store.current,settings:{shadow:!!this.store.settings.shadow,autoTune:!!this.store.settings.autoTune,detector:this.store.settings.detector,threshold:this.store.settings.threshold,thresholdMode:this.store.settings.thresholdMode||'auto'},fullEpochs:FULL_EPOCHS,readiness:this.readiness(),phones:this.phoneList(),transfer:this.store.settings.transfer||null,
    online:{retuneEvery:PERSONAL.retuneEvery,sinceTune:this.online.sinceTune,labeled,labeledAtFull:this.online.labeledAtFull||0,suggestFull:!!this.model&&labeled>=Math.max(20,(this.online.labeledAtFull||0)*(1+FULL_GROWTH))},
   shadow:this.shadow(),targets:TARGETS,levelTargets:LEVEL_TARGETS,labels:{version:LABELS_VERSION,migration:this.store.settings.migration||null},totals:{samples:this.store.active().length,labeled}};
 }
 publicSample(s){return {id:s.id,time:s.time,source:s.source,person:s.person,profile:s.profile,deviceId:s.deviceId,deviceName:s.deviceName||s.device?.name||deviceLabel(s.device?.ua),grip:s.grip||null,detector:s.detector||null,stream:s.stream||null,label:s.label,power:s.power??null,level:s.level??null,pose:s.pose||null,legacy:s.legacy||null,kin:s.kin?{top:s.kin.top,finish:s.kin.finish,hold:s.kin.hold,backswingMs:s.kin.backswingMs,downswingMs:s.kin.downswingMs}:null,prompt:s.prompt,status:s.status,weak:s.weak,duration:s.duration,hz:s.hz,peak:s.peak,spark:s.spark,prediction:s.prediction,rule:s.rule,context:s.context,feedback:s.feedback||null};}
 changed(){clearTimeout(this.stateTimer);this.stateTimer=setTimeout(()=>{const state=this.state();for(const c of this.observers())this.send(c,state);},120);}
 detail(id){const s=this.store.get(id),raw=this.store.raw.get(id);if(!s||!raw)throw Error('未找到这条样本。');const rec=decodeRecording(raw),res=resample(rec),anchor=findAnchor(res,{from:Math.min(res.n-1,20)});return {type:'ml_detail',sample:this.publicSample(s),hz:res.hz,n:res.n,g:Array.from(res.g,v=>Math.round(v*10)/10),a:Array.from(res.a,v=>Math.round(v*100)/100),anchor,window:[Math.max(0,anchor-WINDOW.before+1),Math.min(res.n-1,anchor+WINDOW.after)]};}
 list(m){const all=this.store.active().filter(s=>(!m.profile||s.profile===m.profile)&&(!m.label||(m.label==='none'?!s.label:s.label===m.label))&&(!m.source||s.source===m.source)&&(!m.status||s.status===m.status)).reverse(),offset=Math.max(0,Number(m.offset)||0),limit=Math.min(120,Math.max(1,Number(m.limit)||48));return {type:'ml_list',total:all.length,offset,samples:all.slice(offset,offset+limit).map(s=>this.publicSample(s))};}

 handle(ws,m){
  if(!m.type?.startsWith?.('ml_'))return false;
  if(m.type==='ml_view'&&ws.role==='screen'){ws.mlView=m.active===true;if(ws.mlView)this.send(ws,this.state());return true;}
   if(m.type==='ml_trial_state'&&ws.role==='phone'){const s=this.sessions.get(ws.clientId);if(s){s.phoneState=['settle','ready','recording','saving','off','review','paused'].includes(m.state)?m.state:null;s.phoneReason=m.state==='review'?text(m.reason,60)||null:null;if(m.discarded)s.stats.discarded++;if(m.small)s.stats.small++;this.changed();}return true;}
  if(m.type==='ml_motion'&&ws.role==='phone'){ws.motionReady=!!m.ready;ws.mlHz=num(m.hz);const name=text(m.device?.name,32);if(name)ws.deviceName=name;this.changed();return true;}
  if(m.type==='ml_status'&&ws.role==='phone'){ws.mlDetector={detector:m.detector==='model'?'model':'rule',reason:text(m.reason,60)||null,modelId:text(m.modelId,40)||null};if(['vertical','horizontal'].includes(m.grip))ws.grip=m.grip;const name=text(m.device?.name,32);if(name)ws.deviceName=name;this.changed();return true;}
  if(m.type==='ml_detector'&&(ws.role==='phone'||ws.role==='screen')){if(!Object.hasOwn(DETECTORS,m.detector))throw Error('识别方式无效。');this.store.settings.detector=m.detector;this.store.saveIndex();this.pushSettings();this.changed();return true;}
  if(m.type==='ml_sample'&&ws.role==='phone'){let ack;try{ack=this.ingest(ws,m);}catch(e){ack={ok:false,reason:e.message};}this.send(ws,{type:'ml_sample_ack',id:m.id,source:m.source,...ack});return true;}
  if(m.type==='ml_feedback'&&ws.role==='phone'){this.feedback(ws,m);return true;}
  if(m.type==='ml_session'){
   if(m.action==='start'){if(ws.role==='screen')this.startSession(m);else if(ws.role==='phone')this.startSession(m,ws);else throw Error('采集操作无效。');return true;}
    // 手机只能控制自己的一组；电脑控制练习室显示的那一组（可用 phoneId 指定）。
    const target=ws.role==='phone'?this.sessions.get(ws.clientId):(m.phoneId?this.sessions.get(text(m.phoneId,100)):this.session);if(ws.role!=='screen'&&ws.role!=='phone')throw Error('采集操作无效。');if(ws.role==='phone'&&!target)throw Error('只有电脑或当前采集手机可以控制采集。');
    if(m.action==='stop'||m.action==='finish')this.stopSession(target);else if(m.action==='undo')this.undo(target);else if(m.action==='skip')this.skip(target);else if(m.action==='pause'||m.action==='resume')this.pause(target,m.action==='pause');else if(m.action==='review'&&ws.role==='screen')this.review(target,m.decision);else throw Error('采集操作无效。');return true;
  }
  if(ws.role!=='screen')throw Error('请在电脑练习室操作。');
  if(m.type==='ml_update'){const s=this.store.get(m.id);if(!s)throw Error('未找到这条样本。');if(m.deleted===true){this.store.remove(m.id);}else{const patch={};if(m.label!==undefined){const label=m.label===null?null:normalizeLabel(m.label);if(m.label!==null&&!CLASSES.includes(label))throw Error('标签无效。');patch.label=label;patch.status=label?'labeled':'unlabeled';patch.weight=1;if(label==='other'||!label){patch.power=null;patch.level=null;}}if(m.level!==undefined){if(m.level!==null&&!LEVELS.includes(Number(m.level)))throw Error('力度档位无效。');const level=m.level===null?null:Number(m.level);patch.level=level;patch.power=levelPower(level);}this.store.update(m.id,patch);}this.rebuildSoon();this.changed();return true;}
  if(m.type==='ml_list'){this.send(ws,this.list(m));return true;}
  if(m.type==='ml_detail'){this.send(ws,this.detail(m.id));return true;}
   // 完整训练：默认 100 轮（0.23 起电脑上只保留这一个按钮）。
   if(m.type==='ml_train'){if(!['full','transfer'].includes(m.kind))throw Error('训练类型无效。');this.startJob(m.kind,{epochs:Math.max(10,Math.min(FULL_EPOCHS,Number(m.epochs)||FULL_EPOCHS))});return true;}
  if(m.type==='ml_cancel'){this.cancel();return true;}
  if(m.type==='ml_deploy'){this.deploy(m.modelId||null);return true;}
  if(m.type==='ml_settings'){const st=this.store.settings;if(typeof m.shadow==='boolean')st.shadow=m.shadow;if(typeof m.autoTune==='boolean')st.autoTune=m.autoTune;if(Object.hasOwn(DETECTORS,m.detector))st.detector=m.detector;if(Number.isFinite(m.threshold)){st.threshold=Math.round(Math.max(.5,Math.min(.95,m.threshold))*100)/100;st.thresholdMode='manual';}if(m.threshold==='auto'){st.thresholdMode='auto';const t=this.store.model()?.metrics?.streamThreshold;if(Number.isFinite(t))st.threshold=t;}this.store.saveIndex();this.pushSettings();this.changed();return true;}
  if(m.type==='ml_export'){this.send(ws,{type:'ml_export',data:this.store.exportAll()});return true;}
  throw Error('无法识别的机器学习操作。');
 }
}
