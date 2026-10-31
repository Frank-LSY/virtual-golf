import test from 'node:test';
import assert from 'node:assert/strict';
import {makeHole,heightAt,surfaceAt,WATER_LEVEL} from '../shared/courses.js';
import {TREE_MESHES,treeParts,treeColliders,sweepTrees,treeBounce} from '../shared/trees.js';
import {sweepWater,SPLASH_DURATION,splashCamera} from '../shared/water.js';
import {BALL_RADIUS,sampleShot} from '../shared/ball.js';
import {simulateShot} from '../game-service/physics.js';
import {CLUBS} from '../shared/clubs.js';
import {ImpactEffects} from '../screen-web/impact-effects.js';
import {ShotTrail} from '../screen-web/shot-trail.js';
import {Game} from '../game-service/game.js';
import {roundExport} from '../shared/players.js';

const treeHole=(courseId='sunny')=>({...makeHole(courseId,0,421),practice:true,putting:false,wind:{x:0,z:0},rocks:[],trees:[{x:0,z:4,scale:1,rotation:.27}]});
test('共享树模型每个面包住所有可见顶点；缩放与旋转保留真实位置',()=>{
 for(const mesh of Object.values(TREE_MESHES))for(const {n,d} of mesh.planes)for(let i=0;i<mesh.positions.length;i+=3)assert.ok(n.reduce((sum,v,k)=>sum+v*mesh.positions[i+k],0)<=d+1e-6);
 const h=treeHole(),tree={x:7,z:12,scale:1.6,rotation:1.23};h.trees=[tree];const parts=treeParts(h,tree),colliders=treeColliders(h);assert.equal(parts.length,8);assert.equal(colliders.length,parts.length);assert.equal(parts[0].y,7);assert.ok(colliders[1].bounds.maxx>tree.x+2);
});
test('高速整段扫掠击中树干、侧面树冠与松树，空隙与越顶球不误判',()=>{
 for(const id of ['sunny','pine']){const colliders=treeColliders(treeHole(id));
  const trunk=sweepTrees(colliders,{x:0,y:3.4,z:-20},{x:0,y:3.4,z:30},BALL_RADIUS);assert.equal(trunk.kind,'trunk');assert.ok(trunk.fraction>0&&trunk.fraction<1);assert.ok(trunk.normal.z<-.8);
  const crown=sweepTrees(colliders,{x:2,y:8,z:-20},{x:2,y:8,z:30},BALL_RADIUS);assert.equal(crown.kind,'crown');
  for(const [x,y] of [[0,25],[20,8],[3,3.2]])assert.equal(sweepTrees(colliders,{x,y,z:-20},{x,y,z:30},BALL_RADIUS),null);
 }
});
test('树干按接触法线反弹，树冠更柔软；实际击球路径记录接触点且不会穿过树干',()=>{
 const v={x:5,y:-2,z:20},normal={x:0,y:0,z:-1},wood=treeBounce(v,normal,'trunk'),leaf=treeBounce(v,normal,'crown');assert.ok(wood.z<0&&wood.x>0);assert.ok(Math.hypot(...Object.values(leaf))<Math.hypot(...Object.values(wood)));
 const h=treeHole(),shot=simulateShot(h,{x:0,z:0},1,0,0,{club:CLUBS.find(c=>c.id==='putter')});const hit=shot.impacts.find(e=>e.type==='tree');assert.equal(hit.kind,'trunk');assert.ok(hit.speedAfter<hit.speed);assert.ok(shot.to.z<3.5);assert.ok(shot.path.some(p=>Math.abs(p.t-hit.t)<1e-8));assert.ok(shot.impacts.length<5);assert.ok(shot.path.every((p,i)=>i===0||p.t>=shot.path[i-1].t));
 assert.deepEqual(shot,simulateShot(h,{x:0,z:0},1,0,0,{club:CLUBS.find(c=>c.id==='putter')}));
 const air=simulateShot(h,{x:0,z:0},.5,0,0,{club:CLUBS.find(c=>c.id==='iron')}),crown=air.impacts.find(e=>e.kind==='crown');assert.ok(crown);assert.ok(crown.position.y>4.8);assert.ok(crown.speedAfter<crown.speed*.6);assert.ok(air.path.some(p=>p.t===crown.t));
});
const waterHole=()=>{const h=makeHole('sunny',0,1);h.trees=[];h.hazards=[{type:'water',x:0,z:70,rx:70,rz:40,angle:0}];return h;};
test('在可见水面触发接触，高空飞越不落水，干燥岸坡不算水域',()=>{
 const h=waterHole(),hit=sweepWater(h,{x:0,y:5,z:70},{x:0,y:-1,z:70},BALL_RADIUS);assert.ok(hit);assert.equal(hit.position.y,WATER_LEVEL);assert.ok(hit.fraction<.84);assert.equal(sweepWater(h,{x:-90,y:6,z:70},{x:90,y:6,z:70},BALL_RADIUS),null);
 let dry=0;for(let x=-70;x<=70;x+=.1){if(x*x/(70*70)<1&&heightAt(h,x,70)>WATER_LEVEL){assert.notEqual(surfaceAt(h,x,70),'water');dry++;}}assert.ok(dry>0);
});
test('落水只处罚一次，独立播放水花和下沉，彩虹线止于水面',()=>{
 const h=waterHole(),shot=simulateShot(h,h.tee,.5,0);assert.equal(shot.penalty,'water');assert.deepEqual(shot.to,h.tee);assert.equal(shot.impacts.filter(e=>e.type==='water').length,1);assert.ok(Number.isFinite(shot.waterTime));const entry=sampleShot(shot,shot.duration-SPLASH_DURATION),middle=sampleShot(shot,shot.duration-SPLASH_DURATION/2),end=sampleShot(shot,shot.duration);assert.ok(entry.splashing);assert.ok(Math.abs(entry.y-WATER_LEVEL-BALL_RADIUS)<1e-6);assert.ok(middle.y<entry.y-.3);assert.ok(end.done);const trail=new ShotTrail();trail.setShot(shot);assert.equal(shot.path[trail.cutoff].t,shot.waterTime);
});
test('岸边落水镜头从水面侧观察，避开原球位的球手与停放球车',()=>{
 const h=makeHole('coast',4,421),pond=h.hazards.find(p=>p.type==='water'),entry={x:pond.x,y:WATER_LEVEL,z:pond.z},camera=splashCamera(h,entry),from={x:pond.x+22,z:pond.z-15};assert.equal(surfaceAt(h,-camera.x,camera.z),'water');assert.ok(camera.y>WATER_LEVEL+5);assert.ok(Math.hypot(-camera.x-from.x,camera.z-from.z)>10);
});
test('碰撞特效只触发一次，过期清理，新一杆与换洞不会遗留粒子',()=>{
 let count=0;const effects=new ImpactEffects(()=>count++),events=[{type:'tree',kind:'crown',treeIndex:0,position:{x:0,y:5,z:0},t:.2,speed:15},{type:'water',position:{x:2,y:.1,z:0},t:1,speed:8}];effects.reset({impacts:events});effects.sample(.3,1000);effects.sample(.3,1050);assert.equal(count,1);effects.sample(1.2,1500);assert.equal(count,2);assert.equal(effects.children.length,2);effects.update(4000);assert.equal(effects.children.length,0);effects.reset({impacts:events});effects.sample(.5,5000);effects.reset();assert.equal(effects.children.length,0);assert.equal(effects.events.length,0);
});
test('落水记录归属当前球手，动画后轮换，导出保留碰撞反馈',()=>{
 const g=new Game();g.start('coast',3,[{id:'a',deviceId:'a'},{id:'b',deviceId:'b'}]);g.state.seed=421;g.state.holeIndex=4;const h=g.hole,pond=h.hazards.find(p=>p.type==='water');g.state.ball={x:pond.x,z:pond.z};g.setClub('putter',g.state.stateVersion);g.setArmed(true);const shot=g.stroke({power:.05,dir:0,seq:1,stateVersion:g.state.stateVersion},'a');assert.equal(shot.penalty,'water');assert.equal(g.state.strokes,2);assert.equal(g.state.shotHistory[0].playerId,'a');assert.equal(g.state.shotHistory[0].impacts[0].type,'water');const exported=roundExport(g.snapshot());assert.equal(exported['击球记录'][0]['处罚'],'落水，加罚一杆');g.settle();assert.equal(g.state.activePlayerId,'b');
});
