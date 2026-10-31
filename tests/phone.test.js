import {CLUBS} from '../shared/clubs.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {INPUT_DEFAULTS,inputSettings} from '../shared/training.js';
import {chineseLog,chineseCsv} from '../shared/locale.js';
import {MotionRecorder,TrialSegmenter,sampleId,ML_LABEL_TIPS} from '../phone-web/ml-recorder.js';
import {encodeRecording} from '../shared/ml/codec.js';
import {deserializeModel} from '../shared/ml/net.js';
import {predictWindow,motionCalibration} from '../shared/ml/adapt.js';
import {withAdapter,deserializeHead} from '../shared/ml/personal.js';
import {LiveArc,arcCurve,arcToPose,traceToPose,recordingKinematics} from '../shared/ml/kinematics.js';
import {resample,findAnchor,windowAt,prepareInput} from '../shared/ml/signal.js';
import {CLASS_NAMES,CLASSES,SWING_CLASSES,LEVELS,LEVEL_NAMES,levelText,DETECTORS,deviceLabel} from '../shared/ml/labels.js';
import {StreamDetector,streamPower,streamDecision,heuristicDecision,STREAM} from '../shared/ml/stream.js';
import {motionSVG,gripSVG,GRIP_TIPS,GRIPS,MOTION_TIPS} from '../shared/ml/illustrations.js';
import {synthDataset,synthRecording} from '../shared/ml/synthetic.js';
import {prepare,trainModel} from '../shared/ml/train.js';
import {serializeModel} from '../shared/ml/net.js';
import {STREAM_VERSION} from '../shared/ml/labels.js';

// 用可控时钟与传感器事件测试实际手机控制器，不需要浏览器或真实硬件权限。
async function phoneHarness(){
 const html=await readFile(new URL('../phone-web/index.html',import.meta.url),'utf8');
 const elements=new Map();
 function element(){const classes=new Set();return {value:'',textContent:'',innerHTML:'',disabled:false,dataset:{},style:{},classList:{add:(...x)=>x.forEach(v=>classes.add(v)),remove:(...x)=>x.forEach(v=>classes.delete(v)),toggle:(v,on)=>{on??=!classes.has(v);on?classes.add(v):classes.delete(v);return on;},contains:v=>classes.has(v)},click(){return this.onclick?.();}};}
 for(const match of html.matchAll(/id="([^"]+)"/g))elements.set(match[1],element());
 const buttons=['play','practice'].map(mode=>Object.assign(element(),{dataset:{mode}}));
 const documentHandlers=new Map();const document={hidden:false,getElementById:id=>{assert.ok(elements.has(id),'DOM 元素存在：'+id);return elements.get(id);},querySelectorAll:()=>buttons,querySelector:selector=>selector.includes('practice')?buttons[1]:buttons[0],addEventListener:(k,fn)=>documentHandlers.set(k,fn)};
 const storage=new Map(),localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 let conn;class Connection extends EventTarget{constructor(){super();conn=this;this.sent=[];}send(m){this.sent.push(m);return true;}connect(){this.receive({type:'ready'});}receive(m){this.dispatchEvent(new CustomEvent('message',{detail:m}));}}
 const handlers=new Map(),window={isSecureContext:true,addEventListener:(k,fn)=>handlers.set(k,fn),removeEventListener:k=>handlers.delete(k)};let clock=1000;
 const timers=new Map(),intervals=[];let timerId=0;const setTimeout=(fn,ms)=>{const id=++timerId;timers.set(id,{fn,due:clock+ms});return id;};
 class FakeDate extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
 const injected={CLUBS,Connection,chineseLog,chineseCsv,INPUT_DEFAULTS,inputSettings,MotionRecorder,TrialSegmenter,sampleId,ML_LABEL_TIPS,encodeRecording,deserializeModel,predictWindow,motionCalibration,withAdapter,deserializeHead,LiveArc,arcCurve,arcToPose,traceToPose,recordingKinematics,resample,findAnchor,windowAt,prepareInput,CLASS_NAMES,CLASSES,SWING_CLASSES,LEVELS,LEVEL_NAMES,levelText,deviceLabel,StreamDetector,streamPower,streamDecision,heuristicDecision,STREAM,motionSVG,gripSVG,GRIP_TIPS,GRIPS,MOTION_TIPS,document,window,navigator:{vibrate(){}},DeviceMotionEvent:{},localStorage,sessionStorage:localStorage,performance:{now:()=>clock},Date:FakeDate,setTimeout,clearTimeout:id=>timers.delete(id),setInterval:fn=>intervals.push(fn)};
 const source=(await readFile(new URL('../phone-web/app.js',import.meta.url),'utf8')).replace(/^(?:import|export) .*;\r?\n/gm,'');new Function(...Object.keys(injected),source)(...Object.values(injected));
 const sample=(beta,step=40)=>{clock+=step;for(const [id,t] of timers)if(t.due<=clock){timers.delete(id);t.fn();}handlers.get('devicemotion')?.({rotationRate:{alpha:0,beta,gamma:0},accelerationIncludingGravity:{y:0,z:9.8}});};
 const motion=(g,a,step)=>{clock+=step;for(const [id,t] of timers)if(t.due<=clock){timers.delete(id);t.fn();}handlers.get('devicemotion')?.({rotationRate:{alpha:g[0],beta:g[1],gamma:g[2]},accelerationIncludingGravity:{x:a[0],y:a[1],z:a[2]}});};
 // 注入一次完整动作：静止 → 录音 → 静止（姿势与录音起点一致）。
 const play=(rec,{before=40,after=110}={})=>{const still=[rec.a[0],rec.a[1],rec.a[2]];for(let i=0;i<before;i++)motion([1,-1,.5],still,16);for(let i=1;i<rec.n;i++)motion([rec.g[i*3],rec.g[i*3+1],rec.g[i*3+2]],[rec.a[i*3],rec.a[i*3+1],rec.a[i*3+2]],rec.t[i]-rec.t[i-1]);const end=[rec.a[(rec.n-1)*3],rec.a[(rec.n-1)*3+1],rec.a[(rec.n-1)*3+2]];for(let i=0;i<after;i++)motion([1,-1,.5],end,16);};
 return {conn,elements,buttons,storage,sample,motion,play,advance:ms=>{clock+=ms;for(const fn of intervals)fn();},setHidden:value=>{document.hidden=value;documentHandlers.get('visibilitychange')?.();}};
}

