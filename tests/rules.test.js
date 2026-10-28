import test from 'node:test';
import assert from 'node:assert/strict';
import {COURSES,makeHole,heightAt,surfaceAt,distance,clubFor} from '../shared/courses.js';
import {SwingDetector,mapSwing} from '../shared/swing.js';
import {simulateShot,canCapture} from '../game-service/physics.js';
import {Game} from '../game-service/game.js';

test('all 54 designed holes have playable tees and pins, reproducible terrain and bounded wind',()=>{
 for(const c of COURSES){assert.equal(c.holes.length,9);for(let i=0;i<9;i++){
  const h=makeHole(c.id,i,4242);assert.deepEqual(h,makeHole(c.id,i,4242));assert.equal(surfaceAt(h,h.tee.x,h.tee.z),'tee');assert.equal(surfaceAt(h,h.pin.x,h.pin.z),'green');assert.ok(h.wind.speed>=c.wind[0]&&h.wind.speed<=c.wind[1]);assert.ok(Number.isFinite(heightAt(h,h.pin.x,h.pin.z)));
  for(const power of [.15,.5,1]){const s=simulateShot(h,h.tee,power,0);assert.ok(s.path.length>2);assert.ok(s.path.every(p=>Number.isFinite(p.x+p.y+p.z+p.t)));assert.ok(s.duration<=8);assert.ok(Number.isFinite(s.to.x+s.to.z));}
 }}
});
test('twenty full swing traces produce exactly one event each and reject post-hit noise',()=>{
 const d=new SwingDetector();let t=0,hits=[];
 for(let i=0;i<20;i++){
  for(const v of [0,150,190,140,60,-100,-200,-500,-650,-400,-250,120,-200,0]){const hit=d.sample(v,4,t);if(hit)hits.push(hit);t+=40;}
  for(let j=0;j<50;j++){const hit=d.sample(0,4,t);if(hit)hits.push(hit);t+=40;}
 }
 assert.equal(hits.length,20);assert.ok(hits.every(h=>h.peak===650));assert.deepEqual(hits[0].path,['IDLE','BACK','DOWN','HIT','COOLDOWN']);
});
test('jitter, pickup, timeout and sensor interruption do not emit phantom swings',()=>{
 const d=new SwingDetector();let t=0,hits=[];
 for(let i=0;i<10;i++)for(const v of [0,10,20,-20,25,0,160,80,30,0,0,0]){const h=d.sample(v,0,t);if(h)hits.push(h);t+=90;}
 assert.equal(hits.length,0);d.reset();d.sample(200,0,0);d.sample(-300,0,100);assert.equal(d.sample(-50,0,1000),null);assert.equal(d.state,'IDLE');
});
test('calibrated light/medium/heavy powers separate and direction has a neutral zero',()=>{
 const cal={peakMax:600,dirZero:12};const powers=[150,350,600].map(peak=>mapSwing({peak,direction:12},cal));assert.ok(powers[0].power<.12);assert.ok(powers[1].power>.4&&powers[1].power<.5);assert.equal(powers[2].power,1);assert.ok(powers.every(p=>p.dir===0));assert.equal(mapSwing({peak:600,direction:100},cal).dir,1);
});
test('same input gives identical server physics; crosswind and tailwind act predictably',()=>{
 const h=makeHole('sunny',0,11);const calm={...h,wind:{x:0,z:0,speed:0},trees:[]};const a=simulateShot(calm,h.tee,.55,0);assert.deepEqual(a,simulateShot(calm,h.tee,.55,0));
 const cross=simulateShot({...calm,wind:{x:5,z:0,speed:5}},h.tee,.55,0),tail=simulateShot({...calm,wind:{x:0,z:5,speed:5}},h.tee,.55,0),head=simulateShot({...calm,wind:{x:0,z:-5,speed:5}},h.tee,.55,0);assert.ok(cross.to.x>a.to.x+1);assert.ok(tail.to.z>head.to.z);
});
test('putting ignores wind and has fine low-power resolution',()=>{
 const h=makeHole('sunny',0,13),from={x:h.pin.x,z:h.pin.z-8};assert.equal(clubFor(h,from).id,'putter');const a=simulateShot(h,from,.06,0),b=simulateShot({...h,wind:{x:40,z:40,speed:56}},from,.06,0);assert.deepEqual(a.to,b.to);assert.ok(distance(from,a.to)<3);
});
test('cup captures a slow crossing but rejects a fast crossing',()=>{assert.equal(canCapture({x:-1,z:0},{x:1,z:0},{x:0,z:0},1),true);assert.equal(canCapture({x:-1,z:0},{x:1,z:0},{x:0,z:0},4),false);assert.equal(canCapture({x:-1,z:1},{x:1,z:1},{x:0,z:0},1),false);});
test('water and out-of-bounds return to previous ball position with one penalty',()=>{
 const h=makeHole('sunny',0,1);h.hazards.push({type:'water',x:0,z:70,rx:70,rz:40,angle:0});const s=simulateShot(h,h.tee,.5,0);assert.equal(s.penalty,'water');assert.deepEqual(s.to,h.tee);
 const out=simulateShot(makeHole('sunny',0,1),{x:90,z:100},1,1,80);assert.equal(out.penalty,'out');assert.deepEqual(out.to,{x:90,z:100});
});
test('game rejects invalid, stale, busy and duplicate swings and restores in-flight rounds',()=>{
 const g=new Game();g.start('sunny',3);g.setArmed(true);let version=g.state.stateVersion;
 assert.throws(()=>g.stroke({power:NaN,dir:0,seq:1,stateVersion:version},'one'),/无效/);assert.throws(()=>g.stroke({power:.5,dir:0,seq:1,stateVersion:version-1},'one'),/更新/);
 g.stroke({power:.5,dir:0,seq:1,stateVersion:version},'one');assert.equal(g.state.strokes,1);assert.throws(()=>g.stroke({power:.5,dir:0,seq:2,stateVersion:g.state.stateVersion},'one'),/等待/);
 const restored=new Game(JSON.parse(JSON.stringify(g.state)));assert.equal(restored.state.phase,'playing');assert.deepEqual(restored.state.ball,g.state.ball);g.settle();assert.throws(()=>g.stroke({power:.5,dir:0,seq:1,stateVersion:g.state.stateVersion},'one'),/已经收到/);assert.equal(g.state.strokes,1);
});
test('a real short putt completes every hole of a nine-hole round and produces a scorecard',()=>{
 const g=new Game();g.start('sunny',9);for(let i=0;i<9;i++){const h=g.hole;g.state.ball={x:h.pin.x,z:h.pin.z-1};g.setArmed(true);const shot=g.stroke({power:.04,dir:0,seq:i+1,stateVersion:g.state.stateVersion},'one');assert.equal(shot.holed,true,`hole ${i+1}`);g.settle();assert.equal(g.state.scores.length,i+1);if(i<8){assert.equal(g.state.phase,'hole_complete');g.next();}else assert.equal(g.state.phase,'finished');}assert.equal(g.state.scores.reduce((s,x)=>s+x.strokes,0),9);
});
