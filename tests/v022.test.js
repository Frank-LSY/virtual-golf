import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {makeHole,heightAt,surfaceAt,routeDistance,distance,landValue,COURSES} from '../shared/courses.js';
import {simulateShot,sweepPin,WIND_PUSH} from '../game-service/physics.js';
import {cupContact,cupFunnel,captureLimit,CUP_CAPTURE_SPEED,PIN_STOP_SPEED,CUP_LABELS} from '../shared/putting.js';
import {TREE_MESHES,treeColliders,sweepTrees,insideCrown,rockVertices,eulerXYZ,ROCK_SIZE} from '../shared/trees.js';
import {BALL_RADIUS,CUP_RADIUS,PIN_RADIUS} from '../shared/ball.js';
import {CLUBS} from '../shared/clubs.js';
import {Game} from '../game-service/game.js';
import {TrainingChannel} from '../local-gateway/training-channel.js';
import {RoundChannel,CAMERA_ACTIONS} from '../local-gateway/round-channel.js';
import {interpolateForecast,ShotGuide} from '../screen-web/shot-guide.js';
import {followPose,FOLLOW} from '../shared/view.js';
import {GolfScene} from '../screen-web/scene.js';
import {PlayerScene} from '../screen-web/player-scene.js';
import {CourseLandscape} from '../screen-web/course-landscape.js';
import {courseTour} from '../shared/course-tour.js';
import {courseToLocal} from '../shared/course-layout.js';
import {impactLayers} from '../screen-web/spatial-audio.js';
import {roundExport} from '../shared/players.js';

const club=id=>CLUBS.find(c=>c.id===id);
// 平坦、无障碍的测试球洞（保留真实球洞的其余字段）。
function flatHole(extra={}){const base=makeHole('sunny',1,421);return {...base,hazards:[],trees:[],rocks:[],slope:0,elevation:0,length:600,greenRadius:30,width:200,wind:{x:0,z:0,speed:0},pin:{x:0,z:600},...extra};}

test('风：侧风与顺风推力加强约三分之一，逆风比顺风更吃距离，推杆不受风影响',()=>{
 const h=flatHole({pin:{x:0,z:900},greenRadius:0}),driver=club('driver'),calm=simulateShot(h,{x:0,z:0},1,0,0,{club:driver,capture:false});
 const shot=wind=>simulateShot({...h,wind},{x:0,z:0},1,0,0,{club:driver,capture:false});
 const cross=shot({x:5.5,z:0,speed:5.5}),head=shot({x:0,z:-5.5,speed:5.5}),tail=shot({x:0,z:5.5,speed:5.5});
 const drift=cross.landing.x-calm.landing.x,loss=calm.carry-head.carry,gain=tail.carry-calm.carry;
 assert.equal(WIND_PUSH,.16);assert.ok(drift>9&&drift<12,`5.5 米/秒侧风把一号木吹偏 ${drift.toFixed(1)} 米`);assert.ok(gain>8&&gain<12);assert.ok(loss>gain*1.2,`逆风损失 ${loss.toFixed(1)} 米 > 顺风增加 ${gain.toFixed(1)} 米`);
 const green=flatHole(),from={x:0,z:592};const a=simulateShot(green,from,.3,0,0,{club:club('putter')}),b=simulateShot({...green,wind:{x:8,z:8,speed:11}},from,.3,0,0,{club:club('putter')});assert.deepEqual(a.to,b.to);
});

test('洞口更宽容：正中快球被旗杆挡下落杯；拔旗杆后同样速度越过洞口；更快的球撞旗杆弹回',()=>{
 assert.ok(CUP_CAPTURE_SPEED>1.9);assert.ok(captureLimit(0)>captureLimit(1));assert.ok(PIN_STOP_SPEED>CUP_CAPTURE_SPEED);
 const pin={x:0,z:0},through={x:0,z:-.3},past={x:0,z:.3};
 assert.equal(cupContact(through,past,pin,{x:0,z:1.1}).kind,'drop');
 // 偏心 1.05 倍洞半径、慢速：原规则必定弹出，现在绕洞落杯。
 const off=CUP_RADIUS*1.05;assert.equal(cupContact({x:off,z:-.4},{x:off,z:.4},pin,{x:0,z:.8}).kind,'rim_drop');
 const h=flatHole(),putter=club('putter'),from={x:0,z:592},fast=simulateShot(h,from,.5,0,0,{club:putter});
 assert.equal(fast.holed,true);assert.equal(fast.cupOutcome,'pin_drop');assert.ok(fast.impacts.some(e=>e.type==='cup'&&e.kind==='pin_drop'));
 const noPin=simulateShot(h,from,.5,0,0,{club:putter,flagstick:false});assert.equal(noPin.holed,false);assert.ok(distance(noPin.to,h.pin)>1);
 const harder=simulateShot(h,from,1,0,0,{club:putter});assert.equal(harder.holed,false);assert.ok(harder.impacts.some(e=>e.type==='pin'&&e.phase==='roll'));assert.ok(harder.to.z<h.pin.z,'撞旗杆后弹回洞前');
 for(const kind of ['pin_drop','pin_bounce','dunk','pin_hit'])assert.ok(CUP_LABELS[kind]);
});

