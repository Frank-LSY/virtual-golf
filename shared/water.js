import {WATER_LEVEL,ellipseValue,heightAt} from './courses.js';
export {WATER_LEVEL} from './courses.js';
export const SPLASH_DURATION=1.25;
export function splashCamera(h,point){
 const pond=h.hazards.find(p=>p.type==='water'&&ellipseValue(p,point.x,point.z)<=1.001),dx=(pond?.x??point.x)-point.x,dz=(pond?.z??point.z+1)-point.z,length=Math.hypot(dx,dz)||1;
 const x=point.x+dx/length*7+dz/length*3,z=point.z+dz/length*7-dx/length*3;
 return {x:-x,y:Math.max(WATER_LEVEL+5.5,heightAt(h,x,z)+2.5),z};
}

// 扫过真实水面的第一接触点；高空飞越水域不会触发处罚。
export function sweepWater(h,a,b,radius){
 let best=null;
 for(const pond of h.hazards.filter(p=>p.type==='water')){
  const c=Math.cos(pond.angle||0),s=Math.sin(pond.angle||0),dx=b.x-a.x,dz=b.z-a.z;
  const x=((a.x-pond.x)*c+(a.z-pond.z)*s)/pond.rx,z=(-(a.x-pond.x)*s+(a.z-pond.z)*c)/pond.rz,vx=(dx*c+dz*s)/pond.rx,vz=(-dx*s+dz*c)/pond.rz;
  const A=vx*vx+vz*vz,B=2*(x*vx+z*vz),C=x*x+z*z-1;
  let enter=0,exit=1;
  if(A<1e-14){if(C>0)continue;}else{const disc=B*B-4*A*C;if(disc<0)continue;const root=Math.sqrt(disc);enter=Math.max(enter,(-B-root)/(2*A));exit=Math.min(exit,(-B+root)/(2*A));}
  const dy=b.y-a.y,above=a.y-WATER_LEVEL-radius;
  if(Math.abs(dy)<1e-10){if(above>0)continue;}else if(dy<0)enter=Math.max(enter,-above/dy);else exit=Math.min(exit,-above/dy);
  if(enter>exit||enter<0||enter>1)continue;
  const position={x:a.x+dx*enter,y:WATER_LEVEL,z:a.z+dz*enter};
  if(ellipseValue(pond,position.x,position.z)>1.000001||heightAt(h,position.x,position.z)>WATER_LEVEL+.015)continue;
  if(!best||enter<best.fraction)best={fraction:enter,position};
 }
 return best;
}
