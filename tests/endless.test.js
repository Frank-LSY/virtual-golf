import test from 'node:test';
import assert from 'node:assert/strict';
import {EndlessTrack,VersusGame,ENDLESS,STAGES,VERSUS_COLORS,progressOf,stageBlend,difficulty} from '../shared/maze/endless.js';
import {PHYSICS} from '../shared/maze/physics.js';
import {roadFrame} from '../shared/maze/levels.js';
import {runBots} from './endless-bot.js';

const box=p=>{const n=p.node,h=n.size/2;return {x0:n.x-h,x1:n.x+h,z0:n.z-h,z1:n.z+h};};
test('无尽赛道：同一种子生成同一条路；道路首尾相接、高度连续、不和自己重叠', ()=>{
 const a=new EndlessTrack(42),b=new EndlessTrack(42),c=new EndlessTrack(43);a.ensure(900);b.ensure(900);c.ensure(900);
 const sig=t=>t.pieces.map(p=>`${p.kind}:${p.link}:${p.node.x.toFixed(2)},${p.node.z.toFixed(2)},${p.node.y.toFixed(2)}`).join('|');
 assert.equal(sig(a),sig(b));assert.notEqual(sig(a),sig(c));assert.ok(a.pieces.length>25);
 for(const piece of a.pieces){
  for(const r of piece.roads){const f=roadFrame(r);for(let u=.2;u<f.length-.2;u+=.5){const x=r.a.x+f.forward.x*u,z=r.a.z+f.forward.z*u,floor=a.floorAt(x,z,-Infinity);assert.ok(floor,`第 ${piece.index} 块中线 ${u.toFixed(1)} 米处有地面`);assert.ok(Math.abs(floor.height(x,z)-(r.a.y+f.slope*u))<1e-6,'地面高度与道路一致');}}
  const n=piece.node,top=a.floorAt(n.x,n.z,-Infinity);assert.ok(Math.abs(top.height(n.x,n.z)-n.y)<1e-6);
  assert.ok(n.y>=ENDLESS.band[0]-1e-9&&n.y<=ENDLESS.band[1]+1e-9,'高度留在 3–12 米之间');
 }
 // 不相邻的节点平台互不重叠；整体朝 -Z 前进。
 for(let i=0;i<a.pieces.length;i++)for(let j=i+2;j<a.pieces.length;j++){const p=box(a.pieces[i]),q=box(a.pieces[j]);assert.ok(p.x1<=q.x0||q.x1<=p.x0||p.z1<=q.z0||q.z1<=p.z0,`节点 ${i} 与 ${j} 不重叠`);}
 for(let i=1;i<a.pieces.length;i++)assert.ok(a.pieces[i].node.z<=a.pieces[i-1].node.z+1e-9,'不会往回走');
 assert.ok(a.pieces.every(p=>p.dirOut!=='S'));
});

test('越往前越难：路变窄、护栏变少，窄桥 / 冰面 / 挡块 / 弹射花园 / 风车只在后段出现', ()=>{
 const stats={early:{w:0,n:0,open:0},late:{w:0,n:0,open:0}},kinds=new Set();let firstSpecial=Infinity;
 for(const seed of [1,2,3,4,5,6]){const t=new EndlessTrack(seed);t.ensure(1100);for(const p of t.pieces.slice(1)){const s=p.d<.25?stats.early:p.d>=.85?stats.late:null;for(const r of p.roads){if(s){s.w+=r.width;s.n++;if(!r.rails)s.open++;}}kinds.add(p.kind);kinds.add(p.link);if(['bridge','ice','block'].includes(p.link)||['garden','mill'].includes(p.kind))firstSpecial=Math.min(firstSpecial,p.s0);if(p.link==='bridge')assert.ok(p.d>=.12);if(p.link==='ice')assert.ok(p.d>=.34);if(p.kind==='mill')assert.ok(p.d>=.3);}}
 const avg=s=>s.w/s.n,open=s=>s.open/s.n;assert.ok(avg(stats.late)<avg(stats.early)-1,`平均路宽 ${avg(stats.early).toFixed(1)} → ${avg(stats.late).toFixed(1)} 米`);assert.ok(open(stats.late)>open(stats.early)+.2,`无护栏比例 ${open(stats.early).toFixed(2)} → ${open(stats.late).toFixed(2)}`);
 for(const k of ['turn','rest','garden','mill','flat','slope','bridge','ice','block'])assert.ok(kinds.has(k),k);assert.ok(firstSpecial>=70,'开头一段没有机关');
 assert.equal(difficulty(0),0);assert.equal(difficulty(5000),1);
});

