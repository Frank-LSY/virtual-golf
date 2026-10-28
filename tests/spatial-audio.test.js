import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import * as THREE from 'three';
import {SpatialGolfAudio,spatialParameters,strikeLayers,impactLayers} from '../screen-web/spatial-audio.js';
import {GolfScene} from '../screen-web/scene.js';
import {ENVIRONMENT_ASSETS,environmentTexture} from '../screen-web/environment-textures.js';
import {simulateShot} from '../game-service/physics.js';
import {makeRange} from '../shared/training.js';
import {CLUBS} from '../shared/clubs.js';
import {ImpactEffects} from '../screen-web/impact-effects.js';
import {treeParts,TREE_MESHES} from '../shared/trees.js';
import {golfBall,golfBallTexture} from '../screen-web/visuals.js';
import {athleticsRange} from '../screen-web/athletics-range.js';

test('木杆、铁杆、推杆的触球频段和衰减不同，松沙及长草削弱硬接触并增加摩擦声',()=>{
 const driver=strikeLayers('driver','tee',.7),iron=strikeLayers('iron','fairway',.7),putter=strikeLayers('putter','green',.7);
 assert.ok(driver[0].frequency<putter[0].frequency&&putter[0].frequency<iron[0].frequency);assert.ok(driver[0].duration>iron[0].duration&&iron[0].duration>putter[0].duration);
 const sand=strikeLayers('iron','sand',.7),rough=strikeLayers('iron','rough',.7);assert.ok(sand[0].gain<rough[0].gain&&rough[0].gain<iron[0].gain);assert.ok(sand[3].gain>rough[3].gain&&rough[3].gain>iron[3].gain);assert.ok(strikeLayers('driver','tee',.1)[0].gain<driver[0].gain);
 assert.ok(impactLayers({type:'tree',kind:'trunk',speed:20})[0].frequency<impactLayers({type:'cup',phase:'entry',speed:1})[0].frequency);
});
const frame=source=>({source,listener:{x:0,y:0,z:0},forward:{x:0,y:0,z:-1},right:{x:1,y:0,z:0}});
test('距离衰减、左右声道、后方高频衰减有界，正上方及零距离不会产生无效数值',()=>{
 const left=spatialParameters(frame({x:-10,y:0,z:-10})),right=spatialParameters(frame({x:10,y:0,z:-10})),near=spatialParameters(frame({x:0,y:0,z:-6})),far=spatialParameters(frame({x:0,y:0,z:-150})),back=spatialParameters(frame({x:0,y:0,z:150}));
 assert.ok(left.pan<0&&right.pan>0);assert.equal(left.gain,right.gain);assert.ok(near.gain>far.gain&&far.gain>back.gain);assert.ok(near.cutoff>far.cutoff&&far.cutoff>back.cutoff);
 for(const p of [{x:0,y:0,z:0},{x:0,y:20,z:0},{x:1e6,y:1e6,z:1e6}]){const s=spatialParameters(frame(p));assert.ok(Object.values(s).every(Number.isFinite));assert.ok(s.gain>=.025&&s.gain<=1);assert.ok(Math.abs(s.pan)<=.93);}
});
test('第三人称镜像场景使用真实世界坐标，镜头旋转一百八十度后声道反向',()=>{
 const fake={group:new THREE.Group(),camera:new THREE.PerspectiveCamera()};fake.group.scale.x=-1;fake.camera.position.set(0,0,0);fake.camera.lookAt(0,0,-1);
 const source={x:10,y:0,z:-10},a=GolfScene.prototype.audioFrame.call(fake,source);assert.equal(a.source.x,-10);assert.ok(spatialParameters(a).pan<0);
 fake.camera.lookAt(0,0,1);const b=GolfScene.prototype.audioFrame.call(fake,source);assert.ok(spatialParameters(b).pan>0);fake.group.position.x=20;assert.equal(GolfScene.prototype.audioFrame.call(fake,source).source.x,10);
});
function context(){
 const param=()=>({value:0,setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;},exponentialRampToValueAtTime(v){this.value=v;},setTargetAtTime(v){this.value=v;}});
 const c={currentTime:0,sampleRate:1000,destination:{},nodes:[],buffers:0,resume(){},createBuffer(_,length){this.buffers++;return {getChannelData:()=>new Float32Array(length)};}};
 const node=()=>{const n={gain:param(),frequency:param(),Q:param(),pan:param(),connect(){},disconnect(){this.disconnected=true;},start(){},stop(){this.stopped=true;}};c.nodes.push(n);return n;};c.createGain=node;c.createBiquadFilter=node;c.createStereoPanner=node;c.createBufferSource=node;c.createOscillator=node;return c;
}
test('音效复用噪声缓冲，镜头运动会更新声道，连续碰撞限制并发并彻底释放节点',()=>{
 const c=context();let facing=1;const sound=new SpatialGolfAudio(()=>c,p=>({...frame(p),right:{x:facing,y:0,z:0}}),{maxVoices:3});
 const hit={type:'tree',kind:'trunk',speed:10,position:{x:4,y:0,z:-3}};sound.impact(hit);const first=[...sound.voices][0];assert.ok(first.pan.pan.value>0);facing=-1;sound.update();assert.ok(first.pan.pan.value<0);
 for(let i=0;i<20;i++)sound.impact(hit);assert.equal(sound.voices.size,3);assert.equal(c.buffers,1);assert.ok(first.pan.disconnected);sound.clear();assert.equal(sound.voices.size,0);assert.ok(c.nodes.every(n=>n.disconnected));sound.update();sound.clear();
 sound.impact({...hit,type:'sand',phase:'launch'});assert.equal(sound.voices.size,0);
 sound.impact(hit);const voice=[...sound.voices][0];for(const s of voice.sources)s.onended?.();assert.equal(sound.voices.size,0);
});
test('球道落地只在实际触地时发声，静止推杆不伪造落地音，事件不生成无关树叶',()=>{
 const h=makeRange({clubId:'iron',target:150}),shot=simulateShot(h,h.tee,.4,0,0,{club:CLUBS.find(c=>c.id==='iron')}),events=shot.impacts.filter(e=>e.type==='ground');assert.ok(events.length>=1&&events.length<=3);assert.ok(events.every(e=>e.t>0&&e.verticalSpeed>.6&&e.surface==='fairway'));
 const putt=simulateShot(h,h.tee,.2,0,0,{club:CLUBS.find(c=>c.id==='putter')});assert.equal(putt.impacts.filter(e=>e.type==='ground').length,0);
 let count=0;const effects=new ImpactEffects(()=>count++);effects.reset({impacts:events});effects.sample(100,0);effects.sample(100,1);assert.equal(count,events.length);assert.equal(effects.children.length,0);
});
test('场景贴图共用缓存，压缩素材总量低于七百 KB，文件是真正的 WebP',async()=>{
 assert.equal(environmentTexture('atlas'),environmentTexture('atlas'));assert.ok(environmentTexture('atlas').userData.sharedEnvironmentTexture);
 let size=0;for(const name of Object.values(ENVIRONMENT_ASSETS)){const path=new URL('../screen-web/assets/environment/'+name,import.meta.url),data=await readFile(path);size+=(await stat(path)).size;assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WEBP');}assert.ok(size<700*1024);
});
test('同一棵树的随机树冠可重现，树间轮廓不同，叶团由多面凸体组成且面数受限',()=>{
 const h={...makeRange(),seed:421,courseId:'sunny'},tree={x:20,z:30,scale:1.1,rotation:.3},a=treeParts(h,tree,0),b=treeParts(h,tree,1);assert.deepEqual(a,treeParts(h,tree,0));assert.notDeepEqual(a,b);assert.equal(a.length,8);assert.ok(new Set(a.slice(1).map(p=>p.shape)).size>=3);assert.ok(new Set(a.slice(1).map(p=>p.sy.toFixed(2))).size>=5);
 const faces=a.reduce((n,p)=>n+TREE_MESHES[p.shape].indices.length/3,0);assert.ok(faces>1000&&faces<2400);assert.equal(treeParts({...h,courseId:'pine'},tree).length,6);
});
test('田径练习区无树木障碍，跑道与看台使用有界数量的批量网格',()=>{
 const h=makeRange();assert.equal(h.name,'田径训练场');assert.equal(h.trees.length,0);assert.equal(h.hazards.length,0);const stadium=athleticsRange();assert.ok(stadium.children.length<=9);assert.ok(stadium.children.filter(o=>o.isInstancedMesh).length>=3);assert.ok(stadium.children.some(o=>o.geometry?.attributes.color));
});
test('高尔夫球换洞复用凹点几何和表面纹理，瞄准标线与底色保持可辨认',()=>{
 const a=golfBall(),b=golfBall(),texture=golfBallTexture();assert.equal(a.geometry,b.geometry);assert.equal(a.material.map,b.material.map);assert.ok(a.geometry.userData.sharedBallGeometry);const radius=[];for(let i=0;i<a.geometry.attributes.position.count;i++){const p=a.geometry.attributes.position;radius.push(Math.hypot(p.getX(i),p.getY(i),p.getZ(i)));}assert.ok(Math.min(...radius)<Math.max(...radius)*.99);const data=texture.image.data;assert.ok(data.some((v,i)=>i%4===0&&v<80));assert.ok(data.some((v,i)=>i%4===0&&v>240));assert.equal(data.length,512*256*4);
});
