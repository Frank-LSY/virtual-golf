import test from 'node:test';
import assert from 'node:assert/strict';
import {COURSES,makeHole,heightAt} from '../shared/courses.js';
import {COURSE_STYLES,courseStyle} from '../shared/course-styles.js';
import {TREE_MESHES,treeParts,treeColliders,sweepTrees,treeSpecies,SPECIES_SIZE} from '../shared/trees.js';
import {BALL_RADIUS} from '../shared/ball.js';
import {courseArt} from '../screen-web/course-atlas.js';

// 0.27 六座球场各自的风格：配色、地面纹样、树种（画面与碰撞一致）、远景、缩略图。
test('六座球场的风格各不相同：修剪纹、长草、树种、远景、天空与主色', ()=>{
 const ids=COURSES.map(c=>c.id);assert.deepEqual(ids,['orchard','sunny','pine','desert','coast','rainforest']);
 for(const key of ['mow','rough','species','backdrop'])assert.equal(new Set(ids.map(id=>COURSE_STYLES[id][key])).size,6,`${key} 六种`);
 assert.equal(new Set(ids.map(id=>COURSE_STYLES[id].sky.join())).size,6,'天空渐变各不相同');
 for(const key of ['grass','fairway','ground','trees','water'])assert.equal(new Set(COURSES.map(c=>c[key])).size,6,`${key} 各不相同`);
 for(const id of ids){const s=courseStyle(id);assert.equal(s.sky.length,3);assert.ok(s.fog[1]<s.fog[2]);assert.ok(s.leaves.length>=4);assert.ok(s.tuftDensity>0&&s.tuftHeight>0);assert.ok(/^#[0-9a-f]{6}$/.test(s.sand));}
 assert.equal(courseStyle('nope'),COURSE_STYLES.sunny);
 const hue=hex=>{const n=parseInt(hex.slice(1),16),r=(n>>16)/255,g=(n>>8&255)/255,b=(n&255)/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b);if(mx===mn)return 0;const d=mx-mn;return (mx===r?((g-b)/d+6)%6:mx===g?(b-r)/d+2:(r-g)/d+4)*60;};
 assert.ok(hue(COURSES.find(c=>c.id==='desert').ground)<45,'沙漠外场是橙红沙地');assert.ok(hue(COURSES.find(c=>c.id==='coast').water)>180,'海岸是蓝色的海');
});

test('树种：苹果树矮、棕榈细高、海风树偏向下风、雨林树高大；公园与松林保持原样；碰撞体就是画面上的部件', ()=>{
 const expect={orchard:['apple',6],sunny:['round',8],pine:['pine',6],desert:['palm',2],coast:['windswept',5],rainforest:['canopy',6]};
 for(const [id,[species,count]] of Object.entries(expect)){
  assert.equal(treeSpecies(id),species);const h=makeHole(id,2,421);assert.ok(h.trees.length>0,id);
  const parts=treeParts(h,h.trees[0],0),colliders=treeColliders(h);assert.equal(parts.length,count,`${id} 部件数`);assert.equal(colliders.filter(p=>p.treeIndex===0).length,count);
  assert.deepEqual(treeParts(h,h.trees[0],0),parts,'同一棵树每次都一样');for(const p of parts)assert.ok(TREE_MESHES[p.shape],p.shape);
  const tops=colliders.filter(p=>p.kind!=='rock').map(p=>(p.bounds.maxy-heightAt(h,h.trees[p.treeIndex].x,h.trees[p.treeIndex].z))/h.trees[p.treeIndex].scale);
  assert.ok(Math.max(...tops)<SPECIES_SIZE[species].top*1.35,`${id} 高度与镜头淡化范围一致`);
 }
 const top=id=>{const h=makeHole(id,2,421),t=h.trees[0],ps=treeParts(h,t,0);return Math.max(...ps.map(p=>p.y+p.sy))-heightAt(h,t.x,t.z);};
 assert.ok(top('orchard')/makeHole('orchard',2,421).trees[0].scale<7&&top('rainforest')/makeHole('rainforest',2,421).trees[0].scale>10,'苹果树矮、雨林树高');
 // 海风树：所有树冠的重心都落在树干的同一侧（全场同一下风方向）。
 const h=makeHole('coast',3,421),lean=h.trees.slice(0,8).map((t,i)=>{const cs=treeParts(h,t,i).filter(p=>p.kind==='crown');return {x:cs.reduce((s,p)=>s+p.x,0)/cs.length-t.x,z:cs.reduce((s,p)=>s+p.z,0)/cs.length-t.z};});
 const mean={x:lean.reduce((s,v)=>s+v.x,0)/lean.length,z:lean.reduce((s,v)=>s+v.z,0)/lean.length};assert.ok(lean.every(v=>v.x*mean.x+v.z*mean.z>0),'都偏向下风');
});

test('棕榈：球从叶冠高度飞过会被叶冠拦下，从叶冠下方的空隙穿过只会碰到树干', ()=>{
 const h={...makeHole('desert',0,421),practice:true,putting:false,wind:{x:0,z:0},rocks:[],trees:[{x:0,z:4,scale:1,rotation:.3}]},colliders=treeColliders(h),y0=heightAt(h,0,4);
 const crown=sweepTrees(colliders,{x:2.2,y:y0+9.4,z:-20},{x:2.2,y:y0+9.4,z:30},BALL_RADIUS);assert.equal(crown?.kind,'crown');
 assert.equal(sweepTrees(colliders,{x:2.2,y:y0+5,z:-20},{x:2.2,y:y0+5,z:30},BALL_RADIUS),null,'叶冠下方是空的');
 assert.equal(sweepTrees(colliders,{x:0,y:y0+5,z:-20},{x:0,y:y0+5,z:30},BALL_RADIUS)?.kind,'trunk');
});

test('苹果园的树按行列种植：行距 9 米、株距 7 米，仍然只在长草区、离球道有余量', ()=>{
 for(let i=0;i<9;i++){const h=makeHole('orchard',i,421);assert.ok(h.trees.length>=30,`第 ${i+1} 洞 ${h.trees.length} 棵`);
  for(const t of h.trees){assert.ok(Math.abs(t.z/7-Math.round(t.z/7))<1e-9,'株距 7 米');const r=Math.round(t.z/7)%2?.6:-.6;assert.ok(Math.abs((t.x-r)/9-Math.round((t.x-r)/9))<1e-9,'行距 9 米');assert.ok(t.scale>=.95&&t.scale<=1.25,'果树大小整齐');}
  const keys=new Set(h.trees.map(t=>`${t.x},${t.z}`));assert.equal(keys.size,h.trees.length,'不重复');}
});

test('球场卡片缩略图：每座球场一幅不同的插画，带各自的标志物', ()=>{
 const arts=COURSES.map(c=>courseArt(c));assert.equal(new Set(arts).size,6);
 const marks={orchard:'#c0392b',sunny:'#ffc93a',pine:'#7d97ad',desert:'#c56b3d',coast:'#d8423a',rainforest:'#ff4f8b'};
 COURSES.forEach((c,i)=>{assert.match(arts[i],new RegExp(`class="course-art course-art-${c.id}"`));assert.ok(arts[i].includes(marks[c.id]),`${c.id} 标志色`);assert.ok(arts[i].includes(c.fairway)&&arts[i].includes(c.green),'球道与果岭用球场配色');assert.match(arts[i],/viewBox="0 0 96 96"/);});
 assert.equal(new Set(arts.map(a=>a.match(/id="([^"]+)"/)[1])).size,6,'渐变编号不冲突');
});