test('崩塌：开跑 3 秒后从起点后方开始，越来越快；道路按 3 米一格塌，平台整块塌；停着不动一定会掉', ()=>{
 const g=new VersusGame([{id:'solo',name:'小李'}],{seed:9});assert.equal(g.phase,'countdown');assert.equal(g.solo,true);
 for(let i=0;i<ENDLESS.countdown*120+10;i++)g.advance(PHYSICS.step,{});assert.equal(g.phase,'playing');assert.equal(g.front,ENDLESS.collapse.from);
 const road=g.track.pieces.flatMap(p=>p.floors).find(f=>f.road&&f.tiles.n>=3),r=road.road,{v0,tl}=road.tiles,f=road.frame,at=u=>({x:r.a.x+f.forward.x*u,z:r.a.z+f.forward.z*u}),p=at(v0+tl*1.5);
 assert.equal(road.solid(p.x,p.z,r.s0+v0+tl*1.9),true);assert.equal(road.solid(p.x,p.z,r.s0+v0+tl*2+1e-6),false,'第二格的远端被越过就塌了');
 const start=g.track.pieces[0].floors[0];assert.equal(start.solid(0,0,5.4),true);assert.equal(start.solid(0,0,5.6),false);
 const events=[];let speeds=[];for(let i=0;i<120*40&&g.phase!=='over';i++){events.push(...g.advance(PHYSICS.step,{}));if(i%240===0)speeds.push(g.speed);}
 assert.ok(events.some(e=>e.kind==='collapse'));const fall=events.find(e=>e.kind==='fall');assert.ok(fall,'原地不动会被崩塌吞掉');assert.equal(fall.cause,'collapse');assert.equal(g.phase,'over');assert.equal(g.players[0].rank,1);
 assert.ok(speeds.at(-1)>speeds[1],'崩塌在加速');
 // 加时：超过最高速度后继续加快；离最后一名太远时追上来。
 const late=new VersusGame([{id:'a'}],{seed:9});late.phase='playing';late.started=true;late.elapsed=200;late.collapsing=true;late.players[0].s=late.front+10;late.tick(PHYSICS.step,{});assert.ok(late.speed>ENDLESS.collapse.max+1);
 const far=new VersusGame([{id:'a'}],{seed:9});far.phase='playing';far.started=true;far.elapsed=10;far.players[0].s=far.front+60;far.tick(PHYSICS.step,{});assert.ok(far.speed>ENDLESS.collapse.base+5,'领先太多时崩塌加速追赶');
});

test('球会互相碰撞：正面相撞交换速度并弹开，侧面能把对手撞下无护栏的窄桥', ()=>{
 const g=new VersusGame([{id:'a'},{id:'b'}],{seed:5});g.phase='playing';g.started=true;
 const [a,b]=g.players;Object.assign(a.ball,{x:-1.2,z:0,vx:4,vz:0});Object.assign(b.ball,{x:1.2,z:0,vx:-4,vz:0});let events=[];for(let i=0;i<60;i++)events.push(...g.advance(PHYSICS.step,{}));
 assert.ok(events.some(e=>e.kind==='clash'),'有碰撞事件');assert.ok(a.ball.vx<0&&b.ball.vx>0,'弹开');assert.ok(Math.hypot(a.ball.x-b.ball.x,a.ball.z-b.ball.z)>=PHYSICS.radius*2-1e-6,'不会重叠');
 // 找一座窄桥，把 b 放在桥边，a 从侧面撞过去。
 const track=new EndlessTrack(5);track.ensure(1200);const piece=track.pieces.find(p=>p.link==='bridge'&&p.walls&&!p.roads[0].rails);assert.ok(piece,'有窄桥');
 const h=new VersusGame([{id:'a'},{id:'b'}],{seed:5});h.track=track;h.phase='playing';h.started=true;const road=piece.roads[0],f=roadFrame(road),mid=f.length/2,cx=road.a.x+f.forward.x*mid,cz=road.a.z+f.forward.z*mid,w=road.width/2;
 const [p,q]=h.players;for(const x of [p,q]){x.s=road.s0+mid;x.best=x.s;x.heading=f.heading;}
 Object.assign(q.ball,{x:cx+f.right.x*(w-.7),z:cz+f.right.z*(w-.7),y:road.a.y+PHYSICS.radius,vx:0,vz:0});Object.assign(p.ball,{x:cx-f.right.x*(w-.7),z:cz-f.right.z*(w-.7),y:road.a.y+PHYSICS.radius,vx:f.right.x*6.5,vz:f.right.z*6.5});
 h.front=-1e9;const out=[];for(let i=0;i<120*1.5;i++)out.push(...h.advance(PHYSICS.step,{}));
 assert.ok(out.some(e=>e.kind==='clash'));const fell=out.filter(e=>e.kind==='fall');assert.ok(fell.some(e=>e.id==='b'&&e.cause==='edge'),'被撞的人掉下桥');
});