test('洞口微凹：只在 0.6 米内对慢速滚球有很小的向心加速度',()=>{
 const pin={x:0,z:0},v={x:0,y:0,z:.8};
 const near=cupFunnel({x:.4,z:-.1},v,pin,1/120),far=cupFunnel({x:.9,z:0},v,pin,1/120),quick=cupFunnel({x:.4,z:-.1},{x:0,y:0,z:3},pin,1/120);
 assert.ok(near.x<0&&near.x>-.01,'朝洞心方向的极小偏转');assert.deepEqual(far,v);assert.equal(quick.x,0);
});

test('空中击中旗杆：贴杆落下停在洞边或落杯；拔掉旗杆时球飞远',()=>{
 const pin={x:0,z:10},hit=sweepPin({x:0,y:1,z:5},{x:0,y:1,z:15},pin,0);assert.ok(hit);assert.ok(Math.abs(hit.position.z-(10-PIN_RADIUS-BALL_RADIUS))<1e-9);assert.ok(hit.normal.z<-.99);
 assert.equal(sweepPin({x:0,y:4,z:5},{x:0,y:4,z:15},pin,0),null,'高于旗杆顶不碰');assert.equal(sweepPin({x:.5,y:1,z:5},{x:.5,y:1,z:15},pin,0),null);
 const h=flatHole(),wedge=club('wedge'),from={x:0,z:550},land=target=>{let lo=.05,hi=1;for(let k=0;k<40;k++){const m=(lo+hi)/2,q=simulateShot(h,from,m,0,0,{club:wedge,capture:false});if(q.landing.z<target)lo=m;else hi=m;}return (lo+hi)/2;};
 for(const target of [600.4,600.9,601.5]){const power=land(target),shot=simulateShot(h,from,power,0,0,{club:wedge}),free=simulateShot(h,from,power,0,0,{club:wedge,flagstick:false}),pole=shot.impacts.find(e=>e.type==='pin'&&e.phase==='flight');
  assert.ok(pole,'落点略过洞的挖起杆在空中击中旗杆');assert.ok(pole.speedAfter<pole.speed*.8);assert.ok(shot.holed||distance(shot.to,h.pin)<2.5,`击中旗杆后停在 ${distance(shot.to,h.pin).toFixed(2)} 米`);assert.ok(distance(free.to,h.pin)>distance(shot.to,h.pin)+2,'拔掉旗杆时球冲过洞口');}
});

test('空中直接落进洞口：低速落点在洞内算进洞（直接落杯）',()=>{
 const h=flatHole(),wedge=club('wedge'),from={x:0,z:550};let lo=.05,hi=1;
 for(let k=0;k<40;k++){const m=(lo+hi)/2,q=simulateShot(h,from,m,0,0,{club:wedge,capture:false});if(q.landing.z<h.pin.z)lo=m;else hi=m;}
 const s=simulateShot(h,from,(lo+hi)/2,0,0,{club:wedge});assert.equal(s.holed,true);assert.equal(s.cupOutcome,'dunk');assert.ok(s.impacts.some(e=>e.kind==='dunk'));const end=s.path.at(-1);assert.ok(end.y<heightAt(h,h.pin.x,h.pin.z)-.2,'球落到洞底');
});

