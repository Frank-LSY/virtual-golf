import {cameraPose} from '../shared/maze/camera.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {RollingGame,PHYSICS,floorAt,collideWall,collideObstacle,cameraInput,worldInput} from '../shared/maze/physics.js';
import {LEVELS,surfaces,walls,obstaclePose} from '../shared/maze/levels.js';
import {TiltMapper,orientationGravity} from '../shared/maze/tilt.js';
import {MazeChannel} from '../local-gateway/maze-channel.js';
import {followRoute} from './maze-path.js';

test('三关及第三关两条分支，仅通过加速度与真实碰撞到达终点',()=>{for(let i=0;i<3;i++)for(const [name,route] of Object.entries(LEVELS[i].routes)){const g=new RollingGame(i);g.load(i);const run=followRoute(g,route);assert.equal(g.phase,'won',`${i+1}/${name} 可通关：${JSON.stringify({ball:g.ball,phase:g.phase,run})}`);assert.equal(g.falls,0);assert.ok(g.results[i].elapsed>0);}});
test('坡道与平台接缝连续，路面和护栏共享几何，近路确实更短',()=>{for(const level of LEVELS){const floors=surfaces(level);for(const route of Object.values(level.routes))for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i];if(a.board)continue;const n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.08);let previous=null;for(let j=0;j<=n;j++){const x=a.x+(b.x-a.x)*j/n,z=a.z+(b.z-a.z)*j/n,f=floorAt(floors,x,z);assert.ok(f,'路线有实体地面');const y=f.height(x,z);if(previous!==null)assert.ok(Math.abs(y-previous)<.04,`接缝无台阶 ${level.id}: ${x},${z} ${y-previous}`);previous=y;}}assert.ok(walls(level).every(w=>Math.hypot(w.b.x-w.a.x,w.b.z-w.a.z)>.0001));}const length=r=>r.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-r[i].x,p.z-r[i].z),0);assert.ok(length(LEVELS[2].routes.safe)-length(LEVELS[2].routes.short)>45);});
test('起步、惯性、反向制动与30/60/120Hz结果一致',()=>{const values=[];for(const fps of [30,60,120]){const g=new RollingGame();g.load(0);for(let i=0;i<fps*.5;i++)g.advance(1/fps,{x:0,y:-.5});assert.ok(g.ball.vz<-.5&&-g.ball.vz<PHYSICS.maxSpeed);values.push(g.ball.z);const old=g.ball.z;g.advance(.1);assert.ok(g.ball.z<old);const v=g.ball.vz;g.advance(.1,{x:0,y:1});assert.ok(g.ball.vz>v);}assert.ok(Math.max(...values)-Math.min(...values)<1e-7);});
test('高速撞护栏不穿透，沿栏移动仍有进度；移动挡块按相对速度碰撞',()=>{const g=new RollingGame();g.load(0);g.ball.z=-8;for(let i=0;i<300;i++){g.advance(1/120,{x:1,y:-.2});assert.ok(g.ball.x<3.5-PHYSICS.radius+.001);assert.equal(g.phase,'playing');}assert.ok(g.ball.z<-8.5);const b={x:0,y:6.48,z:0,vx:0,vz:-7},o={x:0,y:6,z:-.8,right:{x:1,z:0},forward:{x:0,z:-1},width:1.5,depth:1.25,height:1.4,vx:0,vz:1};assert.ok(collideObstacle(b,o)>0);assert.ok(b.vz>0);const wall={a:{x:2,y:6,z:-5},b:{x:2,y:6,z:5},radius:.14,height:.96},c={x:1.6,y:6.48,z:0,vx:7,vz:2};collideWall(c,wall);assert.ok(c.x<1.39&&c.vx<0&&c.vz===2);});
test('上下坡有重力差异，无护栏边缘真实坠落；复活到检查点清速度，重试清记录',()=>{const g=new RollingGame(1);g.load(1);g.ball={...g.ball,x:25,z:-60,y:8.26,vx:0,vz:0};g.heading=0;g.advance(.2);assert.ok(g.ball.vz<-.1,'下坡自然加速');g.ball={...g.ball,x:25,z:-76,y:6.68,vx:0,vz:0};g.advance(1/120);assert.equal(g.checkpoint,1);g.ball.x=30;g.ball.z=-84;g.ball.vx=3;g.advance(1/120);assert.equal(g.phase,'falling');const y=g.ball.y;g.advance(.2);assert.ok(g.ball.y<y);assert.equal(g.falls,1);for(let i=0;i<270;i++)g.advance(1/120);assert.equal(g.ball.x,25);assert.equal(g.ball.z,-76);assert.equal(g.ball.vx,0);assert.equal(g.ball.vz,0);g.retry();assert.equal(g.checkpoint,-1);assert.equal(g.falls,0);assert.equal(g.elapsed,0);});
test('计时从有效输入开始；暂停冻结球、障碍和计时，继续有准备过程',()=>{const g=new RollingGame(1);g.load(1);g.advance(.2);assert.equal(g.elapsed,0);g.advance(.1,{x:0,y:-1});g.pause();const state=JSON.stringify(g.ball),time=g.elapsed,pose=obstaclePose(g.level,g.level.obstacles[0],g.clock);g.advance(.2,{x:1,y:1});assert.equal(JSON.stringify(g.ball),state);assert.equal(g.elapsed,time);assert.deepEqual(obstaclePose(g.level,g.level.obstacles[0],g.clock),pose);g.resume();g.advance(.2,{x:1,y:1});assert.equal(g.elapsed,time);assert.equal(g.ball.vx,0);assert.equal(g.ball.vz,0);});
test('终点必须低速停留；切关清除速度、检查点与旧终点进度',()=>{const g=new RollingGame();g.load(0);const q=g.level.goal;g.ball={...g.ball,...q,y:q.y+PHYSICS.radius,vz:-7};g.advance(.2);assert.notEqual(g.phase,'won');g.ball={...g.ball,...q,y:q.y+PHYSICS.radius,vx:0,vz:0};for(let i=0;i<90;i++)g.advance(1/120);assert.equal(g.phase,'won');const time=g.elapsed;g.advance(.2,{x:1,y:1});assert.equal(g.elapsed,time);g.load(2);assert.equal(g.checkpoint,-1);assert.equal(g.goalTime,0);assert.equal(g.ball.vx,0);assert.equal(g.ball.vz,0);});
test('镜头按赛道平滑转向，后退不翻转；控制坐标变换可往返',()=>{const g=new RollingGame();g.load(0);g.ball={...g.ball,x:13,z:-48,y:8.88,vx:2,vz:0};const old=g.heading;g.advance(1/120);assert.ok(g.heading>old&&g.heading-old<=1.35/120+.0001);g.heading=Math.PI/2;g.ball.vx=-2;g.advance(.1);assert.ok(Math.abs(g.heading-Math.PI/2)<.05,'后退仍保持赛道朝向');for(const h of [0,.7,Math.PI,-2]){const c={x:.4,y:-.5},w=worldInput(c,h),back=cameraInput(w.x,w.z,h);assert.ok(Math.abs(c.x-back.x)<1e-8&&Math.abs(c.y-back.y)<1e-8);}});
test('横屏±90与竖屏归零、死区、限幅和屏幕变化重置',()=>{for(const angle of [0,90,-90,180]){const m=new TiltMapper();let t=0;for(let i=0;i<45;i++)m.sample(orientationGravity(25,3),t+=16,angle);assert.ok(m.baseline);for(let i=0;i<30;i++)m.sample(orientationGravity(25,3.4),t+=16,angle);assert.ok(Math.hypot(m.value.x,m.value.y)<.001);for(let i=0;i<30;i++)m.sample(orientationGravity(25,24),t+=16,angle);assert.ok(Math.hypot(m.value.x,m.value.y)>.8);assert.equal(m.sample(orientationGravity(25,24),t+=16,angle+90).ready,false);}});
test('滚球通道独占与选机，序号去重、断流暂停和断线保护',()=>{let time=1000;const host={role:'screen',clientId:'pc'},other={role:'screen',clientId:'pc2'},a={role:'phone',clientId:'a'},b={role:'phone',clientId:'b'},clients=new Set([host,other,a,b]),out=[];const channel=new MazeChannel(clients,(ws,m)=>out.push({ws,m}),{now:()=>time});channel.handle(host,{type:'maze_view',active:true});channel.handle(other,{type:'maze_view',active:true});assert.ok(out.some(x=>x.ws===other&&x.m.host===false));assert.throws(()=>channel.handle(b,{type:'maze_input',x:1,y:0,seq:1}));channel.handle(a,{type:'maze_ready',ready:true,source:'tilt'});channel.handle(host,{type:'maze_input_mode',phone:true});channel.handle(a,{type:'maze_input',x:1,y:0,seq:1});time+=40;channel.handle(a,{type:'maze_input',x:0,y:1,seq:1});assert.equal(out.filter(x=>x.m.type==='maze_input').length,1);time+=600;channel.tick();assert.ok(out.some(x=>x.m.reason==='stream_gap'));clients.delete(a);channel.disconnected(a);assert.ok(out.some(x=>x.m.reason==='controller_offline'));});


