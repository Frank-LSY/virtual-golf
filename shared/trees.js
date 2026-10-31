import {heightAt,random} from './courses.js';

// 显示模型与碰撞面共用这些顶点，避免独立估算树冠大小造成穿模。
function hull(vertices,indices){
 const planes=[];
 for(let i=0;i<indices.length;i+=3){
  const a=vertices[indices[i]],b=vertices[indices[i+1]],c=vertices[indices[i+2]],u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]);
  let n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n);if(length<1e-8)continue;
  n=n.map(x=>x/length);let d=n.reduce((sum,x,k)=>sum+x*a[k],0);
  if(d<0){n=n.map(x=>-x);d=-d;[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];}
  if(!planes.some(p=>Math.abs(p.d-d)<1e-7&&p.n.every((x,k)=>Math.abs(x-n[k])<1e-7)))planes.push({n,d});
 }
 return {positions:vertices.flat(),indices,planes};
}
function frustum(bottom,top,height,sides){
 const vertices=[],indices=[];
 for(const [y,r] of [[-height/2,bottom],[height/2,top]])for(let j=0;j<sides;j++){const a=j/sides*Math.PI*2;vertices.push([Math.sin(a)*r,y,Math.cos(a)*r]);}
 vertices.push([0,-height/2,0],[0,height/2,0]);
 for(let j=0;j<sides;j++){const k=(j+1)%sides;indices.push(j,k,sides+k,j,sides+k,sides+j,2*sides,k,j,2*sides+1,sides+j,sides+k);}
 return hull(vertices,indices);
}
// 不规则叶团先取凸包，显示三角面与连续碰撞面保持完全一致。
function convex(points){
 const sub=(a,b)=>a.map((v,k)=>v-b[k]),dot=(a,b)=>a.reduce((n,v,k)=>n+v*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const a=0,b=points.reduce((best,p,i)=>dot(sub(p,points[a]),sub(p,points[a]))>dot(sub(points[best],points[a]),sub(points[best],points[a]))?i:best,1),line=sub(points[b],points[a]);
 const c=points.reduce((best,p,i)=>dot(cross(sub(p,points[a]),line),cross(sub(p,points[a]),line))>dot(cross(sub(points[best],points[a]),line),cross(sub(points[best],points[a]),line))?i:best,1),normal=cross(line,sub(points[c],points[a]));
 const d=points.reduce((best,p,i)=>Math.abs(dot(sub(p,points[a]),normal))>Math.abs(dot(sub(points[best],points[a]),normal))?i:best,1),inside=[0,1,2].map(k=>(points[a][k]+points[b][k]+points[c][k]+points[d][k])/4);
 const face=(a,b,c)=>{let n=cross(sub(points[b],points[a]),sub(points[c],points[a]));if(dot(n,sub(inside,points[a]))>0){[b,c]=[c,b];n=n.map(v=>-v);}const len=Math.hypot(...n);return {ids:[a,b,c],n:n.map(v=>v/len),d:dot(n,points[a])/len};};
 let faces=[face(a,b,c),face(a,d,b),face(b,d,c),face(c,d,a)];
 for(let i=0;i<points.length;i++){
  const visible=faces.filter(f=>dot(f.n,points[i])-f.d>1e-8);if(!visible.length)continue;const edges=new Map();
  for(const f of visible)for(let k=0;k<3;k++){const u=f.ids[k],v=f.ids[(k+1)%3],key=u<v?u+','+v:v+','+u;if(edges.has(key))edges.delete(key);else edges.set(key,[u,v]);}
  const removed=new Set(visible);faces=faces.filter(f=>!removed.has(f));for(const [u,v] of edges.values())faces.push(face(u,v,i));
 }
 const used=[...new Set(faces.flatMap(f=>f.ids))],indices=new Map(used.map((id,i)=>[id,i]));return hull(used.map(i=>points[i]),faces.flatMap(f=>f.ids.map(i=>indices.get(i))));
}
function crown(seed){
 const rng=random(seed),phase=rng()*6,vertices=[],width=18,height=10;
 for(let i=0;i<=height;i++)for(let j=0;j<(i===0||i===height?1:width);j++){const p=i/height*Math.PI,a=j/width*Math.PI*2,r=1+.085*Math.sin(a*3+phase)*Math.sin(p)**2+.045*Math.cos(p*4+a*2+phase);const x=Math.sin(p)*Math.sin(a)*r,y=Math.cos(p)*r,z=Math.sin(p)*Math.cos(a)*r;vertices.push([x+.14*y,y*.9+.08*z,z*.88]);}
 return convex(vertices);
}
// 岩石（0.22 起参与碰撞）：与画面中 Three.js 十二面体（半径 1.6）相同的 20 个顶点，凸包即真实外形。
export const ROCK_SIZE=1.6;
function dodecahedron(radius){const t=(1+Math.sqrt(5))/2,r=1/t,raw=[[-1,-1,-1],[-1,-1,1],[-1,1,-1],[-1,1,1],[1,-1,-1],[1,-1,1],[1,1,-1],[1,1,1],[0,-r,-t],[0,-r,t],[0,r,-t],[0,r,t],[-r,-t,0],[-r,t,0],[r,-t,0],[r,t,0],[-t,0,-r],[t,0,-r],[-t,0,r],[t,0,r]];return convex(raw.map(p=>{const l=Math.hypot(...p);return p.map(v=>v/l*radius);}));}
export const TREE_MESHES={trunk:frustum(.62,.32,5,12),pine:frustum(3.5,0,8,14),crown:crown(17),crownB:crown(39),crownC:crown(71),rock:dodecahedron(ROCK_SIZE)};
// Three.js 欧拉角 XYZ 顺序的旋转矩阵（R = Rx·Ry·Rz，行主序）。
export function eulerXYZ(x,y,z){const a=Math.cos(x),b=Math.sin(x),c=Math.cos(y),d=Math.sin(y),e=Math.cos(z),f=Math.sin(z);return [c*e,-c*f,d,a*f+b*e*d,a*e-b*f*d,-b*c,b*f-a*e*d,b*e+a*f*d,a*c];}
export function rockVertices(rock){const m=TREE_MESHES.rock.positions,R=eulerXYZ(rock.rx,rock.ry,rock.rz),out=[];for(let i=0;i<m.length;i+=3){const x=m[i]*rock.sx,y=m[i+1]*rock.sy,z=m[i+2]*rock.sz;out.push({x:rock.x+R[0]*x+R[1]*y+R[2]*z,y:rock.y+R[3]*x+R[4]*y+R[5]*z,z:rock.z+R[6]*x+R[7]*y+R[8]*z});}return out;}
export function treeParts(h,tree,index=0){
 const y=heightAt(h,tree.x,tree.z),s=tree.scale,pine=h.courseId==='pine',rotation=tree.rotation||0,rng=random(h.seed+index*1877+Math.round(tree.x*51+tree.z*73)),count=pine?5:7;
 const parts=[{shape:'trunk',kind:'trunk',x:tree.x,y:y+2.5*s,z:tree.z,sx:s,sy:s,sz:s}];
 const spread=.9+rng()*.3,height=.88+rng()*.24;
 for(let j=0;j<count;j++){
  const a=rotation+j*2.39996+(rng()-.5)*.35,ring=j===0?0:(1.35+rng()*.85)*spread*s,level=j===0?6.5:j<5?5.9+rng()*.75:8+rng()*.7;
  const radius=(j===0?2.8:1.75+rng()*.7)*s,cone=s*(1-j*.14)*(1+rng()*.1);
  parts.push({shape:pine?'pine':['crown','crownB','crownC'][j%3],kind:'crown',x:tree.x+(pine?Math.sin(a)*.25*s:Math.sin(a)*ring),y:y+(pine?5+j*1.55:level*height)*s,z:tree.z+(pine?Math.cos(a)*.25*s:Math.cos(a)*ring),sx:pine?cone:radius*spread*(.85+rng()*.25),sy:pine?cone*(.92+rng()*.15):radius*(.7+rng()*.35)*height,sz:pine?cone:radius*(.8+rng()*.3),rotation:a});
 }
 return parts.map((p,partIndex)=>({rotation,...p,treeIndex:index,partIndex}));
}
// 同一棵树数组只构建一次碰撞体；预判与正式击球在同一球位反复模拟时复用。
const colliderCache=new WeakMap();
export function treeColliders(h){
 const trees=h.trees||[],rocks=h.rocks||[],cached=colliderCache.get(trees);if(cached&&cached.seed===h.seed&&cached.courseId===h.courseId&&cached.length===trees.length&&cached.rocks===rocks)return cached.list;
 const list=[...buildColliders(h),...buildRockColliders(rocks)];indexColliders(list);
 const byTree=new Map();for(const p of list)if(p.kind==='crown'){if(!byTree.has(p.treeIndex))byTree.set(p.treeIndex,[]);byTree.get(p.treeIndex).push(p);}Object.defineProperty(list,'crowns',{value:byTree,enumerable:false});
 colliderCache.set(trees,{seed:h.seed,courseId:h.courseId,length:trees.length,rocks,list});return list;
}
const CELL=8;
// XZ 网格只做候选筛选，候选按原顺序检测，结果与逐个遍历一致。
function indexColliders(list){
 const grid=new Map();list.forEach((p,i)=>{p.order=i;const q=p.box;for(let x=Math.floor(q[0]/CELL);x<=Math.floor(q[1]/CELL);x++)for(let z=Math.floor(q[4]/CELL);z<=Math.floor(q[5]/CELL);z++){const k=x*4096+z;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(p);}});
 Object.defineProperty(list,'grid',{value:grid,enumerable:false});return list;
}
function candidates(colliders,a,b,radius){
 const grid=colliders.grid;if(!grid)return colliders;
 const x0=Math.floor((Math.min(a.x,b.x)-radius)/CELL),x1=Math.floor((Math.max(a.x,b.x)+radius)/CELL),z0=Math.floor((Math.min(a.z,b.z)-radius)/CELL),z1=Math.floor((Math.max(a.z,b.z)+radius)/CELL);
 if((x1-x0+1)*(z1-z0+1)>64)return colliders;
 let out=null,multi=false;for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){const cell=grid.get(x*4096+z);if(!cell)continue;if(!out)out=cell;else{if(!multi){out=[...out];multi=true;}for(const p of cell)if(!out.includes(p))out.push(p);}}
 if(!out)return [];if(multi)out.sort((p,q)=>p.order-q.order);return out;
}
function buildColliders(h){
 return (h.trees||[]).flatMap((tree,index)=>treeParts(h,tree,index).map(p=>{
  const c=Math.cos(p.rotation),s=Math.sin(p.rotation),mesh=TREE_MESHES[p.shape],vertices=[];
  for(let i=0;i<mesh.positions.length;i+=3){const x=mesh.positions[i]*p.sx,y=mesh.positions[i+1]*p.sy,z=mesh.positions[i+2]*p.sz;vertices.push({x:p.x+c*x+s*z,y:p.y+y,z:p.z-s*x+c*z});}
  const bounds={};for(const axis of ['x','y','z']){bounds['min'+axis]=Math.min(...vertices.map(v=>v[axis]));bounds['max'+axis]=Math.max(...vertices.map(v=>v[axis]));}
  const planes=mesh.planes.map(plane=>{const [x,y,z]=plane.n,n={x:c*x/p.sx+s*z/p.sz,y:y/p.sy,z:-s*x/p.sx+c*z/p.sz},length=Math.hypot(n.x,n.y,n.z);return {n:{x:n.x/length,y:n.y/length,z:n.z/length},d:plane.d/length};});
  return {...p,bounds,planes,box:[bounds.minx,bounds.maxx,bounds.miny,bounds.maxy,bounds.minz,bounds.maxz]};
 }));
}
function buildRockColliders(rocks){
 const mesh=TREE_MESHES.rock;
 return rocks.map((rock,index)=>{
  const vertices=rockVertices(rock),R=eulerXYZ(rock.rx,rock.ry,rock.rz),bounds={};for(const axis of ['x','y','z']){bounds['min'+axis]=Math.min(...vertices.map(v=>v[axis]));bounds['max'+axis]=Math.max(...vertices.map(v=>v[axis]));}
  // 局部平面 n·x=d 经过 缩放 S 与旋转 R 后：法线 R·S⁻¹·n，再归一化。
  const planes=mesh.planes.map(({n,d})=>{const u=[n[0]/rock.sx,n[1]/rock.sy,n[2]/rock.sz],w={x:R[0]*u[0]+R[1]*u[1]+R[2]*u[2],y:R[3]*u[0]+R[4]*u[1]+R[5]*u[2],z:R[6]*u[0]+R[7]*u[1]+R[8]*u[2]},l=Math.hypot(w.x,w.y,w.z);return {n:{x:w.x/l,y:w.y/l,z:w.z/l},d:d/l};});
  return {shape:'rock',kind:'rock',rockIndex:index,treeIndex:-1-index,partIndex:0,x:rock.x,y:rock.y,z:rock.z,bounds,planes,box:[bounds.minx,bounds.maxx,bounds.miny,bounds.maxy,bounds.minz,bounds.maxz]};
 });
}
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
// 球心是否仍在某棵树的任一叶团内（含球半径）；用于判断球何时穿出树冠。
export function insideCrown(colliders,treeIndex,p,radius=0){
 for(const part of colliders.crowns?.get(treeIndex)||[]){const q=part.box;if(p.x<q[0]-radius||p.x>q[1]+radius||p.y<q[2]-radius||p.y>q[3]+radius||p.z<q[4]-radius||p.z>q[5]+radius)continue;const o={x:p.x-part.x,y:p.y-part.y,z:p.z-part.z};if(part.planes.every(({n,d})=>dot(n,o)-d-radius<=0))return true;}
 return false;
}
// ignoreCrowns：球正在穿过的树冠（按树编号），这些叶团不再当作硬表面。
export function sweepTrees(colliders,a,b,radius,ignoreCrowns=null){
 let best=null;
 for(const p of candidates(colliders,a,b,radius)){
  if(ignoreCrowns&&p.kind==='crown'&&ignoreCrowns.has(p.treeIndex))continue;
  const q=p.box;if((a.x>b.x?a.x:b.x)+radius<q[0]||(a.x<b.x?a.x:b.x)-radius>q[1]||(a.z>b.z?a.z:b.z)+radius<q[4]||(a.z<b.z?a.z:b.z)-radius>q[5]||(a.y>b.y?a.y:b.y)+radius<q[2]||(a.y<b.y?a.y:b.y)-radius>q[3])continue;
  const origin={x:a.x-p.x,y:a.y-p.y,z:a.z-p.z},delta={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z};
  let near=0,far=1,normal=null,inside=true,closest=-Infinity,exitNormal=null,rejected=false;
  for(const {n,d} of p.planes){
   const gap=dot(n,origin)-d-radius,velocity=dot(n,delta);if(gap>0)inside=false;if(gap>closest){closest=gap;exitNormal=n;}
   if(Math.abs(velocity)<1e-10){if(gap>0){rejected=true;break;}continue;}
   const u=-gap/velocity;
   if(velocity<0){if(u>=near){near=u;normal=n;}}else far=Math.min(far,u);
   if(near>far){rejected=true;break;}
  }
  if(rejected||far<0||near>1)continue;
  if(inside){normal=exitNormal;near=0;if(dot(normal,delta)>=0)continue;}
  if(!normal||dot(normal,delta)>=-1e-9)continue;
  if(!best||near<best.fraction)best={fraction:near,normal,kind:p.kind,treeIndex:p.treeIndex,partIndex:p.partIndex,penetration:inside?Math.max(0,-closest):0,position:{x:a.x+delta.x*near,y:a.y+delta.y*near,z:a.z+delta.z*near}};
 }
 return best;
}
// 树干与岩石是硬表面：按接触法线反弹。岩石更硬、更弹。
export const BOUNCE={trunk:{restitution:.48,tangent:.78},rock:{restitution:.42,tangent:.74},crown:{restitution:.18,tangent:.52}};
export function treeBounce(velocity,normal,kind){
 const incoming=dot(velocity,normal),{restitution,tangent}=BOUNCE[kind]||BOUNCE.trunk;
 if(incoming>=0)return {...velocity};
 return Object.fromEntries(['x','y','z'].map(k=>[k,(velocity[k]-incoming*normal[k])*tangent-incoming*normal[k]*restitution]));
}
// 树冠是软的（0.22）：球不再从叶团表面“弹墙”或停在树顶，而是钻进枝叶——
// 入射瞬间损失约一半速度并略向外、向下偏转，之后在树冠内受强阻力，最终从下方或侧面掉出来。
export const LEAF_ENTRY=.5;
export const LEAF_DRAG=2.6;
export function leafEntry(velocity,normal){
 const speed=Math.hypot(velocity.x,velocity.y,velocity.z),k=LEAF_ENTRY;
 return {x:velocity.x*k+normal.x*speed*.08,y:Math.min(velocity.y*k,velocity.y*.3)-speed*.06,z:velocity.z*k+normal.z*speed*.08};
}