test('启用体感后直接就绪（无需校准）：免校准规则按挥杆结构触发一次，同步灵敏度与受订阅控制的传感器数据',async()=>{
 const h=await phoneHarness();assert.equal(h.conn.sent[0].type,'input_settings');
 h.conn.receive({type:'practice_subscription',active:true,stream:true,busyUntil:0});assert.equal(h.buttons[0].disabled,true);
 await h.elements.get('enable').onclick();const ready=h.conn.sent.find(m=>m.type==='calibrated');assert.ok(ready,'启用体感即就绪');assert.equal(ready.mode,'auto');assert.equal(ready.axis,'auto');
 for(let i=0;i<10;i++)h.sample(0,16);assert.ok(h.conn.sent.some(m=>m.type==='sensor_sample'&&m.sample.axis==='auto'));assert.ok(h.elements.get('instruction').innerHTML.includes('试挥'));assert.match(h.elements.get('detector-status').textContent,/免校准规则/);
 h.elements.get('phone-practice-arm').onclick();assert.equal(h.conn.sent.at(-1).type,'practice_arm');assert.equal(h.conn.sent.at(-1).armed,true);
 h.conn.receive({type:'practice_subscription',active:true,stream:true,armed:true,busyMs:0});assert.match(h.elements.get('phone-practice-mode').textContent,/已准备/);
 const settings={...INPUT_DEFAULTS,powerGain:1.3,directionGain:.7};h.conn.receive({type:'input_settings_request',settings,requestId:'test-tune'});
 assert.equal(h.conn.sent.at(-1).requestId,'test-tune');assert.equal(JSON.parse(h.storage.get('swinglink-input-settings')).powerGain,1.3);
 h.play(synthRecording({label:'swing',level:5,seed:77}));
 const shots=h.conn.sent.filter(m=>m.type==='test_swing');assert.equal(shots.length,1,'一次挥杆只触发一次');const shot=shots[0];assert.equal(shot.detector,'rule');assert.equal(shot.path[0],'RULE');assert.ok(shot.power>0&&shot.power<=1);assert.ok(shot.backswingMs>100&&shot.downswingMs>40,`上杆 ${shot.backswingMs} 下挥 ${shot.downswingMs}`);assert.equal(h.conn.sent.some(m=>m.type==='swing'),false);
 assert.ok(h.conn.sent.some(m=>m.type==='ml_sample'&&m.source==='play'&&m.detector==='rule'),'每一杆都入库');
 h.conn.receive({type:'practice_ack',seq:shot.seq,travel:150,targetError:3,lateral:2,club:'7 号铁杆',feedback:['方向进入目标走廊。','保持节奏。']});assert.equal(h.elements.get('phone-training-distance').textContent,'150.0 米');
 h.conn.receive({type:'practice_subscription',active:true,stream:true,armed:false,busyMs:6000});assert.equal(h.elements.get('phone-practice-arm').disabled,true);
 h.conn.receive({type:'practice_rehearsal_ack',rehearsal:true,seq:shot.seq,travel:130,targetError:20,lateral:0,club:'7 号铁杆',feedback:['试挥参考。']});assert.match(h.elements.get('phone-training-label').textContent,/球未击出/);
 h.conn.receive({type:'practice_subscription',active:false,stream:false,busyUntil:0});assert.equal(h.buttons[0].disabled,false);const count=h.conn.sent.filter(m=>m.type==='sensor_sample').length;for(let i=0;i<60;i++)h.sample(0);assert.equal(h.conn.sent.filter(m=>m.type==='sensor_sample').length,count);
 h.storage.set('swinglink-habit-peak::swing','[900,950]');h.elements.get('habit-reset').onclick();assert.equal(h.storage.get('swinglink-habit-peak::swing'),'[]');
});

