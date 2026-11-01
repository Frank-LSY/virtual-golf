import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {TiltMapper,orientationGravity} from '../shared/maze/tilt.js';
import {vector} from '../shared/maze/physics.js';
import {LEVELS} from '../shared/maze/levels.js';
import {VERSUS_COLORS,STAGES} from '../shared/maze/endless.js';
import {Haptics,hapticsPanelHTML,bindHapticsPanel} from '../phone-web/haptics.js';

async function harness({permission='granted',secure=true}={}){
 const elements=new Map(),handlers=new Map(),visibility=new Map();let clock=0,interval;
 const el=()=>{const classes=new Set();return {className:'',textContent:'',style:{},clientWidth:200,disabled:false,classList:{toggle(k,v){v??=!classes.has(k);v?classes.add(k):classes.delete(k);},contains:k=>classes.has(k)},addEventListener(k,fn){this[k]=fn;},setPointerCapture(){},getBoundingClientRect(){return {left:0,top:0,width:200,height:200};}};};
 const root=el();Object.defineProperty(root,'innerHTML',{set(html){for(const [,id] of html.matchAll(/id="([^"]+)"/g))elements.set(id,el());}});root.querySelector=selector=>elements.get(selector.slice(1));
 const main={append(){}},document={hidden:false,createElement:()=>root,getElementById:()=>main,body:el(),addEventListener:(k,fn)=>visibility.set(k,fn)};
 const window={isSecureContext:secure,DeviceOrientationEvent:{requestPermission:async()=>permission},DeviceMotionEvent:{requestPermission:async()=>permission},addEventListener:(k,fn)=>handlers.set(k,fn)};
 const screen={orientation:{angle:90}},conn=new EventTarget();conn.sent=[];conn.send=m=>conn.sent.push(m);const receive=m=>conn.dispatchEvent(new CustomEvent('message',{detail:m}));
 const source=(await readFile(new URL('../phone-web/maze-controller.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace('export class MazeController','class MazeController');
 const buzz=[],haptics=new Haptics({nav:{vibrate:p=>{buzz.push(p);return true;}},doc:null,storage:null,now:()=>clock});
 const Controller=new Function('TiltMapper','orientationGravity','vector','LEVELS','VERSUS_COLORS','STAGES','haptics','hapticsPanelHTML','bindHapticsPanel','document','window','screen','navigator','performance','setInterval',source+'\nreturn MazeController;')(TiltMapper,orientationGravity,vector,LEVELS,VERSUS_COLORS,STAGES,haptics,hapticsPanelHTML,bindHapticsPanel,document,window,screen,{}, {now:()=>clock},fn=>{interval=fn;});
 const controller=new Controller(conn);receive({type:'ready'});receive({type:'maze_subscription',active:true,game:{phase:'playing',level:1,elapsed:0,falls:0}});
 return {controller,conn,receive,elements,screen,window,haptics,buzz,advance(ms){clock+=ms;},step(ms=33){clock+=ms;interval();},sample(beta,gamma,ms=16){clock+=ms;handlers.get('deviceorientation')({beta,gamma});},hidden(value){document.hidden=value;visibility.get('visibilitychange')();}};
}

test('实际手机摇杆发送连续加速度、松手归零；后台停止发送，重连恢复就绪',async()=>{
 const h=await harness(),c=h.controller;c.useJoystick();assert.ok(c.ready);const pad=h.elements.get('mc-pad'),e={pointerId:1,clientX:180,clientY:100,preventDefault(){}};pad.pointerdown(e);h.step();let input=h.conn.sent.filter(m=>m.type==='maze_input').at(-1);assert.equal(input.x,1);assert.equal(input.y,0);
 pad.pointerup(e);h.step();input=h.conn.sent.at(-1);assert.equal(input.x,0);assert.equal(input.y,0);const seq=input.seq;h.step();assert.ok(h.conn.sent.at(-1).seq>seq);
 h.hidden(true);assert.ok(h.conn.sent.some(m=>m.type==='maze_pause'));const n=h.conn.sent.length;h.step(1000);assert.equal(h.conn.sent.length,n);assert.equal(c.ready,false);h.hidden(false);assert.ok(c.ready);
 h.conn.dispatchEvent(new Event('offline'));assert.equal(c.ready,false);h.receive({type:'ready'});h.receive({type:'maze_subscription',active:true});assert.ok(c.ready);h.receive({type:'maze_subscription',active:false});const count=h.conn.sent.length;h.step();assert.equal(h.conn.sent.length,count);
});
test('手机横屏倾斜先静止归零，持续输出；旋转屏幕、断流会撤销就绪并重新准备',async()=>{
 const h=await harness(),c=h.controller;await c.enableTilt();assert.equal(c.ready,false);for(let i=0;i<45;i++)h.sample(0,0);assert.ok(c.ready);for(let i=0;i<40;i++)h.sample(18,0);assert.ok(c.value.x>.8&&Math.abs(c.value.y)<.01);h.step();assert.ok(h.conn.sent.some(m=>m.type==='maze_ready'&&m.ready&&m.source==='tilt'));assert.ok(h.conn.sent.at(-1).x>.8);
 h.screen.orientation.angle=-90;h.sample(18,0);assert.equal(c.ready,false);for(let i=0;i<45;i++)h.sample(18,0);assert.ok(c.ready);h.step(700);assert.equal(c.ready,false);assert.deepEqual(c.value,{x:0,y:0});assert.ok(h.elements.get('mc-notice').textContent.includes('传感器数据'));
});
test('权限拒绝、非安全连接有明确提示，摇杆始终可以使用',async()=>{
 for(const options of [{permission:'denied'},{secure:false}]){const h=await harness(options);await h.controller.enableTilt();assert.equal(h.controller.ready,false);assert.ok(h.elements.get('mc-notice').textContent.includes(options.secure===false?'HTTPS':'权限'));h.controller.useJoystick();assert.ok(h.controller.ready);}
});

test('多人对战：手机先加入再就绪；没加入不发输入；比赛中显示距离 / 崩塌 / 赛段，出局与名次清楚',async()=>{
 const h=await harness(),c=h.controller,el=id=>h.elements.get(id),sent=type=>h.conn.sent.filter(m=>m.type===type);
 h.receive({type:'maze_subscription',active:true,owner:false,mode:'versus',slot:null,joined:false,full:false,locked:false,count:1,allReady:false});
 assert.equal(c.kind,'versus');assert.equal(el('mc-join').classList.contains('hidden'),false);assert.match(el('mc-vs-text').textContent,/1 \/ 4/);
 c.useJoystick();h.conn.sent.length=0;h.step();h.step();assert.equal(sent('maze_input').length,0,'没加入对战时不发送输入');assert.equal(sent('maze_ready').length,0);
 el('mc-join').onclick();assert.deepEqual(sent('maze_join')[0],{type:'maze_join',join:true});
 h.receive({type:'maze_subscription',active:true,owner:true,mode:'versus',slot:1,joined:true,full:false,locked:false,count:2,allReady:true});
 assert.equal(sent('maze_ready').at(-1).ready,true,'加入后用已选的摇杆直接就绪');assert.equal(el('mc-vs-title').textContent,'你是 2P · 蓝色');assert.equal(el('mc-vs-start').disabled,false);
 h.step();assert.ok(sent('maze_input').length>0,'加入后发送输入');el('mc-vs-start').onclick();assert.equal(sent('maze_command').at(-1).action,'start');
 h.receive({type:'maze_versus_state',phase:'playing',elapsed:12,speed:2,stage:1,solo:false,winner:null,players:[{slot:0,alive:true,rank:null,distance:40,gap:12},{slot:1,alive:true,rank:null,distance:52,gap:5.2}],you:1});
 assert.match(el('mc-vs-text').textContent,/52 米.*崩塌在身后 5 米.*落日港湾/);assert.ok(el('mc-vs-text').classList.contains('danger'));assert.equal(el('mc-pause').classList.contains('hidden'),false);assert.equal(el('mc-leave').classList.contains('hidden'),true);
 h.receive({type:'maze_versus_state',phase:'playing',elapsed:20,speed:2,stage:1,solo:false,winner:null,players:[{slot:0,alive:true,rank:null,distance:60,gap:9},{slot:1,alive:false,rank:2,distance:58,gap:null}],you:1});
 assert.match(el('mc-vs-text').textContent,/掉下去了 · 第 2 名/);assert.equal(el('mc-pause').classList.contains('hidden'),true);
 h.receive({type:'maze_versus_state',phase:'over',elapsed:22,speed:2,stage:1,solo:false,winner:0,players:[{slot:0,alive:true,rank:1,distance:63,gap:null},{slot:1,alive:false,rank:2,distance:58,gap:null}],you:1});
 assert.match(el('mc-vs-text').textContent,/第 2 名/);assert.equal(el('mc-vs-again').classList.contains('hidden'),false);el('mc-vs-again').onclick();assert.equal(sent('maze_command').at(-1).action,'rematch');
 // 回到单人模式：对战面板收起，恢复单人按钮。
 h.receive({type:'maze_subscription',active:true,owner:true,mode:'solo',game:{phase:'playing',level:2,elapsed:3,falls:0}});assert.equal(c.kind,'solo');assert.equal(el('mc-retry').classList.contains('hidden'),false);
});

test('手机震动（0.26）：电脑转发的碰撞按力度震；单人出发 / 坠落 / 过关；对战倒计时、新赛段、崩塌心跳越近越急、出局、名次；摇杆推到边', async()=>{
 const h=await harness(),c=h.controller,el=id=>h.elements.get(id),last=()=>h.haptics.played.at(-1),count=n=>h.haptics.played.filter(x=>x===n).length;
 c.useJoystick();assert.equal(last(),'ready','手柄就绪');
 h.advance(500);h.receive({type:'maze_feel',kind:'wall',strength:.5});assert.equal(last(),'wall');assert.equal(h.buzz.at(-1),30,'力度 0.5 → 30 毫秒');
 h.advance(500);h.receive({type:'maze_feel',kind:'fall'});assert.equal(last(),'fall');h.advance(1000);h.receive({type:'maze_feel',kind:'nope'});assert.equal(last(),'fall','未知事件不震');
 h.receive({type:'maze_game_state',phase:'countdown',level:1,elapsed:0,falls:0});h.advance(400);h.receive({type:'maze_game_state',phase:'playing',level:1,elapsed:0,falls:0});assert.equal(last(),'go');
 h.advance(800);h.receive({type:'maze_game_state',phase:'won',level:1,elapsed:30,falls:1});assert.equal(last(),'success');
 // 摇杆推到边：只在越过边缘时震一次。
 h.advance(800);const pad=el('mc-pad');pad.pointerdown({pointerId:1,clientX:100,clientY:100,preventDefault(){}});pad.pointermove({pointerId:1,clientX:190,clientY:100});assert.equal(last(),'limit');const lim=count('limit');h.advance(400);pad.pointermove({pointerId:1,clientX:195,clientY:100});assert.equal(count('limit'),lim,'停在边上不重复');pad.pointerup({pointerId:1});
 // 多人对战
 h.receive({type:'maze_subscription',active:true,owner:true,mode:'versus',slot:0,joined:true,full:false,locked:false,count:2,allReady:true});assert.equal(last(),'confirm','加入对战');
 const st=(extra,players)=>h.receive({type:'maze_versus_state',elapsed:0,speed:1,stage:0,solo:false,winner:null,players:players||[{slot:0,alive:true,rank:null,distance:0,gap:null},{slot:1,alive:true,rank:null,distance:0,gap:null}],you:0,...extra});
 h.advance(600);const c0=count('count');st({phase:'countdown',countdown:3});h.advance(1000);st({phase:'countdown',countdown:1.9});st({phase:'countdown',countdown:1.8});assert.equal(count('count')-c0,2,'每一拍一下');h.advance(1000);st({phase:'playing'});assert.equal(last(),'go');
 h.advance(1500);st({phase:'playing',stage:1});assert.equal(last(),'stage');
 // 崩塌心跳：离崩塌 6 米时约 1 秒一次，2 米时约 0.5 秒一次。
 h.advance(1500);st({phase:'playing',stage:1},[{slot:0,alive:true,rank:null,distance:80,gap:6},{slot:1,alive:true,rank:null,distance:70,gap:9}]);const d0=count('danger');for(let i=0;i<60;i++)h.step(33);const far=count('danger')-d0;
 st({phase:'playing',stage:1},[{slot:0,alive:true,rank:null,distance:90,gap:2},{slot:1,alive:true,rank:null,distance:80,gap:9}]);const d1=count('danger');for(let i=0;i<60;i++)h.step(33);const near=count('danger')-d1;assert.ok(far>=1&&near>far,`远 ${far} 次 / 近 ${near} 次`);
 h.advance(800);st({phase:'playing',stage:1},[{slot:0,alive:true,rank:null,distance:95,gap:9},{slot:1,alive:false,rank:2,distance:82,gap:null}]);assert.equal(last(),'rival','对手掉下去');
 h.advance(800);h.receive({type:'maze_feel',kind:'clash',strength:.8});assert.equal(last(),'clash');
 h.advance(800);st({phase:'over',winner:0},[{slot:0,alive:true,rank:1,distance:99,gap:null},{slot:1,alive:false,rank:2,distance:82,gap:null}]);assert.equal(last(),'win','冠军');
 // 出局：转发的坠落在对战里是“出局”。
 h.advance(2000);st({phase:'playing',stage:0});h.advance(800);h.receive({type:'maze_feel',kind:'fall'});assert.equal(last(),'out');
});

test('倾斜控制只用横屏（0.26）：竖着拿时不接受倾斜、整屏提示转过来；转成横屏后归零就绪；虚拟摇杆竖屏照常', async()=>{
 const h=await harness(),c=h.controller,el=id=>h.elements.get(id),sent=type=>h.conn.sent.filter(m=>m.type===type);
 h.screen.orientation.angle=0;await c.enableTilt();assert.equal(c.mode,'tilt');assert.equal(el('mc-rotate').classList.contains('hidden'),false,'竖屏时提示转过来');assert.match(el('mc-notice').textContent,/横过来/);
 for(let i=0;i<60;i++)h.sample(10,0);assert.equal(c.ready,false,'竖屏不归零、不就绪');h.step();assert.equal(sent('maze_input').length,0,'竖屏不发倾斜输入');assert.match(el('mc-notice').textContent,/横过来/,'没有误报“没收到传感器数据”');
 h.screen.orientation.angle=90;h.window.dispatch?.('resize');for(let i=0;i<45;i++)h.sample(0,0);assert.equal(c.ready,true,'横屏后静止归零就绪');assert.equal(el('mc-rotate').classList.contains('hidden'),true);
 h.screen.orientation.angle=0;h.sample(0,0);assert.equal(c.ready,false,'又竖起来：撤销就绪');assert.equal(el('mc-rotate').classList.contains('hidden'),false);
 el('mc-rotate-stick').onclick();assert.equal(c.mode,'joystick');assert.equal(c.ready,true,'摇杆竖屏也能用');assert.equal(el('mc-rotate').classList.contains('hidden'),true);
});
