// 合成挥杆数据：只用于自动测试与界面演示，模拟不同人（力量、节奏）与不同设备（坐标系、采样率）。
// 0.20 起按“挥杆 / 推杆 / 非挥杆 × 5 档力度”生成；力度档位同时改变上杆幅度与挥速，另可生成“上杆后停住”的动作采样。
import {rng} from './net.js';
import {axisAngle} from './augment.js';
import {LEVELS,POSES} from './labels.js';
// 档位 → 力量系数：最轻的挥杆仍有清楚的上杆与下挥（真实的 20% 挥杆角速度峰值约 300°/s 以上）。
const gain=(level,low=.4)=>low+(1-low)*(Math.max(1,Math.min(5,level||3))-1)/4;
function bump(t,center,width){const u=(t-center)/width;return Math.abs(u)<1?.5+.5*Math.cos(Math.PI*u):0;}
// 返回主轴角速度 (°/s) 与离面角速度的生成函数，以及动作总时长。
function profile(label,level,person,r,pose,variant){
 const k=gain(level,label==='putt'?.5:.4)*(person.gain||1)*(.9+r()*.2),tempo=(person.tempo||1)*(.92+r()*.16);
 if(pose&&POSES[pose]&&pose!=='finish'){const u=POSES[pose].u,b=(.7+.5*u)/tempo,back=-150*Math.sqrt(u);return {T:b+1.3,f:t=>back*bump(t,b*.5+.1,b*.5),side:t=>.2*back*bump(t,b*.6,b*.5)};}
 if(label==='swing'){const b=(.45+.45*k)/tempo,d=.28/tempo,peak=820*k,back=-230*Math.sqrt(k),hold=pose==='finish'?1:0;return {T:b+d+.75+hold,f:t=>back*bump(t,b*.5+.1,b*.5)+peak*bump(t,b+.1+d*.62,d*.62)+peak*.32*bump(t,b+.1+d+.22,.3),side:t=>.25*back*bump(t,b*.6,b*.5)-.18*peak*bump(t,b+.1+d*.7,d*.5)};}
 if(label==='putt'){const b=.62/tempo,d=.55/tempo,peak=95*k,back=-70*k;return {T:b+d+.6,f:t=>back*bump(t,b*.5+.1,b*.5)+peak*bump(t,b+.1+d*.5,d*.5),side:t=>.08*peak*bump(t,b+.1+d*.5,d*.5),axis:2};}
 const roll=Math.floor(r()*5),kind=Number.isInteger(variant)?variant%5:roll,amp=(80+r()*220)*(person.gain||1);
 if(kind===0)return {T:1.4,f:t=>amp*bump(t,.6,.45),side:t=>.6*amp*bump(t,.7,.35),lift:t=>3*bump(t,.6,.4)};
 if(kind===1)return {T:1.4,f:t=>-amp*bump(t,.7,.45),side:t=>-.5*amp*bump(t,.6,.35),lift:t=>-3*bump(t,.7,.4)};
 if(kind===2){const hz=3.5+r()*2.5;return {T:1.6,f:t=>amp*Math.sin(2*Math.PI*hz*t)*bump(t,.8,.75),side:t=>.4*amp*Math.cos(2*Math.PI*hz*t)*bump(t,.8,.75)};}
 if(kind===3)return {T:2.2,f:t=>18*Math.sin(2*Math.PI*1.8*t),side:t=>12*Math.sin(2*Math.PI*.9*t),lift:t=>1.6*Math.sin(2*Math.PI*1.8*t)};
 // 预备晃杆：多次快速小幅来回（与推杆的单次钟摆区分）。
 return {T:1.8,f:t=>.35*amp*Math.sin(2*Math.PI*2.6*t)*bump(t,.9,.85),side:t=>.15*amp*Math.sin(2*Math.PI*5.2*t)*bump(t,.9,.85)};
}
// 兼容旧标签：全挥杆 → 挥杆 3–5 档，切杆 → 挥杆 1–3 档（按轻中重）。
const LEGACY={full:{light:3,mid:4,heavy:5},partial:{light:1,mid:2,heavy:3}};
export function synthRecording({label='swing',level=null,tier='mid',pose=null,variant=null,person={},device={},seed=1}={}){
 if(LEGACY[label]){level??=LEGACY[label][tier]||LEGACY[label].mid;label='swing';}level??=3;
 const r=rng(seed),p=profile(label,level,person,r,pose,variant),hz=device.hz||60,pre=.9+r()*.3,post=.4,T=pre+p.T+post,n=Math.floor(T*hz),t=new Float64Array(n),g=new Float32Array(n*3),a=new Float32Array(n*3);
 const R=device.rotation||axisAngle([0,0,1],0),axis=p.axis??0,other=(axis+1)%3,third=(axis+2)%3;let angle=0,prev=0;
 for(let i=0;i<n;i++){
  const time=i/hz+(r()-.5)*.002,u=time-pre,w=u>=0&&u<=p.T?p.f(u):0,s=u>=0&&u<=p.T?p.side(u):0,lift=u>=0&&u<=p.T&&p.lift?p.lift(u):0;angle+=w*Math.PI/180*(time-prev);prev=time;
  const local=[0,0,0];local[axis]=w+(r()-.5)*3;local[other]=s+(r()-.5)*3;local[third]=(r()-.5)*3;
  const rad=w*Math.PI/180,centripetal=rad*rad*.55,gy=9.81*Math.cos(angle),gz=9.81*Math.sin(angle),acc=[centripetal+(r()-.5)*.1,gy+lift,gz+(r()-.5)*.1];
  // 基准握持：动作主轴对应手机 β 轴，再叠加设备旋转。
  const gl=[-local[1],local[0],local[2]],al=[-acc[1],acc[0],acc[2]];
  t[i]=time*1000;for(let k=0;k<3;k++){g[i*3+k]=R[k*3]*gl[0]+R[k*3+1]*gl[1]+R[k*3+2]*gl[2];a[i*3+k]=R[k*3]*al[0]+R[k*3+1]*al[1]+R[k*3+2]*al[2];}
 }
 for(let i=1;i<n;i++)if(t[i]<=t[i-1])t[i]=t[i-1]+1;
 return {t,g,a,n};
}
// 生成一组带标签样本；person/device 决定域差异。挥杆与推杆按 1→5 档循环，非挥杆动作的 5 种类型轮流出现。
export function synthDataset({profile='A',person={},device={},counts={swing:15,putt:10,other:12},seed=1,session='s1'}={}){
 const out=[];let k=0;for(const [label,count] of Object.entries(counts))for(let i=0;i<count;i++){const level=label==='other'?null:LEVELS[i%5];out.push({id:`${profile}-${session}-${label}-${i}`,profile,session,label,level,power:level?level/5:null,source:'collect',recording:synthRecording({label,level:level||3,variant:label==='other'?i:null,person,device,seed:seed*7919+(k++)*104729})});}
 return out;
}