test('手机正式球局显示准备按钮，未准备及已准备均持续发送陀螺仪；切到后台取消准备',async()=>{
 const h=await phoneHarness();await h.elements.get('enable').onclick();for(let i=0;i<32;i++)h.sample(0);
 h.conn.receive({type:'round_subscription',active:true,stream:true,armed:false});h.conn.receive({type:'room_state',state:{stateVersion:1,phase:'playing',armed:false}});h.conn.receive({type:'input_lock',locked:false});
 assert.equal(h.elements.get('phone-practice-arm').classList.contains('hidden'),false);assert.match(h.elements.get('instruction').innerHTML,/试挥/);assert.equal(h.elements.get('arm-main').textContent,'准备击球');
 const before=h.conn.sent.filter(m=>m.type==='sensor_sample').length;h.sample(20,100);assert.ok(h.conn.sent.filter(m=>m.type==='sensor_sample').length>before);
 h.elements.get('phone-practice-arm').onclick();assert.deepEqual(h.conn.sent.at(-1),{type:'round_arm',armed:true});
 h.conn.receive({type:'room_state',state:{stateVersion:2,phase:'playing',armed:true}});const armedCount=h.conn.sent.filter(m=>m.type==='sensor_sample').length;h.sample(30,100);assert.ok(h.conn.sent.filter(m=>m.type==='sensor_sample').length>armedCount);assert.match(h.elements.get('phone-practice-mode').textContent,/视角持续生效/);
 h.conn.receive({type:'rehearsal_ack',seq:1,travel:45});assert.match(h.elements.get('delivery').textContent,/不计杆数/);h.setHidden(true);assert.deepEqual(h.conn.sent.at(-1),{type:'round_arm',armed:false});const hiddenCount=h.conn.sent.filter(m=>m.type==='sensor_sample').length;h.sample(90,100);assert.equal(h.conn.sent.filter(m=>m.type==='sensor_sample').length,hiddenCount);
});

