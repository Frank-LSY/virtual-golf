import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {TiltMapper,orientationGravity} from '../shared/maze/tilt.js';
import {vector} from '../shared/maze/physics.js';
import {LEVELS} from '../shared/maze/levels.js';
import {VERSUS_COLORS,STAGES} from '../shared/maze/endless.js';

async function harness({permission='granted',secure=true}={}){
 const elements=new Map(),handlers=new Map(),visibility=new Map();let clock=0,interval;
 const el=()=>{const classes=new Set();return {className:'',textContent:'',style:{},clientWidth:200,disabled:false,classList:{toggle(k,v){v??=!classes.has(k);v?classes.add(k):classes.delete(k);},contains:k=>classes.has(k)},addEventListener(k,fn){this[k]=fn;},setPointerCapture(){},getBoundingClientRect(){return {left:0,top:0,width:200,height:200};}};};
 const root=el();Object.defineProperty(root,'innerHTML',{set(html){for(const [,id] of html.matchAll(/id="([^"]+)"/g))elements.set(id,el());}});root.querySelector=selector=>elements.get(selector.slice(1));
 const main={append(){}},document={hidden:false,createElement:()=>root,getElementById:()=>main,body:el(),addEventListener:(k,fn)=>visibility.set(k,fn)};
 const window={isSecureContext:secure,DeviceOrientationEvent:{requestPermission:async()=>permission},DeviceMotionEvent:{requestPermission:async()=>permission},addEventListener:(k,fn)=>handlers.set(k,fn)};
 const screen={orientation:{angle:90}},conn=new EventTarget();conn.sent=[];conn.send=m=>conn.sent.push(m);const receive=m=>conn.dispatchEvent(new CustomEvent('message',{detail:m}));
 const source=(await readFile(new URL('../phone-web/maze-controller.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace('export class MazeController','class MazeController');
 const Controller=new Function('TiltMapper','orientationGravity','vector','LEVELS','VERSUS_COLORS','STAGES','document','window','screen','navigator','performance','setInterval',source+'\nreturn MazeController;')(TiltMapper,orientationGravity,vector,LEVELS,VERSUS_COLORS,STAGES,document,window,screen,{}, {now:()=>clock},fn=>{interval=fn;});
 const controller=new Controller(conn);receive({type:'ready'});receive({type:'maze_subscription',active:true,game:{phase:'playing',level:1,elapsed:0,falls:0}});
 return {controller,conn,receive,elements,screen,window,step(ms=33){clock+=ms;interval();},sample(beta,gamma,ms=16){clock+=ms;handlers.get('deviceorientation')({beta,gamma});},hidden(value){document.hidden=value;visibility.get('visibilitychange')();}};
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
