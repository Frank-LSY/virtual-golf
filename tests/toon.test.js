import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {installToonLighting,outlineCandidate,addOutlines,hookToonRenderer,outlineUniforms,outlineMaterial,cartoonColor,TOON} from '../screen-web/toon-look.js';
import {SkyrollSfx} from '../screen-web/skyroll-sfx.js';

test('卡通光照：直射光分三阶、标准材质提高饱和度，只装一次，卡通材质不受影响',()=>{
 assert.ok(THREE.ShaderChunk.lights_physical_pars_fragment.includes('toonRamp( dotNL )'),'导入时已改写标准材质的直射光');
 assert.ok(THREE.ShaderChunk.color_fragment.includes('#if defined( STANDARD )'));
 assert.equal(installToonLighting(),false,'重复调用不会叠加');
 assert.ok(!THREE.ShaderChunk.meshtoon_frag?.includes('toonRamp'),'云端滚球的卡通材质保持原样');
 assert.deepEqual(TOON.ramp.slice().sort((a,b)=>a-b),TOON.ramp);assert.equal(TOON.ramp.at(-1),1);
});
test('描边：实心物体加描边；透明、双面、平面、基础材质和标记为不描边的物体跳过',()=>{
 const solid=()=>new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial());
 assert.equal(outlineCandidate(solid()),true);
 assert.equal(outlineCandidate(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({transparent:true}))),false);
 assert.equal(outlineCandidate(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({side:THREE.DoubleSide}))),false);
 assert.equal(outlineCandidate(new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshStandardMaterial())),false);
 assert.equal(outlineCandidate(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial())),false);
 const terrain=solid();terrain.userData.noOutline=true;assert.equal(outlineCandidate(terrain),false);
 const parent=new THREE.Group();parent.userData.noOutline=true;const child=solid();parent.add(child);assert.equal(outlineCandidate(child),false);
});
test('描边：每个物体只加一次；实例化物体共享实例矩阵；之后加入的新物体也会补上；可淡化的树描边随树一起隐藏',()=>{
 const root=new THREE.Group(),box=new THREE.Mesh(new THREE.SphereGeometry(1),new THREE.MeshStandardMaterial()),trees=new THREE.InstancedMesh(new THREE.ConeGeometry(1,2),new THREE.MeshStandardMaterial(),5);trees.count=3;root.add(box,trees);
 assert.equal(addOutlines(root),2);const outline=box.children.find(c=>c.userData.outline),treeOutline=trees.children.find(c=>c.userData.outline);
 assert.ok(outline&&treeOutline);assert.equal(outline.material.side,THREE.BackSide);assert.equal(outline.castShadow,false);assert.equal(treeOutline.instanceMatrix,trees.instanceMatrix);trees.count=5;treeOutline.onBeforeRender();assert.equal(treeOutline.count,5);
 assert.equal(addOutlines(root),0,'重复扫描不会再加');
 const late=new THREE.Mesh(new THREE.CylinderGeometry(),new THREE.MeshStandardMaterial());box.add(late);assert.equal(addOutlines(root),1);
 const fading=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1),new THREE.MeshStandardMaterial(),2);fading.geometry.setAttribute('instanceFade',new THREE.InstancedBufferAttribute(new Float32Array([1,.5]),1));
 const m=outlineMaterial(fading),shader={uniforms:{},vertexShader:'#include <project_vertex>',fragmentShader:'#include <clipping_planes_fragment>'};m.onBeforeCompile(shader);
 assert.match(m.customProgramCacheKey(),/fade/);assert.match(shader.vertexShader,/instanceFade/);assert.match(shader.fragmentShader,/discard/);assert.equal(shader.uniforms.outlineResolution,outlineUniforms.outlineResolution);
});
test('渲染钩子：每帧更新描边的屏幕尺寸，按时间间隔扫描新物体，再交给原渲染函数',()=>{
 let t=0,rendered=0;const scene=new THREE.Scene(),renderer={domElement:{clientWidth:800,clientHeight:450},render(){rendered++;}};
 hookToonRenderer(renderer,scene,{every:350,now:()=>t});scene.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()));
 renderer.render(scene,{});assert.equal(rendered,1);assert.deepEqual(outlineUniforms.outlineResolution.value.toArray(),[800,450]);assert.equal(scene.children[0].children.length,1);
 scene.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()));t=100;renderer.render(scene,{});assert.equal(scene.children[1].children.length,0,'间隔未到不扫描');t=400;renderer.render(scene,{});assert.equal(scene.children[1].children.length,1);
 const c=cartoonColor('#b1db71'),h={},o={};c.getHSL(h);new THREE.Color('#b1db71').getHSL(o);assert.ok(h.s>=o.s);
});
test('滚球声：静止无声；越快越响、音高越高、金属振铃越密越亮；转动节奏 = 速度 ÷ 球周长；冰面更亮、云絮几乎没有金属声；整体压在音乐之下',()=>{
 assert.equal(SkyrollSfx.rollParams(.1).level,0);
 const a=SkyrollSfx.rollParams(2),b=SkyrollSfx.rollParams(6);
 assert.ok(b.rumbleHz>a.rumbleHz&&b.rumbleGain>a.rumbleGain&&b.gritRate>a.gritRate&&b.metalGain>a.metalGain&&b.ringHz>a.ringHz);
 assert.ok(Math.abs(b.spinHz-6/(2*Math.PI*.48))<1e-9);assert.equal(b.level,SkyrollSfx.ROLL_MIX);assert.ok(SkyrollSfx.ROLL_MIX<=.4,'滚动声总音量明显低于其他音效');
 const ratios=SkyrollSfx.METAL_MODES.map(m=>m[0]);assert.ok(ratios.every((r,i)=>i===0||r>ratios[i-1]));assert.ok(ratios.slice(1).some(r=>Math.abs(r-Math.round(r))>.2),'非谐波共振（金属感）');
 const ice=SkyrollSfx.rollParams(5,'ice'),fluff=SkyrollSfx.rollParams(5,'fluff'),normal=SkyrollSfx.rollParams(5);
 assert.ok(ice.ringHz>normal.ringHz&&ice.rumbleHz>normal.rumbleHz&&ice.rumbleGain<normal.rumbleGain);
 assert.ok(fluff.ringHz<normal.ringHz&&fluff.metalGain<normal.metalGain*.2&&fluff.rumbleHz<normal.rumbleHz);
});