test('数据采集：太小的动作被忽略、不像的动作先确认，可丢弃或保存；可暂停、跳过，切到后台自动暂停',async()=>{
 const h=await phoneHarness();await h.elements.get('enable').onclick();for(let i=0;i<10;i++)h.sample(0,16);
 const trial=(index,extra={})=>({id:'s1',mode:'collect',person:'小李',index,count:5,label:'swing',labelName:'挥杆',level:4,levelText:'80% · 手上杆到肩高',onset:45,paused:false,stats:{saved:index,discarded:0,skipped:0,small:0},...extra});
 h.conn.receive({type:'ml_collect',active:true,session:trial(0)});assert.equal(h.elements.get('ml-collect').classList.contains('hidden'),false);assert.equal(h.elements.get('ml-ring').dataset.state,'settle');
 const still=[0,0,9.81],uploads=()=>h.conn.sent.filter(m=>m.type==='ml_sample'&&m.source==='collect');for(let i=0;i<50;i++)h.motion([1,1,1],still,16);assert.equal(h.elements.get('ml-ring').dataset.state,'ready');
 // 调整握姿的小动作：不记录、不报错
 for(let i=0;i<20;i++)h.motion([60+i*2,0,0],still,16);for(let i=0;i<60;i++)h.motion([1,1,1],still,16);assert.equal(uploads().length,0);assert.ok(h.conn.sent.some(m=>m.type==='ml_trial_state'&&m.small),'小动作计入“忽略”');
 for(let i=0;i<50;i++)h.motion([1,1,1],still,16);
 // 单向的大动作（例如拿起手机）：不像挥杆 → 请求确认，丢弃后重来
 for(let i=0;i<20;i++)h.motion([0,300*Math.sin(i/19*Math.PI),0],still,16);for(let i=0;i<60;i++)h.motion([1,1,1],still,16);
 assert.equal(h.elements.get('ml-review').classList.contains('hidden'),false);assert.equal(uploads().length,0);assert.ok(h.conn.sent.some(m=>m.type==='ml_trial_state'&&m.state==='review'&&m.reason));
 h.elements.get('ml-discard').onclick();assert.ok(h.conn.sent.some(m=>m.type==='ml_trial_state'&&m.discarded));assert.equal(h.elements.get('ml-review').classList.contains('hidden'),true);
 // 正常的全挥杆直接保存
 assert.match(h.elements.get('ml-tier').textContent,/80%/);assert.equal(h.elements.get('ml-tier').dataset.tier,'l4');
 h.play(synthRecording({label:'swing',level:4,seed:91}),{before:50,after:60});assert.equal(uploads().length,1);assert.equal(uploads()[0].label,'swing');assert.equal(uploads()[0].level,4);
 // 电脑端的确认指令也能保存待确认的动作
 h.conn.receive({type:'ml_collect',active:true,session:trial(1)});for(let i=0;i<50;i++)h.motion([1,1,1],still,16);for(let i=0;i<20;i++)h.motion([0,300*Math.sin(i/19*Math.PI),0],still,16);for(let i=0;i<60;i++)h.motion([1,1,1],still,16);
 assert.equal(h.elements.get('ml-review').classList.contains('hidden'),false);h.conn.receive({type:'ml_review',decision:'save'});assert.equal(uploads().length,2);
 // 暂停：自由活动不记录；继续后重新等待站稳
 h.conn.receive({type:'ml_collect',active:true,session:trial(2,{paused:true})});assert.equal(h.elements.get('ml-ring').dataset.state,'paused');assert.equal(h.elements.get('ml-pause').textContent,'继续');
 h.play(synthRecording({label:'swing',level:5,seed:3}),{before:5,after:20});assert.equal(uploads().length,2,'暂停时不记录');
 h.elements.get('ml-pause').onclick();assert.deepEqual(h.conn.sent.at(-1),{type:'ml_session',action:'resume'});h.conn.receive({type:'ml_collect',active:true,session:trial(2)});assert.equal(h.elements.get('ml-ring').dataset.state,'settle');
 h.elements.get('ml-skip').onclick();assert.deepEqual(h.conn.sent.at(-1),{type:'ml_session',action:'skip'});
 h.setHidden(true);assert.ok(h.conn.sent.some(m=>m.type==='ml_session'&&m.action==='pause'),'切到后台自动暂停');h.setHidden(false);
 h.conn.receive({type:'ml_collect',active:false,session:null});assert.equal(h.elements.get('ml-collect').classList.contains('hidden'),true);
});

