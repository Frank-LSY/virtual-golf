import {makeHole,COURSES,distance,heightAt,landValue,ellipseValue,routeDistance,clamp} from './courses.js';
import {courseLayout,localToCourse,courseToLocal} from './course-layout.js';

const cache=new Map();
export function courseTour(courseId,seed=421){
 const key=`${courseId}:${seed}`;if(cache.has(key))return cache.get(key);
 const layout=courseLayout(courseId),holes=Array.from({length:9},(_,i)=>makeHole(courseId,i,seed));
 const tour={...layout,holes,course:COURSES.find(c=>c.id===courseId),routes:new Map()};
 cache.set(key,tour);if(cache.size>8)cache.delete(cache.keys().next().value);return tour;
}
export function courseGround(tour,p){
 let best=null,score=Infinity;
 for(const h of tour.holes){const q=courseToLocal(h.placement,p);if(Math.abs(q.x)>110||q.z<-60||q.z>h.length+65)continue;const d=routeDistance(h,q.x,q.z);if(d<score){score=d;best={h,q};}}
 return best;
}
export function courseHeight(tour,p){const g=courseGround(tour,p);return g?heightAt(g.h,g.q.x,g.q.z):0;}
function allowed(tour,p){
 if(tour.reserve?.type==='lake'&&ellipseValue({...tour.reserve,rx:tour.reserve.rx+4,rz:tour.reserve.rz+4},p.x,p.z)<1)return false;
 for(const h of tour.holes){const q=courseToLocal(h.placement,p);if(Math.abs(q.x)>110||q.z<-60||q.z>h.length+65)continue;
  if(Math.hypot(q.x,q.z-h.length)<h.greenRadius+3.5)return false;
  if(h.hazards.some(a=>a.type==='water'&&ellipseValue({...a,rx:a.rx+3,rz:a.rz+3},q.x,q.z)<1))return false;
  if(h.trees.some(t=>distance(t,q)<1.8*t.scale+1.2))return false;
 }return true;
}
export function clearCourseRoad(tour,a,b){const n=Math.max(1,Math.ceil(distance(a,b)/2));for(let i=0;i<=n;i++)if(!allowed(tour,{x:a.x+(b.x-a.x)*i/n,z:a.z+(b.z-a.z)*i/n}))return false;return true;}
function stopAt(tour,h,green){
 const base={x:green?0:-8,z:green?h.length:0},radius=green?h.greenRadius+9:9;
 for(let ring=0;ring<6;ring++)for(let k=0;k<16;k++){const angle=k*Math.PI/8,p=localToCourse(h.placement,{x:base.x+Math.cos(angle)*(radius+ring*4),z:base.z+Math.sin(angle)*(radius+ring*4)});if(allowed(tour,p))return p;}
 throw Error('球车停靠点不可达。');
}
// 全场网格仅在换洞时求解；避开所有果岭、水域和树干，优先沿长草外沿。
export function roadBetween(tour,start,end){
 if(clearCourseRoad(tour,start,end))return [start,end];
 const b=tour.bounds,step=5,nx=Math.ceil((b.maxX-b.minX)/step)+1,nz=Math.ceil((b.maxZ-b.minZ)/step)+1;
 const point=id=>({x:b.minX+(id%nx)*step,z:b.minZ+Math.floor(id/nx)*step}),valid=new Map(),ok=id=>{if(!valid.has(id))valid.set(id,allowed(tour,point(id)));return valid.get(id);};
 const nearest=p=>{let best=null;const x=Math.round((p.x-b.minX)/step),z=Math.round((p.z-b.minZ)/step);for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++){const xx=x+dx,zz=z+dz;if(xx<0||xx>=nx||zz<0||zz>=nz)continue;const id=zz*nx+xx,q=point(id),d=distance(p,q);if((!best||d<best.d)&&ok(id)&&clearCourseRoad(tour,p,q))best={id,d};}return best;};
 const first=nearest(start),last=nearest(end);if(!first||!last)throw Error('球车路线暂不可达。');
 // 二叉堆避免为整个开放集合反复排序。
 const heap=[],push=n=>{heap.push(n);let i=heap.length-1;while(i){const parent=(i-1)>>1;if(heap[parent].f<=n.f)break;heap[i]=heap[parent];i=parent;}heap[i]=n;},pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&heap[child+1].f<heap[child].f)child++;if(heap[child].f>=last.f)break;heap[i]=heap[child];i=child;}heap[i]=last;}return top;};
 const costs=new Map([[first.id,0]]),parent=new Map(),closed=new Set();push({id:first.id,g:0,f:distance(point(first.id),end)});let found=false;
 while(heap.length&&closed.size<60000){const n=pop();if(closed.has(n.id))continue;if(n.id===last.id){found=true;break;}closed.add(n.id);const x=n.id%nx,z=Math.floor(n.id/nx),p=point(n.id);
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const xx=x+dx,zz=z+dz,id=zz*nx+xx;if(xx<0||xx>=nx||zz<0||zz>=nz||closed.has(id)||!ok(id))continue;const q=point(id);if(!clearCourseRoad(tour,p,q))continue;const ground=courseGround(tour,q),onFairway=ground&&routeDistance(ground.h,ground.q.x,ground.q.z)<ground.h.width+4,g=n.g+distance(p,q)*(onFairway?2.5:1);if(g>=(costs.get(id)??Infinity))continue;costs.set(id,g);parent.set(id,n.id);push({id,g,f:g+distance(q,end)});}
 }
 if(!found)throw Error('球车路线暂不可达。');const raw=[end];for(let id=last.id;id!==undefined;id=parent.get(id))raw.push(point(id));raw.push(start);raw.reverse();
 const route=[raw[0]];for(let i=0;i<raw.length-1;){let j=Math.min(raw.length-1,i+8);while(j>i+1&&!clearCourseRoad(tour,raw[i],raw[j]))j--;route.push(raw[j]);i=j;}return route;
}
export function holeTransfer(courseId,seed,fromIndex,toIndex){
 const tour=courseTour(courseId,seed),key=`${fromIndex}:${toIndex}`;if(tour.routes.has(key))return structuredClone(tour.routes.get(key));
 const start=stopAt(tour,tour.holes[fromIndex],true),end=toIndex===null?{x:tour.clubhouse.x+12,z:tour.clubhouse.z-13}:stopAt(tour,tour.holes[toIndex],false),route=roadBetween(tour,start,end),meters=route.slice(1).reduce((s,p,i)=>s+distance(route[i],p),0);
 const transfer={fromIndex,toIndex,route,meters,boarding:800,driving:Math.round(clamp(meters/18*1000,4200,11500)),alighting:800};transfer.duration=transfer.boarding+transfer.driving+transfer.alighting;tour.routes.set(key,transfer);return structuredClone(transfer);
}
