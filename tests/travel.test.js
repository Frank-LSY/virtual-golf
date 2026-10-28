import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {makeHole,heightAt,distance} from '../shared/courses.js';
import {movementPlan,cartRoute,clearTravelSegment,sampleRoute,roundAnimationMs,LANDING_PAUSE} from '../shared/travel.js';
import {PlayerScene} from '../screen-web/player-scene.js';
import {Golfer} from '../screen-web/golfer.js';
import {GolfCart} from '../screen-web/golf-cart.js';
import {ShotTrail} from '../screen-web/shot-trail.js';
import {simulateShot} from '../game-service/physics.js';

test('短距离步行、长距离乘车；原地处罚和进洞不产生无效旅程',()=>{
 const h=makeHole('sunny',1,421),from=h.tee,near={x:0,z:8},far={x:0,z:170};assert.equal(movementPlan(h,from,near).mode,'walk');const plan=movementPlan(h,from,far);assert.equal(plan.mode,'cart');assert.equal(plan.duration,plan.boarding+plan.driving+plan.alighting);assert.equal(movementPlan(h,from,from).duration,0);assert.equal(movementPlan(h,from,far,true).mode,'none');const shot={duration:3,movement:plan};assert.ok(roundAnimationMs(shot,'phone')>3000+LANDING_PAUSE+plan.duration);assert.equal(roundAnimationMs(shot,'screen')-roundAnimationMs(shot,'phone'),440);
});

test('球车导航绕开水障碍和树干，沿折线路径插值不跨越水面',()=>{
 const h={...makeHole('sunny',1,421),trees:[{x:18,z:40,scale:1}],hazards:[{type:'water',x:0,z:40,rx:15,rz:13,angle:0}]},from={x:0,z:10},to={x:0,z:80};assert.equal(clearTravelSegment(h,from,to),false);const route=cartRoute(h,from,to);assert.ok(route.length>2);assert.deepEqual(route[0],from);assert.deepEqual(route.at(-1),to);for(let i=1;i<route.length;i++)assert.ok(clearTravelSegment(h,route[i-1],route[i]));for(let i=0;i<=100;i++){const p=sampleRoute(route,i/100);assert.ok(Number.isFinite(p.x+p.z+p.heading));}assert.ok(sampleRoute(route,1).distance>distance(from,to));
});

test('乘车时人物随车移动，抵达后下车恢复站位；走路有交替迈步',()=>{
 const h=makeHole('sunny',1,421),from=h.tee,to={x:5,z:80},plan=movementPlan(h,from,to),scene=Object.create(PlayerScene.prototype);Object.assign(scene,{hole:h,aim:0,ballPosition:from,lastResult:{from,to,movement:plan},golfer:new Golfer(),actorRig:new THREE.Group(),cart:new GolfCart(),sun:{target:new THREE.Object3D(),position:new THREE.Vector3()},motionView:{reset(){}},trace:{fade(){}},setCamera(){},setBall(p){this.arrived={...p};}});
 scene.beginMovement(100);scene.updateMovement(300,.1);assert.equal(scene.phase,'boarding');scene.updateMovement(100+plan.boarding+plan.driving/2,.1);scene.golfer.update(.016,1);assert.equal(scene.phase,'driving');assert.equal(scene.golfer.locomotion,'ride');assert.equal(scene.golfer.club.visible,false);assert.ok(distance(scene.actorRig.position,scene.cart.root.position)<.6);assert.ok(scene.cart.wheels.some(w=>Math.abs(w.rotation.x)>1));scene.updateMovement(100+plan.boarding+plan.driving+plan.alighting*.5,.1);assert.equal(scene.phase,'alighting');scene.updateMovement(101+plan.duration,.1);assert.equal(scene.phase,'address');assert.deepEqual(scene.arrived,to);assert.equal(scene.golfer.root.position.x,-1.42);assert.equal(scene.golfer.locomotion,'rest');
 const g=scene.golfer;g.setLocomotion('walk',Math.PI/2);g.update(.016,0);const first=g.legs[0].foot.position.z-g.legs[1].foot.position.z;assert.ok(Math.abs(first)>.5);g.setLocomotion('walk',Math.PI*1.5);g.update(.016,0);assert.ok(first*(g.legs[0].foot.position.z-g.legs[1].foot.position.z)<0);g.setLocomotion('rest');g.update(.016,0);assert.equal(g.legs[0].foot.position.z,.15);
});

test('彩虹轨迹逐段出现、含多种颜色，推杆轨迹更细，下一杆重置透明度',()=>{
 const h=makeHole('sunny',1,421),shot=simulateShot(h,h.tee,.65,0),trail=new ShotTrail();trail.setShot(shot);assert.equal(trail.core.geometry.drawRange.count,0);trail.reveal(12);assert.equal(trail.core.geometry.drawRange.count,12*48);const color=trail.core.geometry.attributes.color;assert.notDeepEqual([color.getX(0),color.getY(0),color.getZ(0)],[color.getX(color.count-1),color.getY(color.count-1),color.getZ(color.count-1)]);trail.fade(0);assert.equal(trail.visible,false);trail.setShot(shot);assert.equal(trail.visible,true);assert.equal(trail.core.material.opacity,.96);
 const from={x:h.pin.x,z:h.pin.z-3},putt=simulateShot(h,from,.03,0),putterTrail=new ShotTrail();putterTrail.setShot(putt);const point=putterTrail.core.geometry.attributes.position;assert.ok(Math.hypot(point.getX(0)-from.x,point.getY(0)-heightAt(h,from.x,from.z)-.085-.014,point.getZ(0)-from.z)<.03);
});
