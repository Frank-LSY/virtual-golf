import test from 'node:test';
import assert from 'node:assert/strict';
import {rollStep,cupContact,puttingRead} from '../shared/putting.js';
import {makeHole,heightAt,distance} from '../shared/courses.js';
import {BALL_RADIUS,CUP_RADIUS,DROP_DURATION,sampleShot} from '../shared/ball.js';
import {simulateShot} from '../game-service/physics.js';
import {ImpactEffects} from '../screen-web/impact-effects.js';
import {GreenGuide} from '../screen-web/green-guide.js';
import {Game} from '../game-service/game.js';
import {roundExport} from '../shared/players.js';

test('相同初速在上坡更快停、下坡滚更远，侧坡向低处弯且停止无抖动',()=>{
 const run=s=>{let v={x:0,z:2},p={x:0,z:0};for(let i=0;i<1200;i++){v=rollStep(v,s,.53,1/120);p.x+=v.x/120;p.z+=v.z/120;}return {v,p};};
 const flat=run({x:0,z:0}),up=run({x:0,z:.035}),down=run({x:0,z:-.035}),side=run({x:.035,z:0});
 assert.ok(up.p.z<flat.p.z*.75);assert.ok(down.p.z>flat.p.z*1.4);assert.ok(side.p.x<-.5);assert.deepEqual(flat.v,{x:0,y:0,z:0});assert.deepEqual(up.v,{x:0,y:0,z:0});
 assert.deepEqual(rollStep({x:0,z:0},{x:.025,z:.01},.53,1/120),{x:0,y:0,z:0});
 assert.ok(rollStep({x:0,z:0},{x:0,z:-.12},.53,1/120).z>0);
});
test('洞口按实际碰撞段判定：远处近失球不吸附，高速与低速中线球结果不同',()=>{
 const pin={x:0,z:0};assert.equal(cupContact({x:.4,z:-1},{x:.4,z:1},pin,{x:0,z:1}),null);
 assert.equal(cupContact({x:0,z:-1},{x:0,z:-.8},pin,{x:0,z:1}),null);
 assert.equal(cupContact({x:0,z:-.3},{x:0,z:.3},pin,{x:0,z:1}).kind,'drop');
 // 0.22：旗杆留在洞中——正对洞心的快球先撞旗杆：3.6 米/秒以内落杯，更快弹开；拔掉旗杆时仍是越过洞口。
 assert.equal(cupContact({x:0,z:-.3},{x:0,z:.3},pin,{x:0,z:3}).kind,'pin_drop');
 assert.equal(cupContact({x:0,z:-.3},{x:0,z:.3},pin,{x:0,z:4}).kind,'pin_bounce');
 assert.equal(cupContact({x:0,z:-.3},{x:0,z:.3},pin,{x:0,z:4},{flagstick:false}).kind,'roll_over');
 assert.equal(cupContact({x:0,z:-.3},{x:0,z:.3},pin,{x:0,z:2.2}).kind,'drop','正中 2.2 米/秒仍能直接落杯（原上限 1.9）');
});
test('绕洞弹出与绕洞落杯保留连续轨迹，动画留出一秒观察洞缘',()=>{
 const h=makeHole('sunny',0,421),from={x:h.pin.x,z:h.pin.z-2};
 for(const [power,aim,kind,holed] of [[.08,-5,'lip_out',false],[.07,-1,'rim_drop',true]]){
  const s=simulateShot(h,from,power,0,aim);assert.equal(s.cupOutcome,kind);assert.equal(s.holed,holed);
  const rim=s.path.filter(p=>p.t>=s.rimTime&&p.t<=s.rimEndTime);assert.ok(rim.length>30);
  for(let i=1;i<rim.length;i++){assert.ok(distance(rim[i],rim[i-1])<.025);assert.ok(rim[i].t>rim[i-1].t);}
  const entry=s.captureTime??s.path.at(-1).t,tail=holed?DROP_DURATION:0,rate=(s.duration-tail-s.rimExtra)/entry;
  const start=s.rimTime*rate,end=s.rimEndTime*rate+s.rimExtra;assert.ok(end-start>=1.05-1e-8);
  assert.equal(sampleShot(s,(start+end)/2).rimming,true);
  const nearEnd=sampleShot(s,end-.00001),afterEnd=sampleShot(s,end+.00001);assert.ok(distance(nearEnd,afterEnd)<.001);
  if(holed){const end=sampleShot(s,s.duration);assert.equal(end.x,h.pin.x);assert.ok(end.y<heightAt(h,h.pin.x,h.pin.z)-.3);assert.equal(s.impacts.filter(e=>e.phase==='bottom').length,1);}else assert.ok(distance(s.to,h.pin)>CUP_RADIUS);
 }
});
test('坡度提示与网格使用同一地形，镜头转向后上坡和侧向提示随瞄准改变',()=>{
 const h=makeHole('coast',0,421),ball={x:h.pin.x,z:h.pin.z-3},a=puttingRead(h,ball,0),b=puttingRead(h,ball,180);
 assert.ok(a.along>0);assert.ok(a.across>0);assert.ok(b.along<0);assert.ok(b.across<0);
 const guide=new GreenGuide(h);assert.ok(guide.arrows.count>20);guide.update(4);const grid=guide.children[0].geometry.attributes.position;
 for(let i=0;i<grid.count;i++)assert.ok(Math.abs(grid.getY(i)-heightAt(h,grid.getX(i),grid.getZ(i))-.045)<.0001);
 guide.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
});
test('洞缘事件只播放一次且特效释放，玩家击球记录保留擦洞反馈',()=>{
 const h=makeHole('sunny',0,421),g=new Game();g.start('sunny',3);g.state.seed=421;g.state.ball={x:h.pin.x,z:h.pin.z-2};g.state.aim=-5;g.savePlayer();g.setArmed(true);
 const shot=g.stroke({power:.08,dir:0,seq:1,stateVersion:g.state.stateVersion},'screen');let count=0;const effects=new ImpactEffects(()=>count++);effects.reset(shot);effects.sample(100,0);effects.sample(100,1);assert.equal(count,shot.impacts.length);effects.update(3000);assert.equal(effects.bursts.length,0);assert.equal(effects.children.length,0);
 const record=roundExport(g.snapshot())['击球记录'][0];assert.equal(record['碰撞反馈'][0]['类型'],'绕洞后弹出');assert.equal(record['进洞'],false);assert.ok(g.snapshot().putting);
});