test('明确接管会暂停原窗口并撤销旧手柄就绪，始终只有一个电脑拥有控制权',()=>{const a={role:'screen'},b={role:'screen'},phone={role:'phone',clientId:'p',mazeReady:true},clients=new Set([a,b,phone]),out=[];const c=new MazeChannel(clients,(ws,m)=>out.push({ws,m}));c.handle(a,{type:'maze_view',active:true});c.handle(b,{type:'maze_view',active:true,takeover:true});assert.equal(c.host,b);assert.equal(a.mazeView,false);assert.equal(phone.mazeReady,false);assert.ok(out.some(x=>x.ws===a&&x.m.type==='maze_host'&&!x.m.host));assert.throws(()=>c.handle(a,{type:'maze_state',phase:'playing',level:1,elapsed:0,falls:0}));});


test('实际镜头水平朝向与控制基准一致，镜头在球后上方且前看',()=>{for(const h of [0,.5,Math.PI/2,Math.PI,-2]){const b={x:4,y:7,z:-30},p=cameraPose(b,h),dx=p.look.x-p.eye.x,dz=p.look.z-p.eye.z,d=Math.hypot(dx,dz),forward=worldInput({x:0,y:-1},h);assert.ok(dx/d*forward.x+dz/d*forward.z>.999999);assert.ok(p.eye.y>b.y+5);assert.ok((p.eye.x-b.x)*forward.x+(p.eye.z-b.z)*forward.z<0);assert.ok((p.look.x-b.x)*forward.x+(p.look.z-b.z)*forward.z>0);}});

