import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {COURSES,makeHole,heightAt,surfaceAt,landValue,distance} from '../shared/courses.js';
import {courseTour} from '../shared/course-tour.js';
import {courseLayout} from '../shared/course-layout.js';
import {localToCourse,courseToLocal} from '../shared/course-layout.js';
import {courseDecor} from '../screen-web/course-decor.js';
import {CourseLandscape} from '../screen-web/course-landscape.js';
import {rockVertices} from '../shared/trees.js';

// 0.27.1 全部 54 个球洞的“贴图重叠”检查：点缀不压到球道 / 果岭 / 沙坑 / 水，远景不伸进球场，
// 海岸的沙滩和海只铺在球场边界之外，且比边界外所有球洞地面都低（0.27.0 曾整片垫在陆地下，球洞洼地被沙滩盖住）。
const ids=COURSES.map(c=>c.id);
// 每个实例用真实顶点变换后的包围盒（旋转过的包围盒再取轴对齐会偏大）。
const instanceBoxes=mesh=>{const out=[],m=new THREE.Matrix4(),pos=mesh.geometry.attributes.position,v=new THREE.Vector3();for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,m);const box=new THREE.Box3();for(let j=0;j<pos.count;j++)box.expandByPoint(v.fromBufferAttribute(pos,j).applyMatrix4(m));out.push(box);}return out;};
const boxesOf=o=>o.isInstancedMesh?instanceBoxes(o):[new THREE.Box3().setFromObject(o)];
const overlapsRect=(box,b,pad=0)=>box.max.x>b.minX-pad&&box.min.x<b.maxX+pad&&box.max.z>b.minZ-pad&&box.min.z<b.maxZ+pad;

test('点缀：54 个球洞里每件点缀的整个占地都在长草上，不碰球道、果岭、沙坑、水和发球台', ()=>{
 let total=0;
 for(const id of ids)for(let i=0;i<9;i++){
  const h=makeHole(id,i,421),g=courseDecor(h);if(!g)continue;
  for(const mesh of g.children){for(const sp of mesh.userData.spots||[]){total++;const foot=sp.foot??.6;
   for(let k=0;k<=8;k++){const a=k/8*Math.PI*2,r=k===8?0:foot,x=sp.x+Math.cos(a)*r,z=sp.z+Math.sin(a)*r;assert.equal(surfaceAt(h,x,z),'rough',`${id} 第 ${i+1} 洞点缀 (${sp.x.toFixed(1)},${sp.z.toFixed(1)}) 占地压到 ${surfaceAt(h,x,z)}`);}
   assert.ok(distance(sp,h.pin)>h.greenRadius+foot+6,`${id} 第 ${i+1} 洞点缀离果岭太近`);assert.ok(Math.hypot(sp.x,sp.z)>8,'离发球台有余量');}}
 }
 assert.ok(total>2000,`共检查 ${total} 件点缀`);
});

test('岩石：54 个球洞里每块岩石露出地面的部分都在长草上，不压进沙坑、水、球道和果岭', ()=>{
 let total=0;
 for(const id of ids)for(let i=0;i<9;i++){const h=makeHole(id,i,421);for(const r of h.rocks){total++;for(const v of rockVertices(r))if(v.y>heightAt(h,v.x,v.z)-.05)assert.equal(surfaceAt(h,v.x,v.z),'rough',`${id} 第 ${i+1} 洞岩石 (${r.x.toFixed(1)},${r.z.toFixed(1)}) 压到 ${surfaceAt(h,v.x,v.z)}`);}}
 assert.ok(total>900,`共检查 ${total} 块岩石`);
});

test('远景：雪山、台地、沙丘、火山、天际线、谷仓、灯塔、小屋、风车、帆船都整个在球场边界之外', ()=>{
 for(const id of ids){
  const tour=courseTour(id),b=tour.bounds,land=new CourseLandscape(tour,{activeIndex:0});land.updateMatrixWorld(true);let far=0;
  for(const child of land.children){const tag=child.userData.backdrop;if(!tag)continue;
   if(tag==='inside'){for(const box of boxesOf(child))for(const [x,z] of [[box.min.x,box.min.z],[box.min.x,box.max.z],[box.max.x,box.min.z],[box.max.x,box.max.z],[(box.min.x+box.max.x)/2,(box.min.z+box.max.z)/2]])for(const h of tour.holes){const q=courseToLocal(h.placement,{x,z});if(Math.abs(q.x)<=110&&q.z>-60&&q.z<h.length+65)assert.ok(landValue(h,q.x,q.z)>=1,`${id} 会所旁的装饰压到第 ${h.index+1} 洞`);}continue;}
   for(const box of boxesOf(child)){far++;assert.ok(!overlapsRect(box,b),`${id} 远景物体伸进球场：${JSON.stringify({min:[box.min.x|0,box.min.z|0],max:[box.max.x|0,box.max.z|0]})}`);}}
  assert.ok(far>8,`${id} 远景 ${far} 件`);land.dispose?.();
 }
});

