import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {TiltMapper,orientationGravity} from '../shared/maze/tilt.js';
import {vector} from '../shared/maze/physics.js';
import {LEVELS} from '../shared/maze/levels.js';

async function harness({permission='granted',secure=true}={}){
 const elements=new Map(),handlers=new Map(),visibility=new Map();let clock=0,interval;
 const el=()=>{const classes=new Set();return {className:'',textContent:'',style:{},clientWidth:200,disabled:false,classList:{toggle(k,v){v??=!classes.has(k);v?classes.add(k):classes.delete(k);},contains:k=>classes.has(k)},addEventListener(k,fn){this[k]=fn;},setPointerCapture(){},getBoundingClientRect(){return {left:0,top:0,width:200,height:200};}};};
 const root=el();Object.defineProperty(root,'innerHTML',{set(html){for(const [,id] of html.matchAll(/id="([^"]+)"/g))elements.set(id,el());}});root.querySelector=selector=>elements.get(selector.slice(1));
 const main={append(){}},document={hidden:false,createElement:()=>root,getElementById:()=>main,body:el(),addEventListener:(k,fn)=>visibility.set(k,fn)};
 const window={isSecureContext:secure,DeviceOrientationEvent:{requestPermission:async()=>permission},DeviceMotionEvent:{requestPermission:async()=>permission},addEventListener:(k,fn)=>handlers.set(k,fn)};
 const screen={orientation:{angle:90}},conn=new EventTarget();conn.sent=[];conn.send=m=>conn.sent.push(m);const receive=m=>conn.dispatchEvent(new CustomEvent('message',{detail:m}));
 const source=(await readFile(new URL('../phone-web/maze-controller.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace('export class MazeController','class MazeController');
 const Controller=new Function('TiltMapper','orientationGravity','vector','LEVELS','document','window','screen','navigator','performance','setInterval',source+'\nreturn MazeController;')(TiltMapper,orientationGravity,vector,LEVELS,document,window,screen,{}, {now:()=>clock},fn=>{interval=fn;});
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
