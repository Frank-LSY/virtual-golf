import test from 'node:test';
import assert from 'node:assert/strict';
import {COURSES,makeHole,distance,surfaceAt} from '../shared/courses.js';
import {courseLayout,localToCourse,courseToLocal,courseSummary} from '../shared/course-layout.js';
import {courseTour,holeTransfer,clearCourseRoad} from '../shared/course-tour.js';
import {Game} from '../game-service/game.js';
import {CourseLandscape} from '../screen-web/course-landscape.js';
import {CourseJourney} from '../screen-web/course-journey.js';
import * as THREE from 'three';

test('六座完整九洞球场：不同主题、递进等级、喘息洞与合理标准杆',()=>{
 assert.equal(COURSES.length,6);assert.equal(new Set(COURSES.map(c=>c.theme)).size,6);
 for(const [i,c] of COURSES.entries()){const s=courseSummary(c);assert.equal(s.holes,9);assert.equal(c.level,i+1);assert.ok(s.par>=27&&s.par<=36);assert.ok(c.source.url.startsWith('https://'));assert.ok(c.holes.slice(1).some((h,i)=>h[4].challenge<c.holes[i][4].challenge));assert.ok(c.holes[8][4].challenge>=c.holes[0][4].challenge);
  for(let i=0;i<9;i++){const h=makeHole(c.id,i,42);assert.equal(surfaceAt(h,0,0),'tee');assert.equal(surfaceAt(h,h.pin.x,h.pin.z),'green');assert.ok(h.par===3?h.length>=75&&h.length<=205:h.par===4?h.length>=240&&h.length<400:h.length>=400&&h.length<=510);assert.ok(h.advice.length>12);}
 }
 const orchard=COURSES.find(c=>c.id==='orchard');assert.ok(orchard.holes.every(h=>h[1]===3));assert.equal(courseSummary(orchard).par,27);
});
test('全场坐标保持洞长与局部球位，所有球道互不相交且留出间隔',()=>{
 for(const c of COURSES){const t=courseTour(c.id);assert.equal(t.placements.length,9);for(const p of t.placements){assert.ok(Math.abs(distance(p.tee,p.green)-c.holes[p.index][2])<1e-6);const q={x:18,z:65},back=courseToLocal(p,localToCourse(p,q));assert.ok(distance(q,back)<1e-6);}
  const paths=t.holes.map(h=>h.route.filter((_,i)=>i%2===0).map(q=>localToCourse(h.placement,q)));for(let i=0;i<9;i++)for(let j=i+1;j<9;j++){let spacing=Infinity;for(const a of paths[i])for(const b of paths[j])spacing=Math.min(spacing,distance(a,b));assert.ok(spacing>t.holes[i].width+t.holes[j].width+2,`${c.id} ${i+1}/${j+1}: ${spacing}`);}
 }
});
test('所有洞共享世界风向，换洞后局部顺逆风按朝向转换',()=>{
 for(const c of COURSES){let wind;for(let i=0;i<9;i++){const h=makeHole(c.id,i,134),o=localToCourse(h.placement,{x:0,z:0}),w=localToCourse(h.placement,{x:h.wind.x,z:h.wind.z}),v={x:w.x-o.x,z:w.z-o.z};if(wind)assert.ok(distance(v,wind)<1e-8);wind=v;}}
});
test('五组种子的 270 段接驳均可达，不穿越果岭、水域或树干',()=>{
 for(const seed of [1,42,421,4242,987654321])for(const c of COURSES){const t=courseTour(c.id,seed);for(let i=0;i<9;i++){const trip=holeTransfer(c.id,seed,i,i===8?null:i+1);assert.ok(trip.route.length>=2);assert.ok(trip.meters>0&&trip.meters<600);assert.ok(trip.duration>=5800&&trip.duration<=13100);for(let j=1;j<trip.route.length;j++)assert.ok(clearCourseRoad(t,trip.route[j-1],trip.route[j]));assert.deepEqual(trip,holeTransfer(c.id,seed,i,i===8?null:i+1));}}
});
test('换洞由服务端锁定，重复请求、旧到站消息和断线恢复不丢成绩或球手身份',()=>{
 const g=new Game();g.start('orchard',9,[{id:'a',deviceId:'phone-a',style:'sage'},{id:'b',deviceId:'phone-b',style:'coast'}]);
 g.state.players.forEach(p=>{p.scores=[{hole:1,par:3,strokes:4}];p.holeDone=true;p.strokes=4;});g.selectPlayer('a');g.state.phase='hole_complete';g.transfer('next',1000);const trip=g.state.transfer,identities=g.state.players.map(p=>[p.id,p.deviceId]),scores=g.state.players.map(p=>p.scores);
 assert.equal(g.state.holeIndex,0);assert.equal(g.state.phase,'transferring');assert.throws(()=>g.transfer(),/完成/);assert.throws(()=>g.setArmed(true),/等待/);assert.throws(()=>g.setClub('putter',g.state.stateVersion),/停稳/);assert.throws(()=>g.rehearse({power:.3,dir:0,seq:1,stateVersion:g.state.stateVersion},'phone-a'),/等待/);
 g.arrive('old',true);assert.equal(g.state.phase,'transferring');g.arrive(trip.id,false,1001);assert.equal(g.state.phase,'transferring');
 const restored=new Game(structuredClone(g.state));assert.equal(restored.state.holeIndex,1);assert.equal(restored.state.phase,'playing');assert.deepEqual(restored.state.players.map(p=>p.scores),scores);
 g.arrive(trip.id,false,1000+trip.duration);assert.equal(g.state.holeIndex,1);assert.deepEqual(g.state.players.map(p=>[p.id,p.deviceId]),identities);assert.deepEqual(g.state.players.map(p=>p.scores),scores);assert.ok(g.state.players.every(p=>p.strokes===0&&!p.holeDone&&p.clubId==='auto'));assert.equal(g.state.armed,false);g.arrive(trip.id,true);assert.equal(g.state.holeIndex,1);
});
test('完整九洞计分与第九洞返会所保留全部成绩，快速局仍可提前返程',()=>{
 for(const mode of [3,9]){const g=new Game();g.start('sunny',mode);g.state.seed=421;for(let i=0;i<mode;i++){const h=g.hole;g.state.ball={x:h.pin.x,z:h.pin.z-1};g.setArmed(true);assert.equal(g.stroke({power:.04,dir:0,seq:i+1,stateVersion:g.state.stateVersion},'solo').holed,true);g.settle();if(i<mode-1){g.transfer();g.arrive(g.state.transfer.id,true);}}
  assert.equal(g.state.phase,'finished');const scores=structuredClone(g.state.scores);g.transfer('clubhouse');assert.equal(g.state.transfer.toIndex,null);g.arrive(g.state.transfer.id,true);assert.equal(g.state.phase,'finished');assert.equal(g.state.returnedToClubhouse,true);assert.ok(g.state.clubhouseVisit.startedAt+g.state.clubhouseVisit.duration<=Date.now());assert.deepEqual(g.state.scores,scores);assert.equal(scores.length,mode);const house=courseLayout('sunny').clubhouse,park=g.state.clubhouseVisit.route.at(-1);assert.ok(distance(house,park)>15);
 }
});
test('十六人乘八台球车，人物保持座位随车移动，结束恢复原场景',()=>{
 const scene={scene:new THREE.Scene(),group:new THREE.Group(),viewToolbar:{hidden:false},camera:new THREE.PerspectiveCamera(),targetPosition:new THREE.Vector3(),targetLook:new THREE.Vector3(),currentLook:new THREE.Vector3(),sun:{target:new THREE.Object3D(),position:new THREE.Vector3()},atmosphere:{update(){}},renderer:{render(){}}};scene.scene.add(scene.group);
 const transfer={...holeTransfer('orchard',421,0,1),id:'fleet',startedAt:Date.now()},players=Array.from({length:16},(_,i)=>({id:'p'+i,style:['sage','coast','sunset','plum'][i%4]})),journey=new CourseJourney(scene,{courseId:'orchard',seed:421,transfer,players});assert.equal(journey.fleet.length,8);assert.ok(journey.fleet.every(f=>f.riders.length===2));const first=journey.fleet[0].cart.root.position.clone();journey.update(transfer.startedAt+transfer.duration,.016,true);assert.ok(first.distanceTo(journey.fleet[0].cart.root.position)>10);assert.ok(journey.fleet.every(f=>f.riders.every(r=>r.root.parent===f.cart.root)));assert.equal(scene.group.visible,false);journey.dispose();assert.equal(scene.group.visible,true);assert.equal(journey.landscape.parent,null);
});
test('全场远景有界细分与批量树木，退出接驳释放几何和材质',()=>{
 const group=new CourseLandscape(courseTour('rainforest',421));let triangles=0,calls=0,disposed=0;group.traverse(o=>{if(o.isMesh){calls++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.count||1);o.geometry.addEventListener('dispose',()=>disposed++);}});assert.ok(calls<30);assert.ok(triangles<180000);group.dispose();assert.ok(disposed>0);
});