test('非当前手机显示等待且不发送挥杆；订阅刷新不会打断进行中的挥杆',async()=>{
 const h=await phoneHarness();await h.elements.get('enable').onclick();for(let i=0;i<32;i++)h.sample(0);
 h.conn.receive({type:'round_subscription',active:true,canControl:false,stream:false,playerName:'同伴'});h.conn.receive({type:'room_state',state:{stateVersion:1,phase:'playing',armed:true}});h.conn.receive({type:'input_lock',locked:false});
 assert.equal(h.elements.get('phone-practice-arm').disabled,true);assert.match(h.elements.get('title').innerHTML,/同伴/);h.play(synthRecording({label:'swing',level:5,seed:77}));assert.equal(h.conn.sent.filter(m=>m.type==='swing').length,0);
 h.conn.receive({type:'round_subscription',active:true,canControl:true,stream:true,armed:false});
 const rec=synthRecording({label:'swing',level:5,seed:3}),half=Math.floor(rec.n*.45),still=[rec.a[0],rec.a[1],rec.a[2]];for(let i=0;i<40;i++)h.motion([1,-1,.5],still,16);
 for(let i=1;i<half;i++)h.motion([rec.g[i*3],rec.g[i*3+1],rec.g[i*3+2]],[rec.a[i*3],rec.a[i*3+1],rec.a[i*3+2]],rec.t[i]-rec.t[i-1]);
 h.conn.receive({type:'round_subscription',active:true,canControl:true,stream:true,armed:false});
 for(let i=half;i<rec.n;i++)h.motion([rec.g[i*3],rec.g[i*3+1],rec.g[i*3+2]],[rec.a[i*3],rec.a[i*3+1],rec.a[i*3+2]],rec.t[i]-rec.t[i-1]);for(let i=0;i<100;i++)h.motion([1,-1,.5],still,16);
 assert.equal(h.conn.sent.filter(m=>m.type==='swing').length,1);
});

test('手机仅为当前球手选杆，使用最新版本并反映换杆后取消准备',async()=>{
 const h=await phoneHarness();await h.elements.get('enable').onclick();for(let i=0;i<32;i++)h.sample(0);
 h.conn.receive({type:'round_subscription',active:true,stream:true,canControl:true,armed:true});h.conn.receive({type:'room_state',state:{stateVersion:7,phase:'playing',armed:true,clubId:'auto',selectedClub:{name:'7 号铁杆',range:165}}});h.conn.receive({type:'input_lock',locked:false});
 const select=h.elements.get('phone-club');select.value='sand';select.onchange();assert.deepEqual(h.conn.sent.at(-1),{type:'round_club',clubId:'sand',stateVersion:7});
 h.conn.receive({type:'room_state',state:{stateVersion:8,phase:'playing',armed:false,clubId:'sand',selectedClub:{name:'沙坑杆',range:55}}});assert.equal(select.value,'sand');assert.equal(h.elements.get('arm-main').textContent,'准备击球');assert.match(h.elements.get('arm-sub').textContent,/试挥/);
 h.conn.receive({type:'round_subscription',active:true,stream:false,canControl:false});assert.equal(select.disabled,true);const before=h.conn.sent.length;select.onchange();assert.equal(h.conn.sent.length,before);
 h.conn.receive({type:'round_subscription',active:true,canControl:true});h.conn.receive({type:'room_state',state:{stateVersion:9,phase:'animating'}});assert.equal(select.disabled,true);select.onchange();assert.equal(h.conn.sent.length,before);
});

