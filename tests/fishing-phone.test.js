import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {RodMapper,CastDetector,REJECT_TEXT} from '../shared/fishing/input.js';
import {FISH,VERSUS_PALETTE,PREFER_TIPS,WATERS,waterAt,waterById,inWeeds,polar,castDistance,aimFromRoll,clamp} from '../shared/fishing/rules.js';
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
 const Controller=new Function('RodMapper','CastDetector','REJECT_TEXT','FISH','VERSUS_PALETTE','PREFER_TIPS','WATERS','waterAt','waterById','inWeeds','polar','castDistance','aimFromRoll','clamp','haptics','hapticsPanelHTML','bindHapticsPanel','document','window','screen','navigator','setInterval',source+'\nreturn FishingController;')(RodMapper,CastDetector,REJECT_TEXT,FISH,VERSUS_PALETTE,PREFER_TIPS,WATERS,waterAt,waterById,inWeeds,polar,castDistance,aimFromRoll,clamp,haptics,hapticsPanelHTML,bindHapticsPanel,document,window,{orientation:{angle:0}},navigator,fn=>{interval=fn;});
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

test('手机鱼竿：咬钩出现“抬竿！”；中鱼后变成转轮：转圈发出收线速度、每 1/4 圈轻震；冲刺时叫停；往一边钻提示往反方向倾；杂物提示剪线；上岸 / 逃鱼', async()=>{
 const h=await harness({vibrate:true});h.receive({type:'fish_subscription',active:true,joined:true,slot:1,count:2,full:false,locked:false,allReady:true});h.c.useTouch();
 const F=o=>({T:.5,E:.6,D:9,behavior:'swim',type:'carp',kind:'fish',kg:2.4,points:252,lat:0,width:3.8,snagName:'石头',slack:0,crank:0,dashDir:0,...o});
 h.receive(personal({phase:'bite'},{events:[{kind:'bite'}]}));assert.equal(h.hidden('fc-hook'),false);assert.ok(h.el('fc-hook').classList.contains('now'));h.el('fc-hook').onclick();assert.equal(h.sent('fish_hook').length,1);assert.equal(h.haptics.played.at(-1),'bite');assert.deepEqual(h.buzz.at(-1),[40,60,40]);
 h.receive(personal({phase:'fight',fight:F({})},{events:[{kind:'hook',name:'鲤鱼',kg:2.4,catchKind:'fish',points:252}]}));
 assert.equal(h.hidden('fc-reel'),false,'中鱼后出现转轮');assert.equal(h.hidden('fc-pad'),true);assert.equal(h.hidden('fc-live'),true);assert.match(h.el('fc-notice').textContent,/鲤鱼 约 2.4 kg/);assert.match(h.el('fc-catch-name').textContent,/鲤鱼 · 约 2.4 kg/);assert.equal(h.el('fc-abandon').textContent,'剪线');assert.equal(h.haptics.played.at(-1),'hook');
 // 拇指在圈上转一圈（约 0.5 秒，正常转轮速度）：每 1/4 圈轻震，竿姿里带上收线速度（圈/秒）；松手后归零。
 const wheel=h.el('fc-wheel'),at=a=>({pointerId:7,clientX:100+50*Math.cos(a),clientY:70+50*Math.sin(a)});wheel.fire('pointerdown',at(0));const reels=h.haptics.played.filter(n=>n==='reel').length;
 for(let i=1;i<=24;i++){h.advance(20);wheel.fire('pointermove',at(i*Math.PI/12));}
 assert.ok(h.haptics.played.filter(n=>n==='reel').length>=reels+3,'每 1/4 圈轻震');h.step();assert.ok(h.sent('fish_pose').at(-1).crank>1.5,'发出收线速度');
 wheel.fire('pointerup',at(0));h.advance(400);h.step();assert.equal(h.sent('fish_pose').at(-1).crank,0,'停手后收线速度归零');
 // 冲刺：叫停；还在转就提醒线要断；张力圈变红，心跳限频。
 h.receive(personal({phase:'fight',fight:F({behavior:'dash',T:.97,crank:2})},{events:[{kind:'dash'}]}));assert.match(h.el('fc-wheel-say').textContent,/停/);assert.match(h.el('fc-wheel-sub').textContent,/线要断/);assert.equal(h.el('fc-wheel-tension').dataset.level,'danger');assert.match(h.el('fc-notice').textContent,/停/);
 h.advance(1000);const before=h.haptics.played.filter(n=>n==='strain').length;h.step();h.step();assert.equal(h.haptics.played.filter(n=>n==='strain').length,before+1,'张力心跳限频');
 h.receive(personal({phase:'fight',fight:F({behavior:'telegraph',T:.4})},{events:[{kind:'telegraph'}]}));assert.match(h.el('fc-notice').textContent,/准备停手/);assert.match(h.el('fc-wheel-say').textContent,/要冲/);
 h.receive(personal({phase:'fight',fight:F({behavior:'tired',E:.2})},{events:[{kind:'tired'}]}));assert.match(h.el('fc-wheel-say').textContent,/快转/);
 // 往右钻 → 提示往左倾；触控时按住左键 = 往左倾，松开回正。
 h.receive(personal({phase:'fight',fight:F({lat:2,width:2.6,snagName:'水草'})},{events:[{kind:'snag_warn',dir:1,name:'水草'}]}));assert.match(h.el('fc-lean-hint').textContent,/往右钻.*往左倾/);assert.ok(h.el('fc-lean-left').classList.contains('now'));assert.match(h.el('fc-notice').textContent,/往右钻水草了.*往左倾/);
 h.el('fc-lean-left').fire('pointerdown',{});for(let i=0;i<10;i++)h.step();assert.ok(h.sent('fish_pose').at(-1).roll<-15,'按住左键往左倾');h.el('fc-lean-left').fire('pointerup',{});for(let i=0;i<10;i++)h.step();assert.equal(h.sent('fish_pose').at(-1).roll,0,'松开回正');
 h.receive(personal({phase:'fight',fight:F({kind:'junk',type:'boot',kg:2,points:5})}));assert.match(h.el('fc-wheel-sub').textContent,/剪线/);
 h.receive(personal({phase:'landed',score:252,last:{name:'鲤鱼',points:252}},{events:[{kind:'landed',catch:{name:'鲤鱼',kg:2.4,points:252}}]}));assert.match(h.el('fc-notice').textContent,/上岸.*鲤鱼 2.4 kg.*252/);assert.equal(h.haptics.played.at(-1),'success');assert.match(h.el('fc-score').textContent,/252 分/);assert.equal(h.hidden('fc-reel'),true);
 h.receive(personal({phase:'lost',lost:'break'},{events:[{kind:'lost',reason:'break'}]}));assert.match(h.el('fc-notice').textContent,/硬收/);assert.equal(h.haptics.played.at(-1),'fail');
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

test('0.28.1 触控：左右拖动瞄准松手保持；从最低点往上划抛出（带着瞄准）；搏鱼按下不跳、松手慢慢放回', async()=>{
 const h=await harness();h.receive({type:'fish_subscription',active:true,joined:true,slot:0,count:1,full:false,locked:false,allReady:true});h.c.useTouch();
 const pad=h.el('fc-pad'),fire=(k,x,y)=>pad.fire(k,{pointerId:1,clientX:x,clientY:y}),pose=()=>{h.step();return h.sent('fish_pose').at(-1);};
 h.receive(personal({phase:'aim'},{players:1}));
 fire('pointerdown',100,70);fire('pointermove',150,70);fire('pointerup',150,70);
 const aimed=pose().roll;assert.ok(aimed>12&&aimed<18,'右拖约半格 ≈ 右倾 15°');h.step();h.step();assert.equal(pose().roll,aimed,'松手后瞄准保持');
 h.receive(personal({phase:'armed'},{players:1}));
 fire('pointerdown',100,110);h.advance(200);fire('pointermove',100,125);// 先往下：起点跟到最低处，停顿不算进划动时间
 h.advance(60);fire('pointermove',100,80);assert.match(h.el('fc-pad-label').textContent,/约 \d+ 米/,'拖动时显示大概距离');
 h.advance(60);fire('pointermove',100,40);h.advance(60);fire('pointerup',100,35);
 const cast=h.sent('fish_cast').at(-1);assert.ok(cast,'划出去了');assert.ok(Math.abs(cast.aimRoll-aimed)<.1,'抛竿用保持的瞄准');assert.ok(Math.abs(cast.dir)<1,'竖直划不额外偏转');
 h.receive(personal({phase:'lure'},{players:1}));
 assert.equal(pose().pitch,0,'进入诱鱼时竿归位、不带侧倾');assert.equal(h.sent('fish_pose').at(-1).roll,0);
 fire('pointerdown',100,10);assert.equal(pose().pitch,0,'按在顶部不会一下跳到最高');
 fire('pointermove',100,-40);pose();assert.ok(h.sent('fish_pose').at(-1).pitch<5,'竿有惯性，不会一下甩上去');for(let i=0;i<8;i++)h.step();const up=pose().pitch;assert.ok(up>10,'往上推抬竿');
 fire('pointerup',100,-40);const after=pose().pitch;assert.ok(after<up&&after>0,'松手后慢慢放回，不是瞬间');
 for(let i=0;i<40;i++)h.step();assert.equal(h.sent('fish_pose').at(-1).pitch,0,'最后放回原位');
 fire('pointerdown',100,70);fire('pointermove',100,400);for(let i=0;i<15;i++)h.step();assert.equal(pose().pitch,-3,'最低只到 -3°，不会一拉就松线');fire('pointerup',100,400);
});
