// 合成挥杆数据：只用于自动测试与界面演示，模拟不同人（力量、节奏）与不同设备（坐标系、采样率）。
import {rng} from './net.js';
import {axisAngle} from './augment.js';
const TIER_GAIN={light:.42,mid:.68,heavy:1};
function bump(t,center,width){const u=(t-center)/width;return Math.abs(u)<1?.5+.5*Math.cos(Math.PI*u):0;}
// 返回主轴角速度 (°/s) 与离面角速度的生成函数，以及动作总时长。
function profile(label,tier,person,r){
 const k=(TIER_GAIN[tier]||.7)*(person.gain||1)*(.9+r()*.2),tempo=(person.tempo||1)*(.92+r()*.16);
 if(label==='full'){const b=.85/tempo,d=.28/tempo,peak=820*k,back=-210*Math.sqrt(k);return {T:b+d+.75,f:t=>back*bump(t,b*.5+.1,b*.5)+peak*bump(t,b+.1+d*.62,d*.62)+peak*.32*bump(t,b+.1+d+.22,.3),side:t=>.25*back*bump(t,b*.6,b*.5)-.18*peak*bump(t,b+.1+d*.7,d*.5)};}
 if(label==='partial'){const b=.55/tempo,d=.24/tempo,peak=430*k,back=-150*Math.sqrt(k);return {T:b+d+.55,f:t=>back*bump(t,b*.5+.1,b*.5)+peak*bump(t,b+.1+d*.6,d*.6)+peak*.2*bump(t,b+.1+d+.15,.22),side:t=>.15*peak*bump(t,b+.1+d*.6,d*.6)};}
 if(label==='putt'){const b=.62/tempo,d=.55/tempo,peak=95*k,back=-70*k;return {T:b+d+.6,f:t=>back*bump(t,b*.5+.1,b*.5)+peak*bump(t,b+.1+d*.5,d*.5),side:t=>.08*peak*bump(t,b+.1+d*.5,d*.5),axis:2};}
 const kind=Math.floor(r()*5),amp=(80+r()*220)*(person.gain||1);
 if(kind===0)return {T:1.4,f:t=>amp*bump(t,.6,.45),side:t=>.6*amp*bump(t,.7,.35),lift:t=>3*bump(t,.6,.4)};
 if(kind===1)return {T:1.4,f:t=>-amp*bump(t,.7,.45),side:t=>-.5*amp*bump(t,.6,.35),lift:t=>-3*bump(t,.7,.4)};
 if(kind===2){const hz=3.5+r()*2.5;return {T:1.6,f:t=>amp*Math.sin(2*Math.PI*hz*t)*bump(t,.8,.75),side:t=>.4*amp*Math.cos(2*Math.PI*hz*t)*bump(t,.8,.75)};}
 if(kind===3)return {T:2.2,f:t=>18*Math.sin(2*Math.PI*1.8*t),side:t=>12*Math.sin(2*Math.PI*.9*t),lift:t=>1.6*Math.sin(2*Math.PI*1.8*t)};
 return {T:1.8,f:t=>.35*amp*Math.sin(2*Math.PI*1.4*t)*bump(t,.9,.85),side:t=>.15*amp*Math.sin(2*Math.PI*2.8*t)*bump(t,.9,.85)};
}
export function synthRecording({label='full',tier='mid',person={},device={},seed=1}={}){
 const r=rng(seed),p=profile(label,tier,person,r),hz=device.hz||60,pre=.9+r()*.3,post=.4,T=pre+p.T+post,n=Math.floor(T*hz),t=new Float64Array(n),g=new Float32Array(n*3),a=new Float32Array(n*3);
 const R=device.rotation||axisAngle([0,0,1],0),axis=p.axis??0,other=(axis+1)%3,third=(axis+2)%3;let angle=0,prev=0;
 for(let i=0;i<n;i++){
  const time=i/hz+(r()-.5)*.002,u=time-pre,w=u>=0&&u<=p.T?p.f(u):0,s=u>=0&&u<=p.T?p.side(u):0,lift=u>=0&&u<=p.T&&p.lift?p.lift(u):0;angle+=w*Math.PI/180*(time-prev);prev=time;
  const local=[0,0,0];local[axis]=w+(r()-.5)*3;local[other]=s+(r()-.5)*3;local[third]=(r()-.5)*3;
  const rad=w*Math.PI/180,centripetal=rad*rad*.55,gy=9.81*Math.cos(angle),gz=9.81*Math.sin(angle),acc=[centripetal+(r()-.5)*.1,gy+lift,gz+(r()-.5)*.1];
  // 基准握持：动作主轴对应手机 β 轴（与现有规则识别的默认主轴一致），再叠加设备旋转。
  const gl=[-local[1],local[0],local[2]],al=[-acc[1],acc[0],acc[2]];
  t[i]=time*1000;for(let k=0;k<3;k++){g[i*3+k]=R[k*3]*gl[0]+R[k*3+1]*gl[1]+R[k*3+2]*gl[2];a[i*3+k]=R[k*3]*al[0]+R[k*3+1]*al[1]+R[k*3+2]*al[2];}
 }
 for(let i=1;i<n;i++)if(t[i]<=t[i-1])t[i]=t[i-1]+1;
 return {t,g,a,n};
}
// 生成一组带标签样本；person/device 决定域差异。
export function synthDataset({profile='A',person={},device={},counts={full:12,partial:10,putt:10,other:12},seed=1,session='s1'}={}){
 const out=[];let k=0;for(const [label,count] of Object.entries(counts))for(let i=0;i<count;i++){const tier=label==='other'?null:['light','mid','heavy'][i%3];out.push({id:`${profile}-${session}-${label}-${i}`,profile,session,label,tier,source:'collect',recording:synthRecording({label,tier:tier||'mid',person,device,seed:seed*7919+(k++)*104729})});}
 return out;
}