test('模型识别：部署流式模型后免校准即可挥杆，按模型触发并上报识别方式，规则只作对照；可从手机切回规则',async()=>{
 const train=prepare(synthDataset({seed:51,session:'p1'}).concat(synthDataset({seed:52,session:'p2'})),{extras:true}),model=serializeModel({params:trainModel(train,{epochs:16}).params,id:'m-test',stream:STREAM_VERSION,features:2});
 const h=await phoneHarness();h.conn.receive({type:'ml_model',model,profile:null,settings:{detector:'model',threshold:.6,shadow:true}});
 assert.ok(h.conn.sent.some(m=>m.type==='ml_status'&&m.detector==='model'),'上报正在使用模型识别');assert.match(h.elements.get('detector-status').textContent,/模式识别/);
 h.conn.receive({type:'practice_subscription',active:true,stream:false,busyUntil:0,selected:true});
 await h.elements.get('enable').onclick();const cal=h.conn.sent.find(m=>m.type==='calibrated');assert.ok(cal,'无需引导校准即就绪');assert.equal(cal.mode,'model');
 const rec=synthRecording({label:'swing',level:5,seed:77}),still=[rec.a[0],rec.a[1],rec.a[2]];for(let i=0;i<70;i++)h.motion([1,-1,.5],still,16);
 for(let i=1;i<rec.n;i++)h.motion([rec.g[i*3],rec.g[i*3+1],rec.g[i*3+2]],[rec.a[i*3],rec.a[i*3+1],rec.a[i*3+2]],rec.t[i]-rec.t[i-1]);
 for(let i=0;i<120;i++)h.motion([1,-1,.5],still,16);
 const swings=h.conn.sent.filter(m=>m.type==='test_swing');assert.equal(swings.length,1,'一次挥杆只触发一次');const sw=swings[0];
 assert.equal(sw.detector,'model');assert.equal(sw.ml.label,'swing');assert.ok(sw.kin&&sw.kin.u.length>=10,'附带真实挥杆轨迹');assert.ok(Math.max(...sw.kin.u)>.6,'上杆接近完整：'+Math.max(...sw.kin.u));assert.ok(Number.isFinite(sw.kin.impactAt)&&sw.kin.impactAt>sw.kin.t0);assert.ok(sw.power>=0&&sw.power<=1&&Math.abs(sw.dir)<=1);assert.equal(sw.path[0],'MODEL');
 const play=h.conn.sent.find(m=>m.type==='ml_sample'&&m.source==='play');assert.ok(play,'模型触发的挥杆上传用于持续学习');assert.equal(play.detector,'model');assert.ok(play.device.name);assert.equal(typeof play.rule.triggered,'boolean');
 h.elements.get('detector-rule').onclick();assert.deepEqual(h.conn.sent.filter(m=>m.type==='ml_detector').at(-1),{type:'ml_detector',detector:'rule'});assert.match(h.elements.get('detector-status').textContent,/免校准规则/);
 h.elements.get('ml-record-label').value='putt';h.elements.get('ml-record-level').value='ladder';h.elements.get('ml-record-start').onclick();const start=h.conn.sent.at(-1);assert.equal(start.type,'ml_session');assert.equal(start.label,'putt');assert.equal(start.level,'ladder');
 h.elements.get('ml-record-label').value='swing';h.elements.get('ml-record-level').value='2';h.elements.get('ml-record-start').onclick();assert.equal(h.conn.sent.at(-1).level,2);
 h.elements.get('ml-record-motion').onclick();assert.equal(h.conn.sent.at(-1).mode,'motion');
});

test('小人跟随：手机实时发送挥杆姿势（上杆为正、送杆为负），动作中约每 40 毫秒一次',async()=>{
 const h=await phoneHarness();h.conn.receive({type:'practice_subscription',active:true,stream:true,busyUntil:0});await h.elements.get('enable').onclick();
 const rec=synthRecording({label:'swing',level:5,seed:12}),still=[rec.a[0],rec.a[1],rec.a[2]];for(let i=0;i<60;i++)h.motion([1,-1,.5],still,16);
 const before=h.conn.sent.length;for(let i=1;i<rec.n;i++)h.motion([rec.g[i*3],rec.g[i*3+1],rec.g[i*3+2]],[rec.a[i*3],rec.a[i*3+1],rec.a[i*3+2]],rec.t[i]-rec.t[i-1]);
 const tele=h.conn.sent.slice(before).filter(m=>m.type==='sensor_sample').map(m=>m.sample);
 assert.ok(tele.length>=Math.floor((rec.t.at(-1)-rec.t[0])/75),'动作中高频发送：'+tele.length);assert.ok(tele.every(t=>Number.isFinite(t.u)&&Number.isFinite(t.t)));
 const top=Math.max(...tele.map(t=>t.u)),low=Math.min(...tele.map(t=>t.u));assert.ok(top>.7,'上杆 u '+top);assert.ok(low<-.2,'送杆 u '+low);
 assert.ok(tele.some(t=>t.phase==='back')&&tele.some(t=>t.phase==='down'||t.phase==='follow'));
});
test('动作采样：停在肩高的动作按“停住”检查并上传；停住时挥了下去会先请你确认',async()=>{
 const h=await phoneHarness();await h.elements.get('enable').onclick();for(let i=0;i<10;i++)h.sample(0,16);
 const trial=(index,extra={})=>({id:'m1',mode:'motion',person:'小李',index,count:8,label:'other',labelName:'停在肩高',level:null,pose:'shoulder',prompt:'慢慢上杆到手在肩高，停住 1 秒，不要挥下去',onset:24,paused:false,stats:{saved:index,discarded:0,skipped:0,small:0},...extra});
 h.conn.receive({type:'ml_collect',active:true,session:trial(0)});assert.equal(h.elements.get('ml-tier').dataset.tier,'pose');assert.match(h.elements.get('ml-tier').textContent,/停住/);
 const uploads=()=>h.conn.sent.filter(m=>m.type==='ml_sample'&&m.source==='motion');
 h.play(synthRecording({label:'other',pose:'shoulder',seed:5}),{before:50,after:80});assert.equal(uploads().length,1,'停住动作上传');assert.equal(uploads()[0].pose,'shoulder');assert.equal(uploads()[0].label,'other');
 h.conn.receive({type:'ml_collect',active:true,session:trial(1)});h.play(synthRecording({label:'swing',level:4,seed:6}),{before:50,after:80});
 assert.equal(uploads().length,1);assert.equal(h.elements.get('ml-review').classList.contains('hidden'),false,'挥下去了需要确认');assert.match(h.elements.get('ml-review-text').textContent,/挥下去|停住/);
});


