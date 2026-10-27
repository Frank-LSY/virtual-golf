import {GuidedCalibration,CALIBRATION_STEPS} from '../shared/calibration.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SwingDetector,mapSwing,median,SWING_CONFIG} from '../shared/swing.js';
import {INPUT_DEFAULTS,inputSettings} from '../shared/training.js';
import {chineseLog,chineseConfig,chineseCalibration,chineseCsv} from '../shared/locale.js';

// 用可控时钟与传感器事件测试实际手机控制器，不需要浏览器或真实硬件权限。
async function phoneHarness(){
 const html=await readFile(new URL('../phone-web/index.html',import.meta.url),'utf8');
 const elements=new Map();
 function element(){const classes=new Set();return {value:'',textContent:'',innerHTML:'',disabled:false,dataset:{},style:{},classList:{add:(...x)=>x.forEach(v=>classes.add(v)),remove:(...x)=>x.forEach(v=>classes.delete(v)),toggle:(v,on)=>{on??=!classes.has(v);on?classes.add(v):classes.delete(v);return on;},contains:v=>classes.has(v)},click(){return this.onclick?.();}};}
 for(const match of html.matchAll(/id="([^"]+)"/g))elements.set(match[1],element());
 const buttons=['play','practice'].map(mode=>Object.assign(element(),{dataset:{mode}}));
 const documentHandlers=new Map();const document={hidden:false,getElementById:id=>{assert.ok(elements.has(id),'DOM 元素存在：'+id);return elements.get(id);},querySelectorAll:()=>buttons,querySelector:selector=>selector.includes('practice')?buttons[1]:buttons[0],addEventListener:(k,fn)=>documentHandlers.set(k,fn)};
 const storage=new Map([['swinglink-calibration',JSON.stringify({version:SWING_CONFIG.version,peakMax:600,dirZero:0,axis:'beta'})]]),localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 let conn;class Connection extends EventTarget{constructor(){super();conn=this;this.sent=[];}send(m){this.sent.push(m);return true;}connect(){this.receive({type:'ready'});}receive(m){this.dispatchEvent(new CustomEvent('message',{detail:m}));}}
 const handlers=new Map(),window={isSecureContext:true,addEventListener:(k,fn)=>handlers.set(k,fn),removeEventListener:k=>handlers.delete(k)};let clock=1000;
 const timers=new Map(),intervals=[];let timerId=0;const setTimeout=(fn,ms)=>{const id=++timerId;timers.set(id,{fn,due:clock+ms});return id;};
 class FakeDate extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
 const injected={GuidedCalibration,CALIBRATION_STEPS,Connection,SwingDetector,mapSwing,median,SWING_CONFIG,INPUT_DEFAULTS,inputSettings,chineseLog,chineseConfig,chineseCalibration,chineseCsv,document,window,navigator:{vibrate(){}},DeviceMotionEvent:{},localStorage,sessionStorage:localStorage,performance:{now:()=>clock},Date:FakeDate,setTimeout,clearTimeout:id=>timers.delete(id),setInterval:fn=>intervals.push(fn)};
 const source=(await readFile(new URL('../phone-web/app.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');new Function(...Object.keys(injected),source)(...Object.values(injected));
 const sample=(beta,step=40)=>{clock+=step;for(const [id,t] of timers)if(t.due<=clock){timers.delete(id);t.fn();}handlers.get('devicemotion')?.({rotationRate:{alpha:0,beta,gamma:0},accelerationIncludingGravity:{y:0,z:9.8}});};
 return {conn,elements,buttons,storage,sample,advance:ms=>{clock+=ms;for(const fn of intervals)fn();},setHidden:value=>{document.hidden=value;documentHandlers.get('visibilitychange')?.();}};
}

test('手机从静止校准到训练击球，发送节奏和受订阅控制的传感器数据',async()=>{
 const h=await phoneHarness();assert.equal(h.conn.sent[0].type,'input_settings');
 h.conn.receive({type:'practice_subscription',active:true,stream:true,busyUntil:0});assert.equal(h.buttons[0].disabled,true);
 await h.elements.get('reuse-calibration').onclick();for(let i=0;i<32;i++)h.sample(0);
 assert.ok(h.conn.sent.some(m=>m.type==='calibrated'));assert.ok(h.conn.sent.some(m=>m.type==='sensor_sample'));assert.ok(h.elements.get('title').innerHTML.includes('先试挥'));
 h.elements.get('phone-practice-arm').onclick();assert.equal(h.conn.sent.at(-1).type,'practice_arm');assert.equal(h.conn.sent.at(-1).armed,true);
 h.conn.receive({type:'practice_subscription',active:true,stream:true,armed:true,busyMs:0});assert.match(h.elements.get('phone-practice-mode').textContent,/已准备/);
 const settings={...INPUT_DEFAULTS,powerGain:1.3,directionGain:.7};h.conn.receive({type:'input_settings_request',settings,requestId:'test-tune'});
 assert.equal(h.conn.sent.at(-1).requestId,'test-tune');assert.equal(JSON.parse(h.storage.get('swinglink-input-settings')).powerGain,1.3);
 for(const v of [0,150,180,100,90,-120,-300,-600,-500,-200])h.sample(v);
 const shots=h.conn.sent.filter(m=>m.type==='test_swing');assert.equal(shots.length,1);assert.equal(shots[0].backswingMs,160);assert.equal(shots[0].downswingMs,160);assert.equal(shots[0].peak,600);assert.equal(shots[0].power,1);assert.equal(h.conn.sent.some(m=>m.type==='swing'),false);
 h.conn.receive({type:'practice_ack',seq:shots[0].seq,travel:150,targetError:3,lateral:2,club:'7 号铁杆',feedback:['方向进入目标走廊。','保持节奏。']});assert.equal(h.elements.get('phone-training-distance').textContent,'150.0 米');
 h.conn.receive({type:'practice_subscription',active:true,stream:true,armed:false,busyMs:6000});assert.equal(h.elements.get('phone-practice-arm').disabled,true);
 h.conn.receive({type:'practice_rehearsal_ack',rehearsal:true,seq:shots[0].seq,travel:130,targetError:20,lateral:0,club:'7 号铁杆',feedback:['试挥参考。']});assert.match(h.elements.get('phone-training-label').textContent,/球未击出/);
 h.conn.receive({type:'practice_subscription',active:false,stream:false,busyUntil:0});assert.equal(h.buttons[0].disabled,false);const count=h.conn.sent.filter(m=>m.type==='sensor_sample').length;for(let i=0;i<60;i++)h.sample(0);assert.equal(h.conn.sent.filter(m=>m.type==='sensor_sample').length,count);
});

test('手机正式球局显示准备按钮，未准备及已准备均持续发送陀螺仪',async()=>{
 const h=await phoneHarness();await h.elements.get('reuse-calibration').onclick();for(let i=0;i<32;i++)h.sample(0);
 h.conn.receive({type:'round_subscription',active:true,stream:true,armed:false});h.conn.receive({type:'room_state',state:{stateVersion:1,phase:'playing',armed:false}});h.conn.receive({type:'input_lock',locked:false});
 assert.equal(h.elements.get('phone-practice-arm').classList.contains('hidden'),false);assert.match(h.elements.get('title').innerHTML,/先试挥/);
 const before=h.conn.sent.filter(m=>m.type==='sensor_sample').length;h.sample(20,100);assert.ok(h.conn.sent.filter(m=>m.type==='sensor_sample').length>before);
 h.elements.get('phone-practice-arm').onclick();assert.deepEqual(h.conn.sent.at(-1),{type:'round_arm',armed:true});
 h.conn.receive({type:'room_state',state:{stateVersion:2,phase:'playing',armed:true}});const armedCount=h.conn.sent.filter(m=>m.type==='sensor_sample').length;h.sample(30,100);assert.ok(h.conn.sent.filter(m=>m.type==='sensor_sample').length>armedCount);assert.match(h.elements.get('phone-practice-mode').textContent,/视角持续生效/);
 h.conn.receive({type:'rehearsal_ack',seq:1,travel:45});assert.match(h.elements.get('delivery').textContent,/不计杆数/);h.setHidden(true);assert.deepEqual(h.conn.sent.at(-1),{type:'round_arm',armed:false});const hiddenCount=h.conn.sent.filter(m=>m.type==='sensor_sample').length;h.sample(90,100);assert.equal(h.conn.sent.filter(m=>m.type==='sensor_sample').length,hiddenCount);
});

test('实际手机界面完成分步校准，只有确认后生效；后台动作不会被采用',async()=>{
 const h=await phoneHarness();await h.elements.get('enable').onclick();for(let i=0;i<32;i++)h.sample(0);
 assert.equal(h.conn.sent.some(m=>m.type==='calibrated'),false);assert.match(h.elements.get('cal-step-title').textContent,/方向/);
 const gesture=peak=>{h.elements.get('cal-start').onclick();for(const v of [0,100,110,90,80,-80,-peak*.6,-peak,-peak*.7,-peak*.2,0])h.sample(v);};
 h.elements.get('cal-start').onclick();h.sample(100);h.setHidden(true);h.setHidden(false);assert.match(h.elements.get('cal-feedback').textContent,/后台/);h.elements.get('cal-start').onclick();h.advance(2000);assert.equal(h.elements.get('cal-start').disabled,false);assert.match(h.elements.get('cal-feedback').textContent,/中断/);
 gesture(240);assert.match(h.elements.get('cal-step-title').textContent,/轻挥/);gesture(180);gesture(520);assert.match(h.elements.get('cal-step-title').textContent,/复现/);
 const gamma=Math.log(.25/.8)/Math.log(180/520),peakMax=520/(.8**(1/gamma)),peak=peakMax*.5**(1/gamma);gesture(peak);gesture(peak);
 assert.equal(h.elements.get('cal-use').classList.contains('hidden'),false);assert.equal(h.conn.sent.some(m=>m.type==='calibrated'),false);h.elements.get('cal-use').onclick();assert.ok(h.conn.sent.some(m=>m.type==='calibrated'&&m.verified));const saved=JSON.parse(h.storage.get('swinglink-calibration'));assert.equal(saved.axis,'beta');assert.equal(saved.verifyPowers.length,2);
 assert.equal(h.conn.sent.filter(m=>['swing','test_swing'].includes(m.type)).length,0);
});

test('非当前手机显示等待且不发送挥杆；同伴校准进度刷新不会打断当前挥杆',async()=>{
 const h=await phoneHarness();await h.elements.get('reuse-calibration').onclick();for(let i=0;i<32;i++)h.sample(0);
 h.conn.receive({type:'round_subscription',active:true,canControl:false,stream:false,playerName:'同伴'});h.conn.receive({type:'room_state',state:{stateVersion:1,phase:'playing',armed:true}});h.conn.receive({type:'input_lock',locked:false});
 assert.equal(h.elements.get('phone-practice-arm').disabled,true);assert.match(h.elements.get('title').innerHTML,/同伴/);for(const v of [0,150,180,100,90,-120,-300,-600,-500,-200])h.sample(v);assert.equal(h.conn.sent.filter(m=>m.type==='swing').length,0);
 h.conn.receive({type:'round_subscription',active:true,canControl:true,stream:true,armed:false});for(const v of [0,150,180,100,90])h.sample(v);
 // 另一台手机校准进度更新引起订阅刷新，主手机的半个挥杆仍需保留。
 h.conn.receive({type:'round_subscription',active:true,canControl:true,stream:true,armed:false});for(const v of [-120,-300,-600,-500,-200])h.sample(v);assert.equal(h.conn.sent.filter(m=>m.type==='swing').length,1);
});