test('树冠是软的：球钻进枝叶后减速掉落，不会停在树顶；树干仍是硬反弹',()=>{
 const base={...makeHole('sunny',0,421),practice:true,putting:false,wind:{x:0,z:0,speed:0},rocks:[]},wedge=club('wedge'),calm=simulateShot({...base,trees:[]},{x:0,z:0},.7,0,0,{club:wedge,capture:false});
 let crowns=0;
 for(let dz=-6;dz<=6;dz+=1)for(let dx=-3;dx<=3;dx+=1.5){const h={...base,trees:[{x:calm.landing.x+dx,z:calm.landing.z+dz,scale:1.3,rotation:.3}]},s=simulateShot(h,{x:0,z:0},.7,0,0,{club:wedge,capture:false}),end=s.path.at(-1);
  assert.ok(end.y-heightAt(h,end.x,end.z)<.3,`球落回地面（树位 ${dx},${dz}）`);assert.ok(end.t<20);
  const leaf=s.impacts.find(e=>e.kind==='crown');if(leaf){crowns++;assert.ok(leaf.speedAfter<leaf.speed*.6);}}
 assert.ok(crowns>10);
 const h={...base,trees:[{x:0,z:30,scale:1,rotation:0}]},colliders=treeColliders(h),inside=colliders.find(p=>p.kind==='crown');assert.ok(insideCrown(colliders,0,{x:inside.x,y:inside.y,z:inside.z}));assert.equal(insideCrown(colliders,0,{x:0,y:40,z:30}),false);
 assert.equal(sweepTrees(colliders,{x:inside.x-20,y:inside.y,z:inside.z},{x:inside.x+20,y:inside.y,z:inside.z},BALL_RADIUS,new Set([0]))?.kind??'none','none','穿行中的树冠不再阻挡');
});

test('岩石参与碰撞：碰撞体与 Three.js 十二面体一致，放置避开球道、果岭与发球台',()=>{
 const geo=new THREE.DodecahedronGeometry(ROCK_SIZE,0),rock={x:4,y:3.4,z:7,sx:2.1,sy:.9,sz:1.4,rx:.4,ry:1.1,rz:.7},o=new THREE.Object3D();o.position.set(rock.x,rock.y,rock.z);o.scale.set(rock.sx,rock.sy,rock.sz);o.rotation.set(rock.rx,rock.ry,rock.rz);o.updateMatrix();
 const ours=rockVertices(rock),theirs=[];const p=geo.attributes.position;for(let i=0;i<p.count;i++)theirs.push(new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrix));
 for(const v of theirs)assert.ok(ours.some(q=>Math.hypot(q.x-v.x,q.y-v.y,q.z-v.z)<1e-6),'顶点一致');assert.equal(TREE_MESHES.rock.planes.length,12);
 const R=eulerXYZ(.3,.2,.1),m=new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(.3,.2,.1)).elements;assert.ok(Math.abs(R[1]-m[4])<1e-12&&Math.abs(R[3]-m[1])<1e-12);
 const h={...flatHole(),rocks:[{...rock,y:heightAt(flatHole(),4,7)+.4}]},colliders=treeColliders(h),solid=colliders.find(c=>c.kind==='rock');for(const v of rockVertices(h.rocks[0]))for(const {n,d} of solid.planes)assert.ok(n.x*(v.x-solid.x)+n.y*(v.y-solid.y)+n.z*(v.z-solid.z)<=d+1e-6);
 const aim=Math.atan2(4,600)*180/Math.PI,roll=simulateShot(h,{x:4,z:0},1,0,aim,{club:club('putter')}),bump=roll.impacts.find(e=>e.type==='rock');assert.ok(bump,'滚向岩石的球撞上岩石');assert.ok(roll.to.z<7,'被岩石挡住');assert.ok(bump.speedAfter<bump.speed);
 let total=0;for(const c of COURSES)for(let i=0;i<c.holes.length;i++){const hole=makeHole(c.id,i,421);total+=hole.rocks.length;for(const r of hole.rocks){assert.equal(surfaceAt(hole,r.x,r.z),'rough');assert.ok(routeDistance(hole,r.x,r.z)>=hole.width+5);assert.ok(distance(r,hole.pin)>=hole.greenRadius+7);assert.ok(Math.hypot(r.x,r.z)>=16);}}
 assert.ok(total>300);
 const shot=roll,record=roundExport({hole:h,players:[],shotHistory:[{...shot,impacts:shot.impacts}],scores:[]});assert.ok(JSON.stringify(record).includes('岩石'));
 assert.ok(impactLayers({type:'rock',speed:8}).length>0);assert.ok(impactLayers({type:'pin',speed:4}).length>0);
});

