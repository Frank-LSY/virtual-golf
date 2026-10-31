import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../game-service/game.js';
import {simulateShot,canCapture} from '../game-service/physics.js';
import {makeHole,heightAt} from '../shared/courses.js';
import {CLUBS} from '../shared/clubs.js';
import {ViewState,overviewPose} from '../shared/view.js';
import {sampleShot,BALL_RADIUS,CUP_DEPTH,DROP_DURATION,CUP_RADIUS} from '../shared/ball.js';
import {Golfer} from '../screen-web/golfer.js';

test('手动选杆改变试挥和击球弹道，取消准备，记录实际球杆；下一杆重新推荐',()=>{
 const g=new Game();g.start('sunny',3);g.state.seed=421;g.setClub('putter',g.state.stateVersion);g.setArmed(true);const stale=g.state.stateVersion;g.setClub('iron',stale);assert.equal(g.state.armed,false);assert.throws(()=>g.setClub('driver',stale),/变化/);assert.throws(()=>g.setClub('unknown',g.state.stateVersion),/有效/);
 const input={power:.4,dir:0,seq:1,stateVersion:g.state.stateVersion},dry=g.rehearse(input,'test');assert.equal(dry.clubId,'iron');assert.equal(g.state.strokes,0);
 g.setArmed(true);const shot=g.stroke({...input,seq:2,stateVersion:g.state.stateVersion},'test');assert.deepEqual(shot.path,dry.path);assert.equal(g.state.shotHistory[0].clubSelection,'iron');assert.equal(g.state.shotHistory[0].clubId,'iron');assert.throws(()=>g.setClub('putter',g.state.stateVersion),/停稳/);g.settle();assert.equal(g.state.clubId,'auto');
 const h=makeHole('sunny',0,421),from={x:h.pin.x,z:h.pin.z-6},shots=CLUBS.map(club=>simulateShot(h,from,.2,0,0,{club,flagstick:false}));assert.equal(shots.at(-1).carry,0);assert.ok(shots[0].carry>shots[1].carry);assert.ok(shots[2].apex>shots[4].apex);assert.equal(new Set(shots.map(s=>s.travel.toFixed(3))).size,6);
});

test('球杆选择按球手保存，重连恢复且轮换不带走前一位的球杆',()=>{
 const g=new Game();g.start('sunny',3,[{id:'a',deviceId:'a'},{id:'b',deviceId:'b'}]);g.setClub('sand',g.state.stateVersion);g.selectPlayer('b');g.setClub('driver',g.state.stateVersion);g.selectPlayer('a');assert.equal(g.snapshot().selectedClub.id,'sand');const saved=new Game(JSON.parse(JSON.stringify(g.state)));assert.equal(saved.state.clubId,'sand');saved.setArmed(true);saved.stroke({power:.1,dir:0,seq:1,stateVersion:saved.state.stateVersion},'a');saved.settle();assert.equal(saved.state.activePlayerId,'b');assert.equal(saved.state.clubId,'driver');assert.equal(saved.state.players[0].clubId,'auto');
});

test('俯视缩放和旋转改变镜头位置而保持目标，极值受限并可复位',()=>{
 const v=new ViewState(),center={x:5,y:2,z:100},before=overviewPose(center,100,v);v.scale(2);v.rotate(Math.PI/2);const after=overviewPose(center,100,v);assert.deepEqual(after.look,center);assert.notEqual(after.position.x,before.position.x);const length=p=>Math.hypot(p.x-center.x,p.y-center.y,p.z-center.z);assert.ok(Math.abs(length(after.position)-length(before.position)/2)<1e-9);v.scale(1e6);assert.equal(v.zoom,4);v.scale(0);assert.equal(v.zoom,4);v.tilt(1000);assert.equal(v.pitch,82);v.tilt(-1000);assert.equal(v.pitch,30);v.pan(10000,-10000,360,460);assert.equal(v.panX,1440);v.reset();assert.deepEqual(overviewPose(center,100,v),before);assert.equal(v.panY,0);
});

test('慢推保留洞缘到洞底的连续轨迹与独立下落时长，高速擦边不能吸入',()=>{
 const h=makeHole('sunny',0,421),from={x:h.pin.x,z:h.pin.z-1},shot=simulateShot(h,from,.04,0);assert.equal(shot.holed,true);const start=sampleShot(shot,0),entry=sampleShot(shot,shot.duration-DROP_DURATION),middle=sampleShot(shot,shot.duration-DROP_DURATION*.25),end=sampleShot(shot,shot.duration);assert.equal(start.x,from.x);assert.ok(Math.abs(start.y-heightAt(h,from.x,from.z)-BALL_RADIUS)<1e-8);assert.equal(entry.dropping,true);assert.equal(entry.done,false);assert.ok(middle.y<entry.y-.15);assert.ok(end.y<heightAt(h,h.pin.x,h.pin.z)-CUP_DEPTH*.7);assert.equal(end.done,true);assert.equal(end.x,h.pin.x);assert.equal(end.z,h.pin.z);assert.deepEqual(sampleShot(shot,shot.duration+4),end);
 assert.equal(canCapture({x:-1,z:CUP_RADIUS*1.2},{x:1,z:CUP_RADIUS*1.2},{x:0,z:0},1.2),false);assert.equal(canCapture({x:-1,z:CUP_RADIUS*.95},{x:1,z:CUP_RADIUS*.95},{x:0,z:0},2.2),false);assert.equal(canCapture({x:-1,z:0},{x:1,z:0},{x:0,z:0},1.2),true);
});

test('人物切换六类球杆后保留相同骨架，实际替换杆头和材质而非只改文字',()=>{
 const golfer=new Golfer('sage'),root=golfer.root,vertices=new Map();for(const c of CLUBS){golfer.setClub(c.id);assert.equal(golfer.root,root);assert.equal(golfer.club.userData.clubId,c.id);let count=0;golfer.club.traverse(o=>count+=o.geometry?.attributes.position.count||0);vertices.set(c.id,count);golfer.update(.016,1);}assert.notEqual(vertices.get('driver'),vertices.get('putter'));assert.ok([...vertices.values()].every(n=>n>100));
});
