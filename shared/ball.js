import {SPLASH_DURATION} from './water.js';
export const BALL_RADIUS=.085;
export const CUP_RADIUS=.215;
export const CUP_DEPTH=.42;
export const DROP_DURATION=.95;
export const SETTLE_DURATION=1.1;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
// 进洞下落保留独立播放时长，长距离击球也不会把落杯过程压成一帧。
export function sampleShot(shot,elapsed){
 const duration=shot.duration,seconds=clamp(elapsed,0,duration),path=shot.path;
 const drop=shot.holed&&Number.isFinite(shot.captureTime),splash=Number.isFinite(shot.waterTime),settle=Number.isFinite(shot.settleTime),terminal=drop||splash||settle,tail=drop?DROP_DURATION:splash?SPLASH_DURATION:settle?SETTLE_DURATION:0,entry=drop?shot.captureTime:splash?shot.waterTime:settle?shot.settleTime:path.at(-1).t,travelTime=duration-tail;
 let physical=terminal&&seconds>=travelTime?entry+(seconds-travelTime)/tail*(path.at(-1).t-entry):seconds/Math.max(.01,travelTime)*entry;
 if(shot.rimExtra>0&&seconds<travelTime){
  const rate=(travelTime-shot.rimExtra)/Math.max(.01,entry),start=shot.rimTime*rate,end=shot.rimEndTime*rate+shot.rimExtra;
  physical=seconds<start?seconds/rate:seconds<=end?shot.rimTime+(seconds-start)/(end-start)*(shot.rimEndTime-shot.rimTime):(seconds-shot.rimExtra)/rate;
 }
 let lo=0,hi=path.length-1;while(lo<hi-1){const m=(lo+hi)>>1;if(path[m].t<physical)lo=m;else hi=m;}
 const a=path[lo],b=path[hi],f=clamp((physical-a.t)/(b.t-a.t||1),0,1);
 return {x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,z:a.z+(b.z-a.z)*f,index:hi,time:physical,done:seconds>=duration,rimming:Number.isFinite(shot.rimTime)&&physical>=shot.rimTime&&physical<shot.rimEndTime,dropping:!!drop&&seconds>=travelTime,splashing:splash&&seconds>=travelTime,settling:settle&&seconds>=travelTime};
}