test('远景装饰树不再落进当前球洞场地（以前会出现在球道和发球台后）',()=>{
 for(const [id,index] of [['orchard',3],['pine',8],['pine',5]]){const h=makeHole(id,index,421),tour=courseTour(id,h.seed-h.index*7919),land=new CourseLandscape(tour,{activeIndex:index}),m=new THREE.Matrix4(),p=new THREE.Vector3();
  for(let i=0;i<land.foliage.count;i++){land.foliage.getMatrixAt(i,m);p.setFromMatrixPosition(m);const q=courseToLocal(tour.placements[index],{x:p.x,z:p.z});assert.ok(landValue(h,q.x,q.z)>=1.25,`${id}${index} 第 ${i} 棵装饰树在场地外`);}
  land.dispose();}
});

test('预判附带风偏落点；插值给出风偏距离，画面显示含风落点与透视标记',()=>{
 const g=new Game();g.start('coast',3);g.state.seed=421;const hole=g.hole;hole.wind.speed>0||assert.fail('海岸球场有风');const f=g.snapshot().forecast;
 assert.ok(f.marks.every(m=>m.windLanding&&m.windEnd));const full=f.marks.at(-1);assert.ok(Math.hypot(full.windLanding.x-full.landing.x,full.windLanding.z-full.landing.z)>1);
 const info=interpolateForecast(f,g.state.ball,.9);assert.ok(info.drift>1);const zero=interpolateForecast(f,g.state.ball,0);assert.equal(zero.drift,0);
 const guide=new ShotGuide(),res=guide.update(g.hole,g.state.ball,f,.9,false,0);assert.ok(guide.wind.visible);assert.ok(guide.windArrow.visible);assert.ok(res.target);assert.equal(guide.landingXray.material.depthTest,false);
 const camera=new THREE.PerspectiveCamera();camera.position.set(0,400,0);guide.updateMatrixWorld(true);guide.tick(.016,camera);assert.ok(guide.landing.scale.x>guide.baseScale.landing*3,'远处镜头放大落点标记');
});

test('电脑击球直接计杆（取消电脑试挥），方向随击球送达；手机挥杆仍是“未准备 = 试挥”，并可遥控方向与镜头',()=>{
 const g=new Game();g.start('sunny',3);const screen={role:'screen',clientId:'s',roundView:true},phone={role:'phone',clientId:'p',calibrated:true},other={role:'phone',clientId:'q',calibrated:true},clients=new Set([screen,phone]),messages=[],shots=[];
 const send=(to,m)=>messages.push({to,m}),training=new TrainingChannel(clients,send),round=new RoundChannel(g,clients,send,training,{state:()=>round.sync(),shot:s=>shots.push(s)});round.sync();
 round.handle(phone,{type:'swing',power:.4,dir:0,seq:1,stateVersion:g.state.stateVersion});assert.equal(g.state.strokes,0);assert.ok(messages.some(x=>x.m.type==='rehearsal_ack'),'手机未准备时仍是试挥');
 round.handle(phone,{type:'round_aim',aim:7});assert.equal(g.state.aim,7);
 const before=messages.length;round.handle(phone,{type:'round_camera',action:'left'});const relayed=messages.slice(before).filter(x=>x.m.type==='round_camera');assert.equal(relayed.length,1);assert.equal(relayed[0].to,screen);assert.equal(relayed[0].m.action,'left');
 assert.throws(()=>round.handle(phone,{type:'round_camera',action:'spin'}),/无法识别/);clients.add(other);assert.throws(()=>round.handle(other,{type:'round_camera',action:'in'}),/还未轮到/);clients.delete(other);
 for(const a of ['left','right','up','down','in','out','reset','view-follow','view-overview','view-cup'])assert.ok(CAMERA_ACTIONS.has(a));
 round.handle(screen,{type:'swing',power:.5,dir:0,seq:2,stateVersion:g.state.stateVersion,aim:-3});assert.equal(g.state.strokes,1,'电脑击球无需先准备');assert.equal(shots.length,1);assert.equal(g.state.shotHistory[0].aim,-3);assert.equal(g.state.shotHistory[0].source,'screen');assert.ok(messages.some(x=>x.to===screen&&x.m.type==='ack'));
 assert.throws(()=>round.handle(phone,{type:'round_aim',aim:2}),/停稳/);
});

