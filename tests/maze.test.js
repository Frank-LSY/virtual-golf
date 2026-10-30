import test from 'node:test';
import assert from 'node:assert/strict';
import {MazeGame,PHYSICS,clearance,vector,collision} from '../shared/maze/physics.js';
import {LEVELS,wallSegments} from '../shared/maze/levels.js';
import {TiltMapper,orientationGravity} from '../shared/maze/tilt.js';
import {MazeChannel} from '../local-gateway/maze-channel.js';
import {findRoute} from './maze-path.js';

test('三关几何有足够净空，且只用加速度控制能从起点真实通关',()=>{
 for(let index=0;index<3;index++){
  const level=LEVELS[index],route=findRoute(level);assert.ok(route,'第 '+(index+1)+' 关存在可走路线');
  assert.ok(clearance(level.spawn,wallSegments(level))>3);assert.ok(level.holes.every(h=>Math.hypot(h.x,h.y)>level.goalRadius+h.radius));
  const game=new MazeGame(index);game.load(index);let target=1;
  for(let i=0;i<120*800&&game.phase!=='won';i++){
   const b=game.ball,p=route[target];if(Math.hypot(p.x-b.x,p.y-b.y)<2&&target<route.length-1)target++;
   const goal=route[target],dx=goal.x-b.x,dy=goal.y-b.y,d=Math.hypot(dx,dy),speed=Math.min(30,d*3),vx=d?dx/d*speed:0,vy=d?dy/d*speed:0;
   const input=vector(((vx-b.vx)*9+PHYSICS.drag*b.vx)/PHYSICS.acceleration,((vy-b.vy)*9+PHYSICS.drag*b.vy)/PHYSICS.acceleration);
   game.advance(1/120,input);
  }
  assert.equal(game.phase,'won','关卡 '+(index+1)+' 可通关，当前坐标 '+JSON.stringify(game.ball));assert.equal(game.falls,0);assert.ok(game.results[index].elapsed>0);
 }
});
test('加速、回正滑行与反向制动遵守惯性，30/60/120Hz 结果一致',()=>{
 const values=[];
 for(const fps of [30,60,120]){const g=new MazeGame();g.load(0);g.ball={x:0,y:110,vx:0,vy:0,rollX:0,rollY:0};for(let i=0;i<fps*.4;i++)g.advance(1/fps,{x:1,y:0});values.push(g.ball.x);assert.ok(g.ball.vx>10&&g.ball.vx<PHYSICS.maxSpeed);const old=g.ball.x;g.advance(.05,{x:0,y:0});assert.ok(g.ball.x>old);const forward=g.ball.vx;g.advance(.05,{x:-1,y:0});assert.ok(g.ball.vx<forward);}
 assert.ok(Math.max(...values)-Math.min(...values)<1e-6);
});
test('高速撞墙不穿透，沿墙运动可以继续，圆弧端帽与外围都碰撞',()=>{
 const g=new MazeGame();g.load(0);g.ball={x:-240,y:0,vx:PHYSICS.maxSpeed,vy:10,rollX:0,rollY:0};for(let i=0;i<240;i++){g.advance(1/120,{x:1,y:.2});assert.ok(clearance(g.ball,g.walls)>-.01);}
 assert.ok(Math.abs(g.ball.y)>2);
 const b={x:290,y:0,vx:100,vy:40};collision(b,[]);assert.ok(Math.hypot(b.x,b.y)<=271.001);assert.ok(b.vx<0&&b.vy>0);
});
test('陷阱擦边不落洞，中心进入后计一次；复活清速度，手动重试清记录',()=>{
 const g=new MazeGame(1);g.load(1);const h=g.level.holes[0];g.ball={x:h.x+h.radius-2,y:h.y,vx:0,vy:0};g.advance(1/120);assert.equal(g.falls,0);
 g.ball={x:h.x,y:h.y,vx:12,vy:0};g.advance(1/120);assert.equal(g.phase,'falling');assert.equal(g.falls,1);for(let i=0;i<170;i++)g.advance(1/120);assert.equal(g.ball.vx,0);assert.equal(g.ball.vy,0);assert.equal(g.falls,1);assert.deepEqual({x:g.ball.x,y:g.ball.y},g.level.spawn);g.retry();assert.equal(g.falls,0);assert.equal(g.elapsed,0);
});
test('计时从首次有效输入开始，暂停冻结，准备倒计时忽略输入，低速停留才获胜',()=>{
 const g=new MazeGame();g.load(0);g.advance(.2);assert.equal(g.elapsed,0);g.advance(.1,{x:.4,y:0});assert.ok(g.started);g.pause();const before=JSON.stringify(g.ball),time=g.elapsed;g.advance(.2,{x:1,y:1});assert.equal(JSON.stringify(g.ball),before);assert.equal(g.elapsed,time);g.resume();g.advance(.2,{x:1,y:0});assert.equal(g.ball.vx,0);assert.equal(g.elapsed,time);
 g.load(0);g.ball={x:-18,y:0,vx:140,vy:0};g.advance(.2);assert.notEqual(g.phase,'won');g.ball={x:0,y:0,vx:0,vy:0};for(let i=0;i<100;i++)g.advance(1/120);assert.equal(g.phase,'won');const won=g.elapsed;g.advance(.2,{x:1,y:1});assert.equal(g.elapsed,won);g.load(2);assert.equal(g.ball.vx,0);assert.equal(g.goalTime,0);
});
test('横屏 ±90° 与竖屏方向映射、静止归零、死区、限幅和屏幕变化重置',()=>{
 for(const angle of [0,90,-90,180]){const m=new TiltMapper();let t=0;for(let i=0;i<45;i++)m.sample(orientationGravity(25,3),t+=16,angle);assert.ok(m.baseline);assert.deepEqual(m.value,{x:0,y:0});for(let i=0;i<30;i++)m.sample(orientationGravity(25,3.4),t+=16,angle);assert.ok(Math.hypot(m.value.x,m.value.y)<.001);for(let i=0;i<30;i++)m.sample(orientationGravity(25,24),t+=16,angle);assert.ok(Math.hypot(m.value.x,m.value.y)>.8&&Math.hypot(m.value.x,m.value.y)<=1.001);const changed=m.sample(orientationGravity(25,24),t+=16,angle+90);assert.equal(changed.ready,false);assert.ok(changed.changed);}
 const right=new TiltMapper();let t=0;for(let i=0;i<45;i++)right.sample(orientationGravity(0,0),t+=16,90);for(let i=0;i<30;i++)right.sample(orientationGravity(18,0),t+=16,90);assert.ok(right.value.x>.8&&Math.abs(right.value.y)<.01);
});
test('滚球通道只接受指定手机与当前电脑，拒绝旧序号，断流与断线发暂停',()=>{
 let time=1000;const host={role:'screen',clientId:'pc'},other={role:'screen',clientId:'pc2'},a={role:'phone',clientId:'a'},b={role:'phone',clientId:'b'},clients=new Set([host,other,a,b]),out=[];
 const channel=new MazeChannel(clients,(ws,m)=>out.push({ws,m}),{now:()=>time});channel.handle(host,{type:'maze_view',active:true});channel.handle(other,{type:'maze_view',active:true});assert.ok(out.some(x=>x.ws===other&&x.m.host===false));assert.throws(()=>channel.handle(b,{type:'maze_input',x:1,y:0,seq:1}),/不是当前/);
 channel.handle(a,{type:'maze_ready',ready:true,source:'tilt'});channel.handle(host,{type:'maze_input_mode',phone:true});channel.handle(a,{type:'maze_input',x:1,y:0,seq:1});time+=40;channel.handle(a,{type:'maze_input',x:0,y:1,seq:1});assert.equal(out.filter(x=>x.m.type==='maze_input').length,1);assert.throws(()=>channel.handle(a,{type:'maze_input',x:Infinity,y:0,seq:2}),/无效/);time+=600;channel.tick();assert.ok(out.some(x=>x.m.reason==='stream_gap'));clients.delete(a);channel.disconnected(a);assert.ok(out.some(x=>x.m.reason==='controller_offline'));channel.connected(b);assert.equal(channel.selectedId,'a','正在使用手机时不自动换给同伴');channel.handle(host,{type:'maze_input_mode',phone:false});channel.connected(b);assert.equal(channel.selectedId,'b','键盘模式下新接入手机可替换已离线的手柄');
});


test('第二关两条入口、第三关两条外圈路线均可通行，近路与绕行确有路程差异',()=>{
 for(const [index,ringIndex] of [[1,1],[2,0]]){
  const lengths=[];for(const gap of LEVELS[index].rings[ringIndex].gaps){const level=structuredClone(LEVELS[index]);level.rings[ringIndex].gaps=[gap];const route=findRoute(level);assert.ok(route,'第 '+(index+1)+' 关入口 '+gap.angle+' 可达中心');lengths.push(route.slice(1).reduce((s,p,i)=>s+Math.hypot(p.x-route[i].x,p.y-route[i].y),0));}
  assert.ok(Math.abs(lengths[0]-lengths[1])>100,'路线距离不只是装饰上的差别');
 }
});
test('缓慢移动不能冒充静止归零，静止后才设置基准',()=>{
 const m=new TiltMapper();let t=0;for(let i=0;i<90;i++)m.sample(orientationGravity(i*.3,0),t+=16,0);assert.equal(m.baseline,null);for(let i=0;i<45;i++)m.sample(orientationGravity(27,0),t+=16,0);assert.ok(m.baseline);
});
