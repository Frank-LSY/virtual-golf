import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,FORECAST_POWERS} from '../game-service/game.js';
import {simulateShot} from '../game-service/physics.js';
import {makeHole,distance,heightAt} from '../shared/courses.js';
import {CLUBS,CLUB_SPIN} from '../shared/clubs.js';
import {parkingAt,movementPlan} from '../shared/travel.js';
import {treeColliders,sweepTrees} from '../shared/trees.js';
import {interpolateForecast,ShotGuide} from '../screen-web/shot-guide.js';

test('无风预判随力度单调变远，只在球位、球杆或瞄准变化时重算',()=>{
 const g=new Game();g.start('sunny',9);const f=g.snapshot().forecast;
 assert.deepEqual(f.marks.map(m=>m.power),[...FORECAST_POWERS]);
 for(let i=1;i<f.marks.length;i++){assert.ok(f.marks[i].carry>f.marks[i-1].carry);assert.ok(f.marks[i].total>=f.marks[i].carry-.01);}
 assert.equal(g.snapshot().forecast,f,'状态不变时复用缓存');
 g.setAim(12);const turned=g.snapshot().forecast;assert.notEqual(turned,f);assert.equal(turned.aim,12);
 assert.ok(turned.marks.at(-1).landing.x>f.marks.at(-1).landing.x,'向右瞄准，落点随之右移');
});

test('预判使用无风条件：同一球位在不同风下给出相同落点，真实击球仍受风影响',()=>{
 const g=new Game();g.start('coast',9);const hole=g.hole,club=g.snapshot().selectedClub;
 const calm=g.forecast(hole,club);g.forecastKey=null;const windy=g.forecast({...hole,wind:{x:6,z:-4,speed:7.2}},club);
 assert.deepEqual(windy.marks.map(m=>m.landing),calm.marks.map(m=>m.landing));
 const still=simulateShot({...hole,wind:{x:0,z:0,speed:0}},hole.tee,.8,0,0,{club,capture:false}),blown=simulateShot({...hole,wind:{x:6,z:0,speed:6}},hole.tee,.8,0,0,{club,capture:false});
 assert.ok(blown.landing.x-still.landing.x>1,'侧风把真实落点吹向下风方向');
});

test('预判插值在 0 与 100% 之间连续，推杆只沿瞄准线显示平地距离',()=>{
 const g=new Game();g.start('sunny',9);const f=g.snapshot().forecast,ball=g.state.ball;
 const zero=interpolateForecast(f,ball,0);assert.equal(zero.carry,0);assert.deepEqual(zero.landing,{x:ball.x,z:ball.z});
 const half=interpolateForecast(f,ball,.5),more=interpolateForecast(f,ball,.52);assert.ok(more.carry>half.carry&&more.carry-half.carry<10);
 const full=interpolateForecast(f,ball,1);assert.equal(full.carry,f.marks.at(-1).carry);
 const hole=g.hole,guide=new ShotGuide();const info=guide.update(hole,ball,f,.6,false,0);assert.ok(guide.visible);assert.ok(Math.abs(distance(info.anchor,ball)-info.carry)<2);
 const putt={clubId:'putter',aim:0,marks:[{power:1,landing:{x:0,z:0},end:{x:6,z:20},carry:0,total:21,apex:0}]},heading=Math.atan2(hole.pin.x,hole.pin.z),p=guide.update(hole,{x:0,z:0},putt,1,true,heading);
 assert.ok(Math.abs(Math.atan2(p.anchor.x,p.anchor.z)-heading)<1e-9,'推杆预判沿瞄准方向，不泄露坡度借位');
});

test('落地回旋让各杆全力总距离贴近参考距离，挖起杆不会冲出果岭太远',()=>{
 const base=makeHole('sunny',1,421),flat={...base,hazards:[],trees:[],wind:{x:0,z:0,speed:0},slope:0,elevation:0,length:600,greenRadius:0,width:200,pin:{x:0,z:900}};
 for(const club of CLUBS.filter(c=>c.id!=='putter')){const s=simulateShot(flat,{x:0,z:0},1,0,0,{club,capture:false});assert.ok(Math.abs(s.travel-club.range)/club.range<.15,`${club.name} 全力 ${s.travel.toFixed(0)} 米，参考 ${club.range} 米`);}
 const wedge=simulateShot(flat,{x:0,z:0},.6,0,0,{club:CLUBS.find(c=>c.id==='wedge'),capture:false});assert.ok((wedge.travel-wedge.carry)/wedge.travel<.1);
 assert.ok(CLUB_SPIN.driver>CLUB_SPIN.iron&&CLUB_SPIN.iron>CLUB_SPIN.wedge&&CLUB_SPIN.putter===1);
});

test('球车停在第三人称镜头视野之外，接驳仍有完整上下车时间',()=>{
 for(const [course,index] of [['sunny',1],['orchard',0],['pine',3]]){
  const h=makeHole(course,index,421),ball={x:2,z:60},a=Math.atan2(h.pin.x-ball.x,h.pin.z-ball.z),q=parkingAt(h,ball);
  const camera={x:ball.x-Math.sin(a)*6.8+Math.cos(a)*.3,z:ball.z-Math.cos(a)*6.8-Math.sin(a)*.3},dx=q.x-camera.x,dz=q.z-camera.z,forward=dx*Math.sin(a)+dz*Math.cos(a),side=Math.abs(dx*Math.cos(a)-dz*Math.sin(a));
  assert.ok(forward<=0||Math.atan2(side,forward)>Math.PI/4,`${course} 球车不在镜头正前方视野内`);
 }
 const h=makeHole('sunny',1,421),plan=movementPlan(h,h.tee,{x:0,z:170});assert.equal(plan.mode,'cart');assert.ok(plan.boarding>=900&&plan.alighting>=900);
});

test('树木碰撞网格筛选与逐个检测结果一致',()=>{
 const h=makeHole('pine',2,77),list=treeColliders(h);assert.equal(treeColliders(h),list,'同一球洞复用碰撞体');
 const brute=[...list];let hits=0;
 for(let i=0;i<400;i++){const t=list[i%list.length],a={x:t.x+Math.sin(i)*6,y:t.y+Math.cos(i*1.7)*3,z:t.z+Math.cos(i)*6},b={x:t.x-Math.sin(i)*2,y:t.y,z:t.z-Math.cos(i)*2};const fast=sweepTrees(list,a,b,.085),slow=sweepTrees(brute,a,b,.085);assert.deepEqual(fast,slow);if(fast)hits++;}
 assert.ok(hits>50);
});