test('人物视角镜头：拉远更高更远、注视点前移；环绕到球前方时看向球；工具条与手机共用同一组操作',()=>{
 const h=makeHole('sunny',0,421),p={x:0,z:0},heading=0,base=followPose(h,p,heading),far=followPose(h,p,heading,{zoom:5}),high=followPose(h,p,heading,{tilt:30}),front=followPose(h,p,heading,{orbit:Math.PI});
 const dist=q=>Math.hypot(q.position.x-p.x,q.position.z-p.z);assert.ok(Math.abs(dist(base)-FOLLOW.back*Math.cos(FOLLOW.elevation*Math.PI/180))<.4);assert.ok(dist(far)>dist(base)*4);assert.ok(far.position.y>base.position.y+8);assert.ok(far.look.z>base.look.z);assert.ok(high.position.y>base.position.y+2);assert.ok(front.position.z>0);assert.ok(Math.abs(front.look.z-p.z)<1e-9);
 const scene=Object.create(PlayerScene.prototype);Object.assign(scene,{hole:h,view:'follow',phase:'address',orbit:0,followZoom:1,followTilt:0,viewState:{reset(){},focus:'course',zoom:1,yaw:0,scale(){},rotate(){},tilt(){}},motionView:{reset(){},yaw:0,pitch:0},setCamera(){},preview:false});let changes=0;scene.onViewChange=()=>changes++;
 scene.cameraAction('out');assert.ok(scene.followZoom>1);scene.cameraAction('left');assert.ok(scene.orbit<0);scene.cameraAction('up');assert.ok(scene.followTilt>0);for(let i=0;i<40;i++)scene.cameraAction('out');assert.equal(scene.followZoom,7);scene.cameraAction('reset');assert.equal(scene.followZoom,1);assert.equal(scene.orbit,0);assert.equal(scene.followTilt,0);assert.ok(changes>=4);
});

test('软旗：旗面朝下风方向；风越大越平直、抖动越快，无风时下垂',()=>{
 const calm=GolfScene.flagPose({x:0,z:0,speed:0},1),light=GolfScene.flagPose({x:2,z:0,speed:2},1),strong=GolfScene.flagPose({x:0,z:-6,speed:6},1);
 assert.ok(calm.droop>1);assert.ok(strong.droop<.3);assert.ok(light.droop<calm.droop&&light.droop>strong.droop);assert.ok(strong.omega>calm.omega);assert.ok(strong.amp>calm.amp);
 // 旗面局部 +x 经 rotation.y 后朝向风去的方向。
 for(const w of [{x:3,z:0,speed:3},{x:0,z:4,speed:4},{x:-2,z:-2,speed:2.83}]){const yaw=GolfScene.flagPose(w,0).yaw,dir=new THREE.Vector3(1,0,0).applyEuler(new THREE.Euler(0,yaw,0));assert.ok(Math.abs(dir.x-w.x/w.speed)<.01&&Math.abs(dir.z-w.z/w.speed)<.01);}
 const scene=Object.create(GolfScene.prototype),group=new THREE.Group();Object.assign(scene,{group,hole:{...makeHole('coast',0,421)}});scene.buildFlag(scene.hole,3);scene.updateFlag(2);const pos=scene.flag.geometry.attributes.position;let tip=0;for(let i=0;i<pos.count;i++)tip=Math.max(tip,pos.getX(i));assert.ok(tip>.6);
 scene.shakePin({normal:{x:0,z:-1},speed:6});scene.updateFlag(2.05);assert.ok(Math.abs(scene.pinRig.rotation.x)+Math.abs(scene.pinRig.rotation.z)>0);
});

test('全部 54 洞抽样击球：不会悬停在树顶、树干顶或岩石上，碰撞结果可复现',()=>{
 let shots=0;for(const c of COURSES)for(let i=0;i<c.holes.length;i++){const h=makeHole(c.id,i,421);for(const power of [.5,1])for(const aim of [-25,0,25]){const s=simulateShot(h,h.tee,power,.3,aim);shots++;const end=s.path.at(-1);if(!s.holed&&!s.penalty)assert.ok(end.y-heightAt(h,end.x,end.z)<.4,`${c.id}${i} 力度 ${power} 瞄准 ${aim}° 球停在离地 ${(end.y-heightAt(h,end.x,end.z)).toFixed(2)} 米`);assert.ok(end.t<30);
  if(!s.holed){const next=simulateShot(h,s.to,.6,0,0),e2=next.path.at(-1);if(!next.holed&&!next.penalty)assert.ok(e2.y-heightAt(h,e2.x,e2.z)<.4);}}}
 const h=makeHole('orchard',8,421);assert.deepEqual(simulateShot(h,h.tee,.45,-.4,-25),simulateShot(h,h.tee,.45,-.4,-25));assert.ok(shots>=324);
});
