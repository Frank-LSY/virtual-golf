import test from 'node:test';
import assert from 'node:assert/strict';
import {makeHole,heightAt,surfaceAt} from '../shared/courses.js';
import {CLUBS} from '../shared/clubs.js';
import {SURFACES,terrainAdvice,launchConditions,ballRestHeight,landingDepth} from '../shared/terrain.js';
import {BALL_RADIUS,SETTLE_DURATION,sampleShot} from '../shared/ball.js';
import {simulateShot} from '../game-service/physics.js';
import {Game} from '../game-service/game.js';
import {roundExport} from '../shared/players.js';
import {ImpactEffects} from '../screen-web/impact-effects.js';
import {TerrainDetails,liePatchGeometry} from '../screen-web/terrain-details.js';
import {terrainMaterial} from '../screen-web/visuals.js';
import {ShotTrail} from '../screen-web/shot-trail.js';

const club=id=>CLUBS.find(c=>c.id===id);
function terrainHole(surface){const h={...makeHole('sunny',0,421),wind:{x:0,z:0,speed:0},pin:{x:0,z:135},elevation:0,slope:0,trees:[],hazards:[],width:surface==='rough'?0:40};if(surface==='sand')h.hazards=[{type:'sand',x:0,z:60,rx:70,rz:70,angle:0}];if(surface==='green'){h.practice=true;h.putting=true;}return h;}
test('同杆同力度，球道、长草、沙坑的真实出球速度与提示一致',()=>{
 const from={x:0,z:60},shots=['fairway','rough','sand'].map(s=>{const h=terrainHole(s);assert.equal(surfaceAt(h,from.x,from.z),s);return simulateShot(h,from,.2,0,0,{club:club('iron')});});
 assert.ok(shots[0].ballSpeed>shots[1].ballSpeed&&shots[1].ballSpeed>shots[2].ballSpeed);assert.ok(shots[0].carry>shots[1].carry&&shots[1].carry>shots[2].carry);
 for(const s of shots)assert.equal(s.terrain.speedPercent,Math.round(s.ballSpeed/shots[0].ballSpeed*100));
});
test('相同初速度下，果岭、球道、长草、沙地依次缩短滚动距离',()=>{
 const from={x:0,z:60},putter=club('putter'),shots=['green','fairway','rough','sand'].map(surface=>{const h=terrainHole(surface),factor=launchConditions(surface,putter,from).multiplier,power=(1.15/(putter.speed*factor))**2;assert.ok(power<1);return simulateShot(h,from,power,0,0,{club:putter,capture:false});});
 assert.ok(shots.every(s=>Math.abs(s.ballSpeed-1.15)<1e-8));for(let i=1;i<shots.length;i++)assert.ok(shots[i].roll<shots[i-1].roll,`${shots[i].terrain.name} ${shots[i].roll} < ${shots[i-1].roll}`);
});
test('沙坑杆减少救球损失，深陷沙比浅陷沙更难出球，方向不增加随机偏差',()=>{
 const h=terrainHole('sand'),light={x:0,z:60,sandDepth:.018},deep={...light,sandDepth:.065};const info=terrainAdvice(h,deep,club('sand'));assert.equal(info.condition,'陷沙较深');assert.ok(info.speedPercent>terrainAdvice(h,deep,club('putter')).speedPercent);assert.ok(info.speedPercent>terrainAdvice(h,deep,club('iron')).speedPercent);
 const a=simulateShot(h,light,.4,0,0,{club:club('sand')}),b=simulateShot(h,deep,.4,0,0,{club:club('sand')});assert.ok(a.ballSpeed>b.ballSpeed);assert.equal(a.launchAngle,b.launchAngle);assert.equal(a.impacts[0].phase,'launch');assert.equal(a.impacts[0].type,'sand');assert.deepEqual(b,simulateShot(h,deep,.4,0,0,{club:club('sand')}));
});
function bunkerLanding(){const h=terrainHole('fairway');h.hazards=[{type:'sand',x:0,z:37,rx:15,rz:18,angle:0}];return {h,shot:simulateShot(h,h.tee,1,0,0,{club:club('chip')})};}
test('空中落沙飞溅、吸收冲击并短滚，陷球连续播放且下一杆从同一深度开始',()=>{
 const {h,shot}=bunkerLanding();assert.equal(shot.endSurface,'sand');assert.equal(shot.penalty,null);const events=shot.impacts.filter(e=>e.type==='sand'&&e.phase==='land');assert.equal(events.length,1);assert.ok(shot.roll<2);assert.ok(shot.to.sandDepth>.035);assert.ok(landingDepth(20)>landingDepth(3));
 const entry=sampleShot(shot,shot.duration-SETTLE_DURATION),end=sampleShot(shot,shot.duration),middle=sampleShot(shot,shot.duration-SETTLE_DURATION/2);assert.ok(entry.settling);assert.ok(entry.y>middle.y&&middle.y>end.y);assert.ok(Math.abs(end.y-ballRestHeight(h,shot.to))<1e-8);assert.ok(end.y<heightAt(h,shot.to.x,shot.to.z)+BALL_RADIUS);
 const next=simulateShot(h,shot.to,.2,0,0,{club:club('sand')});assert.equal(next.path[0].y,end.y);const trail=new ShotTrail();trail.setShot(shot);assert.equal(shot.path[trail.cutoff].t,shot.settleTime);
});
test('滚入地形边界才触发阻挡，不逐帧重复扬沙；落入长草会出现草叶反馈',()=>{
 const h=terrainHole('fairway');h.hazards=[{type:'sand',x:0,z:66,rx:10,rz:4,angle:0}];const s=simulateShot(h,{x:0,z:59},1,0,0,{club:club('putter')});assert.equal(s.endSurface,'sand');assert.equal(s.impacts.filter(e=>e.type==='sand'&&e.phase==='roll').length,1);
 const grass=terrainHole('rough'),g=simulateShot(grass,{x:0,z:40},.5,0,0,{club:club('chip')});assert.ok(g.impacts.some(e=>e.type==='rough'&&e.phase==='land'));assert.equal(g.penalty,null);assert.equal(g.to.sandDepth,undefined);
});
test('陷沙深度按球手独立保存和恢复，罚杆仍返回原球位，中文导出保留地形',()=>{
 const g=new Game();g.start('sunny',3,[{id:'a',deviceId:'a'},{id:'b',deviceId:'b'}]);g.state.seed=421;const sand=g.hole.hazards.find(p=>p.type==='sand');g.state.ball={x:sand.x,z:sand.z,sandDepth:.058};g.savePlayer();g.selectPlayer('b');assert.equal(g.state.ball.sandDepth,undefined);g.selectPlayer('a');assert.equal(g.snapshot().terrain.depth,.058);const saved=new Game(JSON.parse(JSON.stringify(g.state)));assert.equal(saved.state.ball.sandDepth,.058);saved.setClub('putter',saved.state.stateVersion);saved.setArmed(true);const s=saved.stroke({power:.02,dir:0,seq:1,stateVersion:saved.state.stateVersion},'a');assert.equal(s.penalty,null);assert.equal(saved.state.strokes,1);assert.equal(saved.player.ball.sandDepth,s.to.sandDepth);assert.equal(saved.state.shotHistory[0].terrain.surface,'sand');assert.equal(roundExport(saved.snapshot())['击球记录'][0]['出球地形'],'沙坑');saved.settle();assert.equal(saved.state.activePlayerId,'b');saved.selectPlayer('a');assert.equal(saved.state.ball.sandDepth,s.to.sandDepth);
});
test('沙粒和草叶各自只播放一次并释放资源，近景草丛只长在长草上，陷沙标记与深度一致',()=>{
 const effects=new ImpactEffects(),events=[{type:'sand',phase:'land',position:{x:0,y:3,z:0},speed:12,t:1},{type:'rough',phase:'land',position:{x:2,y:3,z:0},speed:10,t:2}];effects.reset({impacts:events});effects.sample(3,1000);effects.sample(3,1100);assert.equal(effects.bursts.length,2);assert.equal(effects.bursts[0].particles.count,64);assert.ok(effects.bursts[0].dust);effects.update(3000);assert.equal(effects.children.length,0);
 const sand=terrainHole('sand'),detail=new TerrainDetails(sand);detail.setBall({x:0,z:60,sandDepth:.06});assert.ok(detail.lie.visible);assert.equal(detail.local.count,0);detail.launch();assert.equal(detail.lie.visible,false);
 const grass=new TerrainDetails(terrainHole('rough'));grass.setBall({x:0,z:60});assert.ok(grass.local.count>100);assert.equal(grass.lie.visible,false);const old=grass.local;grass.setBall({x:0,z:60});assert.equal(grass.local,old);
});
test('陷沙球位使用细分地面代替粗网格，显示高度与物理高度吻合且移出沙坑后恢复',()=>{
 const h=makeHole('sunny',0,421),ball={x:h.hazards[0].x,z:h.hazards[0].z,sandDepth:.0389},geometry=liePatchGeometry(h,ball),positions=geometry.attributes.position;assert.ok(Math.abs(positions.getY(0)-heightAt(h,ball.x,ball.z)-.002)<1e-5);assert.ok(positions.array.every(Number.isFinite));assert.ok(geometry.attributes.normal.array.every(Number.isFinite));
 const material=terrainMaterial(h),details=new TerrainDetails(h,material);details.setBall(ball);assert.ok(details.patch.visible);assert.equal(material.userData.lieRadius.value,.97);assert.ok(ballRestHeight(h,ball)<positions.getY(0)+BALL_RADIUS);details.setBall(h.tee);assert.equal(details.patch.visible,false);assert.equal(material.userData.lieRadius.value,0);
});
