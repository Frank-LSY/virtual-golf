// 训练期数据增强：作用于已统一到 50 Hz 的录音，模拟握姿、设备坐标系、力量、节奏和采样率差异。
import {rng} from './net.js';
function gauss(r){let u=0,v=0;while(!u)u=r();while(!v)v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
export function axisAngle(axis,angle){const [x,y,z]=axis,l=Math.hypot(x,y,z)||1,u=x/l,v=y/l,w=z/l,c=Math.cos(angle),s=Math.sin(angle),C=1-c;return [c+u*u*C,u*v*C-w*s,u*w*C+v*s,v*u*C+w*s,c+v*v*C,v*w*C-u*s,w*u*C-v*s,w*v*C+u*s,c+w*w*C];}
const mul=(A,B)=>{const R=new Array(9).fill(0);for(let i=0;i<3;i++)for(let j=0;j<3;j++)for(let k=0;k<3;k++)R[i*3+j]+=A[i*3+k]*B[k*3+j];return R;};
// 小角度随机旋转；flip 概率下再叠加绕某轴 90° 或 180° 的整体转向（如横握方向相反、不同机型坐标系）。
export function randomRotation(r,maxDeg=30,flip=.1){let R=axisAngle([gauss(r),gauss(r),gauss(r)],(r()*2-1)*maxDeg*Math.PI/180);if(r()<flip){const axis=[[1,0,0],[0,1,0],[0,0,1]][Math.floor(r()*3)];R=mul(axisAngle(axis,(r()<.5?.5:1)*Math.PI*(r()<.5?1:-1)),R);}return R;}
export function rotate(res,R){const g=new Float32Array(res.g.length),a=new Float32Array(res.a.length);for(let i=0;i<res.n;i++)for(let k=0;k<3;k++){g[i*3+k]=R[k*3]*res.g[i*3]+R[k*3+1]*res.g[i*3+1]+R[k*3+2]*res.g[i*3+2];a[i*3+k]=R[k*3]*res.a[i*3]+R[k*3+1]*res.a[i*3+1]+R[k*3+2]*res.a[i*3+2];}return {...res,g,a};}
export function timeWarp(res,f){const n=Math.max(2,Math.round(res.n*f)),g=new Float32Array(n*3),a=new Float32Array(n*3);for(let i=0;i<n;i++){const p=Math.min(res.n-1,i/f),j=Math.min(res.n-2,Math.floor(p)),u=p-j;for(let k=0;k<3;k++){g[i*3+k]=res.g[j*3+k]+(res.g[(j+1)*3+k]-res.g[j*3+k])*u;a[i*3+k]=res.a[j*3+k]+(res.a[(j+1)*3+k]-res.a[j*3+k])*u;}}return {...res,n,g,a};}
// 模拟较低采样率：按 hz 取样后线性插值回原采样。
export function rateJitter(res,hz){if(hz>=res.hz)return res;const step=res.hz/hz,g=new Float32Array(res.g.length),a=new Float32Array(res.a.length);for(let i=0;i<res.n;i++){const p=i/step,j=Math.floor(p),u=p-j,s0=Math.min(res.n-1,Math.round(j*step)),s1=Math.min(res.n-1,Math.round((j+1)*step));for(let k=0;k<3;k++){g[i*3+k]=res.g[s0*3+k]+(res.g[s1*3+k]-res.g[s0*3+k])*u;a[i*3+k]=res.a[s0*3+k]+(res.a[s1*3+k]-res.a[s0*3+k])*u;}}return {...res,g,a};}
// 任意握持：均匀随机三维旋转（竖握、横握、屏幕朝里朝外都覆盖）。
export function uniformRotation(r){let q;do{q=[gauss(r),gauss(r),gauss(r),gauss(r)];}while(Math.hypot(...q)<1e-6);const l=Math.hypot(...q),[w,x,y,z]=q.map(v=>v/l);return [1-2*(y*y+z*z),2*(x*y-w*z),2*(x*z+w*y),2*(x*y+w*z),1-2*(x*x+z*z),2*(y*z-w*x),2*(x*z-w*y),2*(y*z+w*x),1-2*(x*x+y*y)];}
// 整段动作角速度的主方向（设备坐标），近似挥杆平面的法线。
export function principalAxis(res){const M=[0,0,0,0,0,0,0,0,0];for(let i=0;i<res.n;i++){const w=[res.g[i*3],res.g[i*3+1],res.g[i*3+2]];for(let a=0;a<3;a++)for(let b=0;b<3;b++)M[a*3+b]+=w[a]*w[b];}let u=[.31,1,.17];for(let k=0;k<40;k++){const v=[M[0]*u[0]+M[1]*u[1]+M[2]*u[2],M[3]*u[0]+M[4]*u[1]+M[5]*u[2],M[6]*u[0]+M[7]*u[1]+M[8]*u[2]],l=Math.hypot(...v);if(l<1e-9)break;u=v.map(x=>x/l);}return u;}
// 手腕不自主转动：手机相对手掌绕轴 s（默认取挥杆平面内、与主旋转轴垂直的方向，近似“杆身”）转动 φ(t)。
// φ 由一次平滑转动（在下挥峰附近，幅度 ±amplitude°，时长 0.2–0.6 秒）和缓慢抖动组成。
// 物理上：ω' = Rφᵀ·ω + φ̇·s，a' = Rφᵀ·a（忽略手腕到手机的力臂）。时间轴可为重采样序列或原始录音。
export function wristRoll(res,r,{amplitude=60,wobble=12,axis=null,angle=null,center=null}={}){
 const n=principalAxis(res);let s=axis;if(!s){if(r()<.75){let v=[gauss(r),gauss(r),gauss(r)];const d=v[0]*n[0]+v[1]*n[1]+v[2]*n[2];v=v.map((x,i)=>x-d*n[i]);const l=Math.hypot(...v)||1;s=v.map(x=>x/l);}else{const v=[gauss(r),gauss(r),gauss(r)],l=Math.hypot(...v)||1;s=v.map(x=>x/l);}}
 const time=i=>res.t?(res.t[i]-res.t[0])/1000:i/res.hz;let peak=0,pi=0;for(let i=0;i<res.n;i++){const w=Math.hypot(res.g[i*3],res.g[i*3+1],res.g[i*3+2]);if(w>peak){peak=w;pi=i;}}
 const k=Math.PI/180,A=(angle??(r()*2-1)*amplitude)*k,tc=time(pi)+(center??(r()*2-1)*.15),width=.2+r()*.4,tau=width/4,B=r()*wobble*k,f=.5+r()*2,ph=r()*2*Math.PI;
 const g=new Float32Array(res.g.length),a=new Float32Array(res.a.length);
 for(let i=0;i<res.n;i++){
  const t=time(i),u=Math.max(-40,Math.min(40,(t-tc)/tau)),sg=1/(1+Math.exp(-u)),phi=A*sg+B*Math.sin(2*Math.PI*f*t+ph),rate=(A*sg*(1-sg)/tau+B*2*Math.PI*f*Math.cos(2*Math.PI*f*t+ph))/k,R=axisAngle(s,phi);
  for(let c=0;c<3;c++){g[i*3+c]=R[c]*res.g[i*3]+R[3+c]*res.g[i*3+1]+R[6+c]*res.g[i*3+2]+rate*s[c];a[i*3+c]=R[c]*res.a[i*3]+R[3+c]*res.a[i*3+1]+R[6+c]*res.a[i*3+2];}
 }
 return {...res,g,a};
}
// 陀螺仪零偏：每轴固定偏移，模拟传感器漂移（姿态解算会因此产生小误差）。
export function gyroBias(res,r,max=3){const b=[0,1,2].map(()=>(r()*2-1)*max),g=Float32Array.from(res.g,(v,i)=>v+b[i%3]);return {...res,g};}
export function scaleGyro(res,f){const g=Float32Array.from(res.g,v=>v*f);return {...res,g};}
export function noise(res,r,gs=2,as=.05){const g=Float32Array.from(res.g,v=>v+gauss(r)*gs),a=Float32Array.from(res.a,v=>v+gauss(r)*as);return {...res,g,a};}
// 组合增强：tierSafe=true 时缩幅很小，避免破坏同一球手的力度排序。
export function augment(res,r,{tierSafe=false,strength=1}={}){
 let out=res;
 if(r()<.85*strength)out=rotate(out,r()<.5?uniformRotation(r):randomRotation(r,30*strength,.1*strength));
 if(r()<.6*strength)out=wristRoll(out,r,{amplitude:(tierSafe?30:60)*strength,wobble:12*strength});
 if(r()<.7*strength)out=timeWarp(out,.8+r()*.45);
 if(r()<.4*strength)out=rateJitter(out,45+r()*55);
 const amp=tierSafe?.93+r()*.14:.7+r()*.7;if(r()<.8*strength)out=scaleGyro(out,amp);
 if(r()<.5)out=gyroBias(out,r,3*strength);
 if(r()<.8)out=noise(out,r,2*strength,.05*strength);
 return out;
}
export {rng};
