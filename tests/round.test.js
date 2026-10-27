import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../game-service/game.js';
import {TrainingChannel} from '../local-gateway/training-channel.js';
import {RoundChannel} from '../local-gateway/round-channel.js';
import {MotionView} from '../shared/motion-view.js';
import * as THREE from 'three';
import {PlayerScene} from '../screen-web/player-scene.js';
import {makeHole,heightAt} from '../shared/courses.js';

test('正式球局先试挥，再单杆准备；体感数据在两种状态持续转发',()=>{
 const g=new Game();g.start('sunny',3);const screen={role:'screen',clientId:'s',roundView:true},phone={role:'phone',clientId:'p',calibrated:true},hidden={role:'screen',clientId:'hidden'},clients=new Set([screen,phone,hidden]),messages=[],shots=[];
 const send=(to,m)=>messages.push({to,m}),training=new TrainingChannel(clients,send),round=new RoundChannel(g,clients,send,training,{state:()=>round.sync(),shot:s=>shots.push(s)});round.sync();
 const sample={alpha:90,beta:40,gamma:20,axis:'beta',state:'BACK',stage:'ready',tilt:3,hz:60,peakMax:600};
 round.handle(phone,{type:'sensor_sample',sample});assert.ok(messages.some(x=>x.to===screen&&x.m.scope==='round'));assert.ok(!messages.some(x=>x.to===hidden&&x.m.type==='sensor_sample'));
 const initial=structuredClone(g.state);round.handle(phone,{type:'swing',power:.4,dir:0,seq:1,stateVersion:g.state.stateVersion});assert.deepEqual(g.state,initial);assert.equal(shots.length,0);assert.ok(messages.some(x=>x.m.type==='rehearsal_ack'));
 round.handle(phone,{type:'round_arm',armed:true});assert.equal(g.state.armed,true);phone.lastRoundTelemetry=0;round.handle(phone,{type:'sensor_sample',sample});assert.equal(messages.filter(x=>x.m.scope==='round').length,2);
 round.handle(phone,{type:'swing',power:.4,dir:0,seq:2,stateVersion:g.state.stateVersion});assert.equal(g.state.strokes,1);assert.equal(g.state.armed,false);assert.equal(shots.length,1);
 assert.throws(()=>round.handle(phone,{type:'round_arm',armed:true}),/等待/);g.settle();
 round.handle(phone,{type:'swing',power:.3,dir:0,seq:3,stateVersion:g.state.stateVersion});assert.equal(g.state.strokes,1);assert.equal(shots.length,1);
 round.handle(phone,{type:'round_arm',armed:true});phone.calibrated=false;round.sync();assert.equal(g.state.armed,false);
 phone.calibrated=true;round.sync();round.handle(screen,{type:'round_arm',armed:true});assert.equal(new Game(g.state).state.armed,false);
 screen.practiceView=true;round.sync();assert.equal(g.state.armed,false);assert.equal(round.active(),false);screen.practiceView=false;round.sync();round.handle(screen,{type:'round_arm',armed:true});clients.delete(phone);round.sync();assert.equal(g.state.armed,false);
 round.handle(screen,{type:'round_arm',armed:true});round.handle(screen,{type:'round_view',active:false});assert.equal(g.state.armed,false);
});

test('错误、过期及重复试挥不改变杆数或消费有效准备',()=>{
 const g=new Game();g.start('sunny',3);const input={power:.4,dir:0,seq:1,stateVersion:g.state.stateVersion};g.rehearse(input,'s');assert.throws(()=>g.rehearse(input,'s'),/已经收到/);g.setArmed(true);
 assert.throws(()=>g.stroke({...input,seq:2},'s'),/更新/);assert.equal(g.state.armed,true);assert.equal(g.state.strokes,0);
 assert.throws(()=>g.stroke({...input,power:NaN,seq:2,stateVersion:g.state.stateVersion},'s'),/无效/);assert.equal(g.state.armed,true);
});

test('手机视角限幅、平滑、双向响应，并在校准或断流后归中',()=>{
 const v=new MotionView(),t={alpha:900,beta:900,gamma:0,stage:'ready'};for(let now=0;now<5000;now+=80){v.sample(t,now);v.update(.08,now);}
 assert.ok(v.yaw>0&&v.yaw<=.42);assert.ok(v.pitch>0&&v.pitch<=.18);const before=v.yaw;v.sample({...t,alpha:-900,beta:-900},5040);assert.equal(v.yaw,before);v.update(.016,5040);assert.ok(v.yaw<before);
 for(let now=5100;now<14000;now+=50)v.update(.05,now);assert.ok(Math.abs(v.yaw)<.001&&Math.abs(v.pitch)<.001);
 v.sample(t,14080);v.update(.1,14080);v.sample({...t,stage:'still'},14160);assert.equal(v.yaw,0);assert.equal(v.targetYaw,0);
});

test('第三人称站位跟随球位和地形，手机视角不改变瞄准角度',()=>{
 const scene=Object.create(PlayerScene.prototype);Object.assign(scene,{hole:makeHole('pine',2,42),aim:12,actorRig:new THREE.Group(),sun:{target:new THREE.Object3D(),position:new THREE.Vector3()},targetPosition:new THREE.Vector3(),targetLook:new THREE.Vector3(),motionView:new MotionView(),view:'follow',phase:'address',orbit:0});
 for(const p of [{x:0,z:0},{x:14,z:85},{x:-5,z:155}]){scene.ballPosition=p;scene.positionAvatar(p);assert.equal(scene.actorRig.position.x,p.x);assert.equal(scene.actorRig.position.z,p.z);const a=scene.heading(p);assert.equal(scene.actorRig.position.y,heightAt(scene.hole,p.x-1.42*Math.cos(a),p.z+1.42*Math.sin(a)));scene.setCamera();const before=scene.targetPosition.clone();scene.motionView.yaw=.3;scene.setCamera();assert.ok(before.distanceTo(scene.targetPosition)>.1);assert.equal(scene.aim,12);scene.motionView.reset();}
});
