import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {RodMapper,CastDetector,REJECT_TEXT} from '../shared/fishing/input.js';
import {FISH,VERSUS_PALETTE,PREFER_TIPS} from '../shared/fishing/rules.js';
import {Haptics,hapticsPanelHTML,bindHapticsPanel} from '../phone-web/haptics.js';
// 手机鱼竿：用最小的假 DOM 运行真实的 phone-web/fishing-controller.js。
async function harness({vibrate=false}={}){
 const elements=new Map(),handlers=new Map(),docHandlers=new Map();let clock=0,interval;const buzz=[];
 const el=()=>{const classes=new Set(),listeners={};return {textContent:'',style:{},dataset:{},disabled:false,checked:true,classList:{toggle(k,v){v??=!classes.has(k);v?classes.add(k):classes.delete(k);},contains:k=>classes.has(k)},addEventListener(k,fn){listeners[k]=fn;},fire(k,e){listeners[k]?.(e);},setPointerCapture(){},getBoundingClientRect(){return {left:0,top:0,width:200,height:140};}};};
 const root=el();Object.defineProperty(root,'innerHTML',{set(html){for(const [,id] of html.matchAll(/id="([^"]+)"/g))elements.set(id,el());}});root.querySelector=s=>elements.get(s.slice(1));
 const document={hidden:false,title:'',createElement:()=>root,getElementById:()=>({append(){}}),body:el(),addEventListener:(k,fn)=>docHandlers.set(k,fn)};
 const window={isSecureContext:true,DeviceOrientationEvent:{requestPermission:async()=>'granted'},DeviceMotionEvent:{requestPermission:async()=>'granted'},addEventListener:(k,fn)=>handlers.set(k,fn)};
 const navigator=vibrate?{vibrate:p=>{buzz.push(p);return true;}}:{};
 const conn=new EventTarget();conn.sent=[];conn.send=m=>conn.sent.push(m);const receive=m=>conn.dispatchEvent(new CustomEvent('message',{detail:m}));
 const source=(await readFile(new URL('../phone-web/fishing-controller.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace('export class FishingController','class FishingController');
 const haptics=new Haptics({nav:vibrate?{vibrate:p=>{buzz.push(p);return true;}}:{},doc:null,storage:null,now:()=>clock});
 const Controller=new Function('RodMapper','CastDetector','REJECT_TEXT','FISH','VERSUS_PALETTE','PREFER_TIPS','haptics','hapticsPanelHTML','bindHapticsPanel','document','window','screen','navigator','setInterval',source+'\nreturn FishingController;')(RodMapper,CastDetector,REJECT_TEXT,FISH,VERSUS_PALETTE,PREFER_TIPS,haptics,hapticsPanelHTML,bindHapticsPanel,document,window,{orientation:{angle:0}},navigator,fn=>{interval=fn;});
 const c=new Controller(conn,{now:()=>clock});receive({type:'ready'});
 return {c,conn,receive,haptics,el:id=>elements.get(id),hidden:id=>elements.get(id).classList.contains('hidden'),sent:t=>conn.sent.filter(m=>m.type===t),step(ms=33){clock+=ms;interval();},advance(ms){clock+=ms;},orient(beta,gamma,ms=16){clock+=ms;handlers.get('deviceorientation')({beta,gamma});},buzz,document};
}
const personal=(you,extra={})=>({type:'fish_personal',state:{phase:'playing',mode:'match',round:1,rounds:2,timeLeft:80,players:2,waiting:[],you:{slot:1,phase:'aim',score:0,count:0,rank:1,fight:null,fish:null,...you},...extra},events:extra.events||[]});

test('手机鱼竿：先加入；触控模式直接就绪并发送竿姿；没加入不发送任何输入', async()=>{
 const h=await harness();h.receive({type:'fish_subscription',active:true,joined:false,slot:null,count:1,full:false,locked:false,allReady:false});
 assert.equal(h.hidden('fc-join-card'),false);assert.equal(h.hidden('fc-main'),true);assert.equal(h.document.body.classList.contains('fish-phone-active'),true);
 h.c.useTouch();h.step();assert.equal(h.sent('fish_pose').length,0,'没加入不发竿姿');assert.equal(h.sent('fish_ready').length,0);
 h.el('fc-join').onclick();assert.deepEqual(h.sent('fish_join')[0],{type:'fish_join',join:true});
 h.receive({type:'fish_subscription',active:true,joined:true,slot:1,count:2,full:false,locked:false,allReady:true});
 assert.equal(h.sent('fish_ready').at(-1).ready,true);assert.equal(h.sent('fish_ready').at(-1).source,'touch');assert.equal(h.el('fc-name').textContent,'你是 2P · 蓝色');assert.equal(h.hidden('fc-pad'),false);
 h.step();h.step();assert.ok(h.sent('fish_pose').length>=2);assert.ok(h.sent('fish_pose').every((m,i,a)=>i===0||m.seq>a[i-1].seq),'序号递增');
 h.el('fc-start').onclick();assert.equal(h.sent('fish_command').at(-1).action,'start');
});

test('手机鱼竿：体感模式静止归零后才就绪；准备后在手机上识别后引 + 前挥，只发一次抛投', async()=>{
 const h=await harness();h.receive({type:'fish_subscription',active:true,joined:true,slot:0,count:1,full:false,locked:false,allReady:true});
 await h.c.enableMotion();assert.equal(h.c.mode,'motion');assert.equal(h.c.ready,false);for(let i=0;i<45;i++)h.orient(30,0);assert.equal(h.c.ready,true);assert.equal(h.sent('fish_ready').at(-1).ready,true);
 h.receive(personal({slot:0,phase:'armed'},{events:[{kind:'armed'}]}));assert.equal(h.c.cast.armed,true);assert.match(h.el('fc-arm').textContent,/挥竿/);
 for(let i=1;i<=20;i++)h.orient(30+40*i/20,0);for(let i=1;i<=6;i++)h.orient(70-50*i/6,0);for(let i=0;i<5;i++)h.orient(20,0);
 const casts=h.sent('fish_cast');assert.equal(casts.length,1);assert.ok(casts[0].power>0&&casts[0].power<=1);assert.ok(casts[0].eventId);
 for(let i=1;i<=20;i++)h.orient(20+40*i/20,0);for(let i=1;i<=6;i++)h.orient(60-50*i/6,0);assert.equal(h.sent('fish_cast').length,1,'一次准备只抛一次');
 h.receive(personal({slot:0,phase:'lure'}));assert.equal(h.c.cast.armed,false);assert.equal(h.el('fc-arm').textContent,'收线重抛');
});

test('手机鱼竿：咬钩 / 搏鱼 / 上岸 / 逃鱼的提示与张力条；触控时出现“抬竿！”；震动按事件限频', async()=>{
 const h=await harness({vibrate:true});h.receive({type:'fish_subscription',active:true,joined:true,slot:1,count:2,full:false,locked:false,allReady:true});h.c.useTouch();
 h.receive(personal({phase:'bite'},{events:[{kind:'bite'}]}));assert.equal(h.hidden('fc-hook'),false);assert.ok(h.el('fc-hook').classList.contains('now'));h.el('fc-hook').onclick();assert.equal(h.sent('fish_hook').length,1);assert.equal(h.haptics.played.at(-1),'bite');assert.deepEqual(h.buzz.at(-1),[40,60,40]);
 h.receive(personal({phase:'fight',fight:{T:.93,E:.6,D:9,S:0,behavior:'swim',type:'perch',weed:0}},{events:[{kind:'hook'}]}));assert.equal(h.hidden('fc-tension'),false);assert.equal(h.el('fc-tension-fill').dataset.level,'danger');assert.match(h.el('fc-tip').textContent,/太紧/);
 assert.equal(h.haptics.played.at(-1),'hook');h.advance(1000);const before=h.haptics.played.filter(n=>n==='strain').length;h.step();h.step();assert.equal(h.haptics.played.filter(n=>n==='strain').length,before+1,'张力心跳限频');
 // 收线棘轮：每收回约 1 米轻震一下；鱼往外拉不震。
 h.advance(500);h.receive(personal({phase:'fight',fight:{T:.5,E:.6,D:8.5,S:0,behavior:'swim',type:'perch',weed:0}}));h.receive(personal({phase:'fight',fight:{T:.5,E:.6,D:7.4,S:0,behavior:'swim',type:'perch',weed:0}}));assert.equal(h.haptics.played.at(-1),'reel');
 h.advance(500);h.receive(personal({phase:'fight',fight:{T:.5,E:.6,D:9,S:0,behavior:'swim',type:'perch',weed:0}}));assert.equal(h.haptics.played.at(-1),'reel','往外拉不震');h.advance(2000);
 h.receive(personal({phase:'fight',fight:{T:.4,E:.6,D:9,S:0,behavior:'telegraph',type:'perch',weed:0}},{events:[{kind:'telegraph'}]}));assert.match(h.el('fc-notice').textContent,/放低/);
 h.receive(personal({phase:'landed',score:220,last:{name:'芦苇鲈鱼',points:220}},{events:[{kind:'landed',catch:{name:'芦苇鲈鱼',points:220}}]}));assert.match(h.el('fc-notice').textContent,/上岸.*220/);assert.equal(h.haptics.played.at(-1),'success');assert.match(h.el('fc-score').textContent,/220 分/);
 h.receive(personal({phase:'lost',lost:'break'},{events:[{kind:'lost',reason:'break'}]}));assert.match(h.el('fc-notice').textContent,/硬拉/);assert.equal(h.haptics.played.at(-1),'fail');
 h.receive(personal({phase:'aim'},{phase:'paused',pauseReason:'stream_gap',waiting:[2]}));assert.match(h.el('fc-state').textContent,/暂停/);assert.match(h.el('fc-tip').textContent,/3P/);
 h.receive(personal({phase:'done',rank:2},{phase:'over'}));assert.equal(h.hidden('fc-again'),false);h.el('fc-again').onclick();assert.equal(h.sent('fish_command').at(-1).action,'rematch');
});

test('手机鱼竿：放弃本竿要点两次；切到后台会通知暂停；离开钓鱼页面后收起', async()=>{
 const h=await harness();h.receive({type:'fish_subscription',active:true,joined:true,slot:0,count:1,full:false,locked:false,allReady:true});h.c.useTouch();
 h.receive(personal({slot:0,phase:'fight',fight:{T:.4,E:.5,D:6,S:0,behavior:'swim',type:'small',weed:0}}));
 h.el('fc-abandon').onclick();assert.equal(h.sent('fish_abandon').length,0);assert.match(h.el('fc-abandon').textContent,/确认/);h.advance(500);h.el('fc-abandon').onclick();assert.equal(h.sent('fish_abandon').length,1);
 h.document.hidden=true;h.receive({type:'noop'});h.c.active&&h.c.sendReady(false);h.c.send({type:'fish_pause'});assert.equal(h.sent('fish_pause').length,1);
 h.receive({type:'fish_subscription',active:false,joined:true,slot:0});assert.equal(h.document.body.classList.contains('fish-phone-active'),false);
});