test('滚球手柄激活时，高尔夫体感与模型不接收动作；退出后恢复原通道',async()=>{
 const h=await phoneHarness();await h.elements.get('enable').click();h.conn.receive({type:'practice_subscription',active:true,selected:true,stream:true,busyUntil:0});
 h.conn.receive({type:'maze_subscription',active:true});h.conn.sent.length=0;for(let i=0;i<80;i++)h.sample(i<40?650:-750);assert.equal(h.conn.sent.filter(m=>['sensor_sample','test_swing','swing','ml_sample'].includes(m.type)).length,0);
 h.conn.receive({type:'maze_subscription',active:false});for(let i=0;i<10;i++)h.sample(0);assert.ok(h.conn.sent.some(m=>m.type==='sensor_sample'));
});

test('手机遥控（0.22）：正式球局显示方向与镜头面板；按钮发送方向与镜头操作，按住连续调整；手机挥杆仍保留试挥',async()=>{
 const h=await phoneHarness();await h.elements.get('enable').onclick();
 h.conn.receive({type:'input_lock',locked:false});h.conn.receive({type:'round_subscription',active:true,stream:true,canControl:true,armed:false,playerName:'球手'});
 h.conn.receive({type:'room_state',state:{stateVersion:5,phase:'playing',aim:3,clubId:'auto',armed:false,selectedClub:{id:'iron',name:'7 号铁杆',range:165}}});
 assert.equal(h.elements.get('phone-round-pad').classList.contains('hidden'),false);assert.equal(h.elements.get('prp-aim-value').textContent,'3° 右');
 const sent=type=>h.conn.sent.filter(m=>m.type===type);
 h.elements.get('prp-aim-right').click();assert.deepEqual(sent('round_aim').at(-1),{type:'round_aim',aim:4});
 const left=h.elements.get('prp-aim-left');left.onpointerdown({preventDefault(){}});assert.equal(sent('round_aim').at(-1).aim,3);h.sample(0,400);h.sample(0,130);left.onpointerup();const held=sent('round_aim').at(-1).aim;assert.ok(held<=-1,`按住连续左转到 ${held}°`);const count=sent('round_aim').length;h.sample(0,400);assert.equal(sent('round_aim').length,count,'松手后停止');
 h.elements.get('prp-aim-reset').click();assert.equal(sent('round_aim').at(-1).aim,0);
 h.elements.get('prp-cam-left').click();assert.equal(sent('round_camera').at(-1).action,'left');h.elements.get('prp-cam-in').click();assert.equal(sent('round_camera').at(-1).action,'in');
 h.elements.get('prp-view-overview').click();assert.equal(sent('round_camera').at(-1).action,'view-overview');h.elements.get('prp-cam-reset').click();assert.equal(sent('round_camera').at(-1).action,'reset');
 assert.match(h.elements.get('orb-label').textContent+h.elements.get('orb-label').innerHTML,/试挥/);
 h.conn.receive({type:'round_subscription',active:true,stream:false,canControl:false,armed:false,playerName:'同伴'});assert.equal(h.elements.get('prp-aim-left').disabled,true);assert.equal(h.elements.get('prp-cam-left').disabled,true);
 const before=h.conn.sent.length;h.elements.get('prp-cam-up').click();h.elements.get('prp-aim-right').click();assert.equal(h.conn.sent.length,before,'轮到同伴时不发送');
 h.conn.receive({type:'round_subscription',active:false,stream:false,canControl:false});assert.equal(h.elements.get('phone-round-pad').classList.contains('hidden'),true);
});
