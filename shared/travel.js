import {distance,surfaceAt,heightAt,clamp} from './courses.js';
export const WALK_LIMIT=18;
export const LANDING_PAUSE=900;
const safe=(h,p)=>!['water','out'].includes(surfaceAt(h,p.x,p.z))&&!h.trees.some(t=>distance(t,p)<1.5*t.scale);
// 球车停在球手身后侧方，避开第三人称镜头的取景范围（镜头位于球后约 6.8 米）。
export function parkingAt(h,p){const a=Math.atan2(h.pin.x-p.x,h.pin.z-p.z),f={x:Math.sin(a),z:Math.cos(a)},side={x:-Math.cos(a),z:Math.sin(a)};for(const [back,out] of [[4.4,4.8],[5.6,4.2],[3.2,5.6],[4.4,-5.2]]){const q={x:p.x-f.x*back+side.x*out,z:p.z-f.z*back+side.z*out};if(safe(h,q))return q;}for(let r=2;r<=10;r+=2)for(let k=0;k<12;k++){const b=k*Math.PI/6,q={x:p.x+Math.cos(b)*r,z:p.z+Math.sin(b)*r};if(safe(h,q))return q;}return {...p};}
export function clearTravelSegment(h,a,b){const n=Math.max(1,Math.ceil(distance(a,b)));for(let i=0;i<=n;i++){const t=i/n;if(!safe(h,{x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t}))return false;}return true;}
// 小型球场导航网格：球车绕开水面、边界和树干，再移除多余折点。
export function cartRoute(h,start,end){
 if(clearTravelSegment(h,start,end))return [start,end];
 const step=5,b=h.bounds,minX=b.minX+2,minZ=b.minZ+2,nx=Math.ceil((b.maxX-minX)/step),nz=Math.ceil((b.maxZ-minZ)/step),point=(x,z)=>({x:minX+x*step,z:minZ+z*step}),key=(x,z)=>z*nx+x;
 const nearest=p=>{let best=null;for(let z=Math.max(0,Math.round((p.z-minZ)/step)-3);z<=Math.min(nz-1,Math.round((p.z-minZ)/step)+3);z++)for(let x=Math.max(0,Math.round((p.x-minX)/step)-3);x<=Math.min(nx-1,Math.round((p.x-minX)/step)+3);x++){const q=point(x,z),d=distance(q,p);if((!best||d<best.d)&&clearTravelSegment(h,p,q))best={x,z,p:q,d};}return best;};
 const first=nearest(start),last=nearest(end);if(!first||!last)return null;
 const initial={...first,g:0,f:distance(first.p,end),parent:null},open=[initial],scores=new Map([[key(first.x,first.z),0]]),closed=new Set();let found;
 while(open.length&&closed.size<10000){open.sort((a,b)=>b.f-a.f);const node=open.pop(),id=key(node.x,node.z);if(closed.has(id))continue;closed.add(id);if(node.x===last.x&&node.z===last.z){found=node;break;}
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const x=node.x+dx,z=node.z+dz;if(x<0||x>=nx||z<0||z>=nz)continue;const next=point(x,z),id=key(x,z);if(closed.has(id)||!clearTravelSegment(h,node.p,next))continue;const length=distance(node.p,next),rise=Math.abs(heightAt(h,node.p.x,node.p.z)-heightAt(h,next.x,next.z));if(rise>length*.5)continue;const g=node.g+length*(surfaceAt(h,next.x,next.z)==='sand'?2:1)+rise*2;if(g>=(scores.get(id)??Infinity))continue;scores.set(id,g);open.push({x,z,p:next,g,f:g+distance(next,end),parent:node});}
 }
 if(!found)return null;const raw=[end];for(let n=found;n;n=n.parent)raw.push(n.p);raw.push(start);raw.reverse();const route=[raw[0]];let i=0;while(i<raw.length-1){let next=raw.length-1;while(next>i+1&&!clearTravelSegment(h,raw[i],raw[next]))next--;route.push(raw[next]);i=next;}return route;
}
export function movementPlan(h,from,to,holed=false){
 const meters=distance(from,to);if(holed||meters<.15)return {mode:'none',duration:0,meters,route:[from,to]};
 if(meters<=WALK_LIMIT)return {mode:'walk',duration:clamp(meters/2.5*1000,1000,7000),meters,route:[from,to]};
 const route=cartRoute(h,parkingAt(h,from),parkingAt(h,to));if(!route)return {mode:'walk',duration:6000,meters,route:[from,to]};
 const length=route.slice(1).reduce((sum,p,i)=>sum+distance(route[i],p),0),boarding=1000,driving=clamp(length/42*1000,1800,4500),alighting=1050;
 return {mode:'cart',duration:boarding+driving+alighting,boarding,driving,alighting,meters,route};
}
export function sampleRoute(route,t){const lengths=route.slice(1).map((p,i)=>distance(route[i],p)),total=lengths.reduce((a,b)=>a+b,0);let remaining=clamp(t,0,1)*total;for(let i=0;i<lengths.length;i++){if(remaining<=lengths[i]||i===lengths.length-1){const a=route[i],b=route[i+1],f=clamp(remaining/(lengths[i]||1),0,1);return {x:a.x+(b.x-a.x)*f,z:a.z+(b.z-a.z)*f,heading:Math.atan2(b.x-a.x,b.z-a.z),distance:clamp(t,0,1)*total};}remaining-=lengths[i];}return {...route[0],heading:0,distance:0};}
export function roundAnimationMs(shot,source='screen'){return (source==='phone'?100:540)+shot.duration*1000+(shot.holed?1400:LANDING_PAUSE+(shot.movement?.duration||0))+350;}