test('海岸：沙滩与海是边界外的“回”字形四条，比边界外所有球洞地面都低；球场里面没有任何水平铺满的平面', ()=>{
 const tour=courseTour('coast'),b=tour.bounds,land=new CourseLandscape(tour,{activeIndex:1});land.updateMatrixWorld(true);
 const frames=land.children.filter(o=>o.userData.backdrop==='frame');assert.equal(frames.length,8,'沙滩 4 条 + 海 4 条');
 for(const f of frames){const box=new THREE.Box3().setFromObject(f);assert.ok(!overlapsRect(box,b),'不铺进球场');}
 const top=Math.max(...frames.map(f=>f.position.y));let lowest=Infinity;
 for(const h of tour.holes)for(let x=-110;x<=110;x+=2)for(let z=-65;z<=h.length+65;z+=2){const q=localToCourse(h.placement,{x,z});if(q.x<b.minX||q.x>b.maxX||q.z<b.minZ||q.z>b.maxZ)lowest=Math.min(lowest,heightAt(h,x,z));}
 assert.ok(top<lowest-.1,`沙滩 ${top} 米低于边界外最低的球洞地面 ${lowest.toFixed(2)} 米`);
 // 大块平面（宽或长超过 300 米）只允许出现在远处的基础地面（-8 米）和边界外的四条上。
 for(const o of land.children)if(o.isMesh&&!o.isInstancedMesh&&o.geometry.type==='PlaneGeometry'&&!o.userData.backdrop&&!o.material.vertexColors){const p=o.geometry.parameters;if(Math.max(p.width,p.height)>300)assert.ok(o.position.y<=-7.9,'球场下面不再垫平面');}
});

// 任意一点落在哪一洞的“正式场地”（球道 / 果岭 / 沙坑 / 水 / 发球台）上；相邻球洞的范围会交叠，所以每洞都查。
const playAt=(tour,x,z)=>{for(const h of tour.holes){const q=courseToLocal(h.placement,{x,z});if(Math.abs(q.x)>110||q.z<-60||q.z>h.length+65)continue;const s=surfaceAt(h,q.x,q.z);if(!['rough','out'].includes(s))return `第 ${h.index+1} 洞${s}`;}return '';};

test('远处的树：别的球洞的树和林地填充树都不长在任何一洞的球道、果岭、沙坑、水和发球台上', ()=>{
 for(const id of ids)for(const activeIndex of [null,0,4,8]){
  const tour=courseTour(id),land=new CourseLandscape(tour,{activeIndex}),f=land.foliage,m=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),sc=new THREE.Vector3();assert.ok(f.count>20);
  for(let i=0;i<f.count;i++){f.getMatrixAt(i,m);m.decompose(p,q,sc);for(let k=0;k<=8;k++){const a=k/8*Math.PI*2,r=k===8?0:2.5*sc.x,hit=playAt(tour,p.x+Math.cos(a)*r,p.z+Math.sin(a)*r);assert.equal(hit,'',`${id} 远处的树 (${p.x|0},${p.z|0}) 落在${hit}`);}}
  land.dispose?.();
 }
});

test('会所：六座球场的会所整座房子（含屋顶）都在长草或场外，不压任何一洞的球道和果岭', ()=>{
 for(const id of ids){const tour=courseTour(id),c=courseLayout(id).clubhouse;for(let r=0;r<=12;r+=2)for(let k=0;k<16;k++){const a=k/16*Math.PI*2,hit=playAt(tour,c.x+Math.cos(a)*r,c.z+Math.sin(a)*r);assert.equal(hit,'',`${id} 会所压到${hit}`);}}
});