test('淘汰与名次：先掉的名次靠后；同一步掉下的按距离排；只剩一人时获胜，1.4 秒后结束', ()=>{
 const g=new VersusGame([{id:'a',name:'甲'},{id:'b',name:'乙'},{id:'c',name:'丙'},{id:'d',name:'丁'}],{seed:3});g.phase='playing';g.started=true;
 const drop=(ids)=>{for(const id of ids){const p=g.players.find(p=>p.id===id);Object.assign(p.ball,{x:40,z:40});}g.advance(PHYSICS.step,{});};
 g.players[2].best=30;g.players[3].best=20;drop(['c','d']);assert.equal(g.players[3].rank,4);assert.equal(g.players[2].rank,3,'同时掉下，跑得远的名次靠前');
 assert.equal(g.ending,null);drop(['b']);assert.equal(g.players[1].rank,2);assert.equal(g.players[0].rank,1);assert.equal(g.winner.id,'a');
 const ev=[];for(let i=0;i<120*2;i++)ev.push(...g.advance(PHYSICS.step,{}));assert.equal(g.phase,'over');assert.ok(ev.some(e=>e.kind==='over'&&e.winner==='a'));
 const s=g.summary();assert.equal(s.winner,0);assert.deepEqual(s.players.map(p=>p.rank),[1,2,3,4]);assert.equal(s.players[1].alive,false);
 // 最后两人同时掉下：距离远的人获胜。
 const h=new VersusGame([{id:'a'},{id:'b'}],{seed:3});h.phase='playing';h.started=true;h.players[0].best=12;h.players[1].best=18;for(const p of h.players)Object.assign(p.ball,{x:50,z:50});h.advance(PHYSICS.step,{});assert.equal(h.winner.id,'b');assert.equal(h.players[0].rank,2);
});

test('自动驾驶能跑过各种机关：只被崩塌追上，不会自己掉下去；4 人局有碰撞、有胜负', ()=>{
 for(const seed of [1,2,3]){const g=new VersusGame([{id:'bot'}],{seed});runBots(g,{seconds:260});const p=g.players[0];assert.equal(g.phase,'over');assert.equal(p.cause,'collapse',`种子 ${seed}：在 ${p.best.toFixed(0)} 米处被崩塌追上`);assert.ok(p.best>450,`种子 ${seed} 跑了 ${p.best.toFixed(0)} 米`);}
 const g=new VersusGame([{id:'a'},{id:'b'},{id:'c'},{id:'d'}],{seed:12});const kinds=new Set();const tick=g.tick.bind(g);g.tick=(dt,i)=>{tick(dt,i);for(const e of g.events)kinds.add(e.kind);};runBots(g,{seconds:300,speeds:[5.6,5,4.6,4]});
 assert.equal(g.phase,'over');assert.ok(g.winner);assert.deepEqual(g.standings().map(p=>p.rank),[1,2,3,4]);for(const k of ['go','collapse','fall','win','over','stage'])assert.ok(kinds.has(k),k);
});

test('赛段主题：进程取距离与时间里更靠后的一个，依次经过四段；颜色在段尾平滑过渡；配乐章节随段落切换', ()=>{
 assert.equal(STAGES.length,4);assert.deepEqual(STAGES.map(s=>s.chapter),[0,1,2,2]);assert.equal(VERSUS_COLORS.length,4);
 assert.equal(progressOf(0,0),0);assert.ok(Math.abs(progressOf(80,0)-.5)<1e-9);assert.ok(Math.abs(progressOf(0,17.5)-.5)<1e-9);assert.equal(Math.floor(progressOf(200,10)),1);assert.equal(Math.floor(progressOf(10,75)),2);
 const late=ENDLESS.grace+(ENDLESS.collapse.max-ENDLESS.collapse.base)/ENDLESS.collapse.ramp;assert.equal(progressOf(0,late+1),3,'崩塌进入加时，一定是最后一段');assert.equal(progressOf(5000,0),3);
 assert.deepEqual(stageBlend(.5),{index:0,next:1,blend:0});assert.ok(stageBlend(.9).blend>.4&&stageBlend(.9).blend<.6);assert.equal(stageBlend(3).index,3);
 const g=new VersusGame([{id:'a'}],{seed:2});g.phase='playing';g.started=true;g.players[0].s=g.front+50;const stages=[];for(const t of [10,40,80,120]){g.elapsed=t;g.players[0].s=g.front+50;stages.push(...g.advance(PHYSICS.step*1.01,{}).filter(e=>e.kind==='stage').map(e=>e.index));}
 assert.deepEqual(stages,[1,2,3]);assert.equal(g.summary().stage,3);
});