// ---------- 0.21：九张地图与新机关 ----------
import {CHAPTERS,stars,moverPose,sweeperPose,levelIndex,dockFloors} from '../shared/maze/levels.js';
import {SURFACES,collideBumper,collideSweeper} from '../shared/maze/physics.js';
import {followPlan} from './maze-path.js';

test('九张地图分三章，每章三张；每条路线（含等风车、搭浮台）都能不坠落到达终点，最短路线不超过标准用时',()=>{
 assert.equal(LEVELS.length,9);assert.deepEqual(CHAPTERS.flatMap(c=>c.levels).sort(),LEVELS.map(l=>l.id).sort());
 for(const [i,level] of LEVELS.entries()){assert.equal(CHAPTERS[level.chapter].levels.includes(level.id),true);const times=[];
  for(const [name,route] of Object.entries(level.routes)){const g=new RollingGame(i);g.load(i);const run=followPlan(g,route);assert.equal(g.phase,'won',`${level.id}/${name}：${JSON.stringify({ball:g.ball,run:{...run,log:undefined}})}`);assert.equal(g.falls,0);times.push(g.elapsed);}
  assert.ok(Math.min(...times)<=level.par,`${level.id} 最短 ${Math.min(...times).toFixed(1)} 秒，标准 ${level.par} 秒`);assert.ok(Math.max(...times)<=level.par*1.6,`${level.id} 绕行路线也能拿 2 星`);}
});
test('星级：不坠落且不超时 3 星；坠落 ≤2 次且 ≤1.6 倍标准用时 2 星；完成 1 星',()=>{const l={par:60};assert.equal(stars(l,null),0);assert.equal(stars(l,{elapsed:60,falls:0}),3);assert.equal(stars(l,{elapsed:61,falls:0}),2);assert.equal(stars(l,{elapsed:50,falls:2}),2);assert.equal(stars(l,{elapsed:97,falls:1}),1);assert.equal(stars(l,{elapsed:30,falls:3}),1);});
test('加速带推一把并短暂提高上限，离开后平滑回落；冰面难加速、松手不减速，云絮很快停下',()=>{
 const i=levelIndex('bounce'),g=new RollingGame(i);g.load(i);g.ball={...g.ball,x:13,z:-50,y:10.48,vx:6.5,vz:0};g.heading=Math.PI/2;let peak=0,events=[];for(let k=0;k<120;k++){events.push(...g.advance(1/120,{x:0,y:-1}));peak=Math.max(peak,Math.hypot(g.ball.vx,g.ball.vz));}
 assert.ok(events.some(e=>e.kind==='boost'));assert.ok(peak>PHYSICS.maxSpeed+.5,'加速带让速度超过平时上限');
 const run=(surface,input,seconds,v=0)=>{const h=new RollingGame(0);h.load(0);h.floors=h.floors.map(f=>f.id==='launch'?{...f,road:{...f.road,surface}}:f);h.ball={...h.ball,x:0,z:-4,vz:-v};for(let k=0;k<seconds*120;k++)h.advance(1/120,input);return Math.hypot(h.ball.vx,h.ball.vz);};
 assert.ok(run('ice',{x:0,y:-1},.5)<run(undefined,{x:0,y:-1},.5)*.5,'冰面加速只有约三分之一');
 assert.ok(run('ice',{x:0,y:0},1,5)>4.3,'冰面松手几乎不减速');assert.ok(run(undefined,{x:0,y:0},1,5)<3.2);assert.ok(run('fluff',{x:0,y:0},1,5)<.3,'云絮很快停下');
 assert.ok(SURFACES.ice.control<.5&&SURFACES.fluff.drag>3);
});
test('弹射柱把球弹开；风车横杆按转速推球，角落安全区一整圈都碰不到',()=>{
 const b={x:0,y:6.48,z:1.2,vx:0,vz:-1},u={x:0,y:6,z:0,radius:.75,height:1.1};const hit=collideBumper(b,u);assert.ok(hit>0&&b.vz>=PHYSICS.bumperKick-.01,'正面撞上被弹回');
 const i=levelIndex('windmill'),level=LEVELS[i],s=level.sweepers[0];let touched=0,pushed=0,fastest=0;
 for(let t=0;t<2*Math.PI/Math.abs(s.speed);t+=.02){const pose=sweeperPose(s,t),pocket={x:6,y:6.48,z:-20.1,vx:0,vz:0};if(collideSweeper(pocket,pose))touched++;const mid={x:5.9,y:6.48,z:-26,vx:0,vz:0};if(collideSweeper(mid,pose)){pushed++;fastest=Math.max(fastest,Math.hypot(mid.vx,mid.vz));}}
 assert.equal(touched,0,'角落不会被扫到');assert.ok(pushed>0&&fastest>=PHYSICS.sweeperKick,'边缘中部会被横杆推开');
});
test('往返浮台：两端停靠，站在上面被带到对岸；浮台离开时走出岸边会坠落；停靠处护栏留出开口',()=>{
 const i=levelIndex('ferry'),level=LEVELS[i],m=level.movers[0];assert.equal(moverPose(m,0).docked,'a');assert.equal(moverPose(m,m.period*.6).docked,'b');assert.equal(moverPose(m,m.period*.35).docked,null);
 const g=new RollingGame(i);g.load(i);g.ball={...g.ball,x:0,y:6.48,z:-27};g.advance(1/120);assert.equal(g.riding,'ferry1');for(let k=0;k<m.period*.6*120;k++){g.advance(1/120);assert.equal(g.phase,'playing');}assert.ok(Math.abs(g.ball.z-(-41))<.2,'被带到另一端：'+g.ball.z);
 const h=new RollingGame(i);h.load(i);for(let k=0;k<m.period*.35*120;k++)h.advance(1/120);h.ball={...h.ball,x:0,y:6.48,z:-23.3,vx:0,vz:-2};for(let k=0;k<120&&h.phase==='playing';k++)h.advance(1/120,{x:0,y:-1});assert.equal(h.falls,1,'浮台不在时走出岸边会坠落');
 const docks=dockFloors(level);assert.equal(docks.length,6);const blocked=g.walls.filter(w=>Math.abs(w.a.z+24)<.01&&Math.abs(w.b.z+24)<.01&&Math.min(w.a.x,w.b.x)<2.9&&Math.max(w.a.x,w.b.x)>-2.9);assert.equal(blocked.length,0,'登船口没有护栏');
});
