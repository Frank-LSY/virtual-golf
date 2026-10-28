// 信号预处理：统一采样率、找锚点、截取因果窗口、组装 8 通道输入，以及规则基线所需的手工特征。
export const WINDOW=Object.freeze({hz:50,before:90,after:6,length:96,channels:8,gyroScale:400,accelScale:9.81});
// 特征版本：1 = 整个窗口用一个固定旋转转到挥杆坐标系（0.15–0.16）；2 = 先做姿态解算，把每一帧转到起点的固定参考系，
// 再转到挥杆坐标系，手腕在挥杆中途转动、竖握 / 横握都不会改变挥杆主轴的方向（0.17 起）。
export const FEATURES=2;

// 按时间戳线性插值到等间隔采样；输出交错数组 g / a，长度 n。
export function resample(rec,hz=WINDOW.hz){
 const t=rec.t,N=t.length,span=t[N-1]-t[0],n=Math.max(2,Math.floor(span*hz/1000)+1),g=new Float32Array(n*3),a=new Float32Array(n*3),step=1000/hz;let j=0;
 for(let i=0;i<n;i++){
  const time=t[0]+i*step;while(j<N-2&&t[j+1]<time)j++;const t0=t[j],t1=t[j+1],f=t1>t0?Math.max(0,Math.min(1,(time-t0)/(t1-t0))):0;
  for(let k=0;k<3;k++){g[i*3+k]=rec.g[j*3+k]+(rec.g[(j+1)*3+k]-rec.g[j*3+k])*f;a[i*3+k]=rec.a[j*3+k]+(rec.a[(j+1)*3+k]-rec.a[j*3+k])*f;}
 }
 return {n,hz,g,a};
}
export function magnitude(v,n){const m=new Float32Array(n);for(let i=0;i<n;i++)m[i]=Math.hypot(v[i*3],v[i*3+1],v[i*3+2]);return m;}
export function smooth(x,radius=2){const n=x.length,out=new Float32Array(n);for(let i=0;i<n;i++){let s=0,c=0;for(let k=-radius;k<=radius;k++){const j=i+k;if(j>=0&&j<n){s+=x[j];c++;}}out[i]=s/c;}return out;}
// 锚点：平滑后角速度模的最大值位置，可限定搜索范围（例如保证锚点后至少还有 after 帧）。
export function findAnchor(res,{from=0,to=res.n-1}={}){const m=smooth(magnitude(res.g,res.n));let best=Math.max(0,from);for(let i=Math.max(0,from);i<=Math.min(res.n-1,to);i++)if(m[i]>m[best])best=i;return best;}
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l);};
// 挥杆坐标系：z′ 指向静止时的“上”（含重力加速度方向），x′ 为窗口内主旋转轴在水平面的投影，峰值时角速度沿 x′ 为正。
// 换握姿、换机型、横握方向相反都会被转换到同一坐标系，是跨设备迁移的关键。
export function swingFrame(res,anchor,opts={}){
 const before=opts.before??WINDOW.before,after=opts.after??WINDOW.after,start=Math.max(0,anchor-before+1),end=Math.min(res.n-1,anchor+after);
 let up=[0,0,0],count=0;const early=start+Math.floor((end-start)*.4);
 for(let j=start;j<=early;j++){if(Math.hypot(res.g[j*3],res.g[j*3+1],res.g[j*3+2])<40){up[0]+=res.a[j*3];up[1]+=res.a[j*3+1];up[2]+=res.a[j*3+2];count++;}}
 if(count<5){up=[0,0,0];for(let j=start;j<=Math.min(end,start+14);j++){up[0]+=res.a[j*3];up[1]+=res.a[j*3+1];up[2]+=res.a[j*3+2];}}
 if(Math.hypot(...up)<1)up=[0,0,1];const z=unit(up);
 const M=[0,0,0,0,0,0,0,0,0];for(let j=start;j<=end;j++){const w=[res.g[j*3],res.g[j*3+1],res.g[j*3+2]];for(let r=0;r<3;r++)for(let c=0;c<3;c++)M[r*3+c]+=w[r]*w[c];}
 let u=[1,.31,.17];for(let k=0;k<40;k++){const v=[M[0]*u[0]+M[1]*u[1]+M[2]*u[2],M[3]*u[0]+M[4]*u[1]+M[5]*u[2],M[6]*u[0]+M[7]*u[1]+M[8]*u[2]];if(Math.hypot(...v)<1e-9)break;u=unit(v);}
 let x=u.map((v,i)=>v-dot(u,z)*z[i]);if(Math.hypot(...x)<.2)x=cross(z,Math.abs(z[0])<.9?[1,0,0]:[0,1,0]);x=unit(x);
 const wa=[res.g[anchor*3],res.g[anchor*3+1],res.g[anchor*3+2]];if(dot(wa,x)<0)x=x.map(v=>-v);
 const y=unit(cross(z,x));return [...x,...y,...z];
}
// ---------- 姿态解算（特征版本 2）----------
// iPhone Safari 的 rotationRate.alpha / beta / gamma 依次对应设备 x / y / z 轴（与加速度计同序）。
// 用真实录音验证：按此顺序积分陀螺仪预测的重力方向与加速度计平均相差约 5°，其它 47 种轴序与符号组合都更差。
export function qmul(a,b){return [a[0]*b[0]-a[1]*b[1]-a[2]*b[2]-a[3]*b[3],a[0]*b[1]+a[1]*b[0]+a[2]*b[3]-a[3]*b[2],a[0]*b[2]-a[1]*b[3]+a[2]*b[0]+a[3]*b[1],a[0]*b[3]+a[1]*b[2]-a[2]*b[1]+a[3]*b[0]];}
export function qmat(q){const [w,x,y,z]=q;return [1-2*(y*y+z*z),2*(x*y-w*z),2*(x*z+w*y),2*(x*y+w*z),1-2*(x*x+z*z),2*(y*z-w*x),2*(x*z-w*y),2*(y*z+w*x),1-2*(x*x+y*y)];}
// 从第 from 帧积分到第 to 帧：返回每帧“设备 → 起点参考系”的旋转矩阵（中点角速度 + 精确指数映射）。
export function attitude(res,from,to){
 const n=to-from+1,out=new Float64Array(n*9),dt=1/res.hz,k=Math.PI/180;let q=[1,0,0,0];out.set([1,0,0,0,1,0,0,0,1],0);
 for(let i=from;i<to;i++){const wx=(res.g[i*3]+res.g[i*3+3])*.5*k,wy=(res.g[i*3+1]+res.g[i*3+4])*.5*k,wz=(res.g[i*3+2]+res.g[i*3+5])*.5*k,w=Math.hypot(wx,wy,wz),th=w*dt;
  if(th>1e-12){const s=Math.sin(th/2)/w;q=qmul(q,[Math.cos(th/2),wx*s,wy*s,wz*s]);const l=Math.hypot(...q);q=q.map(v=>v/l);}out.set(qmat(q),(i-from+1)*9);}
 return out;
}
// 窗口内每帧的角速度与加速度，转到窗口起点的固定参考系（越界帧用首尾值延拓）。
export function referenceSeries(res,start,end){
 const lo=Math.max(0,start),hi=Math.min(res.n-1,end),R=attitude(res,lo,hi),L=end-start+1,g=new Float32Array(L*3),a=new Float32Array(L*3);
 for(let i=0;i<L;i++){const j=Math.max(lo,Math.min(hi,start+i)),m=(j-lo)*9;for(let r=0;r<3;r++){g[i*3+r]=R[m+r*3]*res.g[j*3]+R[m+r*3+1]*res.g[j*3+1]+R[m+r*3+2]*res.g[j*3+2];a[i*3+r]=R[m+r*3]*res.a[j*3]+R[m+r*3+1]*res.a[j*3+1]+R[m+r*3+2]*res.a[j*3+2];}}
 return {g,a,n:L,hz:res.hz};
}
// 参考系下的挥杆坐标系：z′ 为重力“上”，x′ 为主旋转轴的水平投影（峰值时为正），y′ = z′ × x′。
function frameFromSeries(ser,anchorIdx){
 let up=[0,0,0],count=0;const early=Math.floor(ser.n*.4);
 for(let j=0;j<=early;j++){if(Math.hypot(ser.g[j*3],ser.g[j*3+1],ser.g[j*3+2])<40){up[0]+=ser.a[j*3];up[1]+=ser.a[j*3+1];up[2]+=ser.a[j*3+2];count++;}}
 if(count<5){up=[0,0,0];for(let j=0;j<ser.n;j++){up[0]+=ser.a[j*3];up[1]+=ser.a[j*3+1];up[2]+=ser.a[j*3+2];}}
 if(Math.hypot(...up)<1)up=[0,0,1];const z=unit(up);
 const M=[0,0,0,0,0,0,0,0,0];for(let j=0;j<ser.n;j++){const w=[ser.g[j*3],ser.g[j*3+1],ser.g[j*3+2]];for(let r=0;r<3;r++)for(let c=0;c<3;c++)M[r*3+c]+=w[r]*w[c];}
 let u=[1,.31,.17];for(let k=0;k<40;k++){const v=[M[0]*u[0]+M[1]*u[1]+M[2]*u[2],M[3]*u[0]+M[4]*u[1]+M[5]*u[2],M[6]*u[0]+M[7]*u[1]+M[8]*u[2]];if(Math.hypot(...v)<1e-9)break;u=unit(v);}
 let x=u.map((v,i)=>v-dot(u,z)*z[i]);if(Math.hypot(...x)<.2)x=cross(z,Math.abs(z[0])<.9?[1,0,0]:[0,1,0]);x=unit(x);
 const wa=[ser.g[anchorIdx*3],ser.g[anchorIdx*3+1],ser.g[anchorIdx*3+2]];if(dot(wa,x)<0)x=x.map(v=>-v);
 return [...x,...unit(cross(z,x)),...z];
}
function fillChannels(x,L,i,R,g0,g1,g2,a0,a1,a2){const gs=WINDOW.gyroScale,as=WINDOW.accelScale,gx=R[0]*g0+R[1]*g1+R[2]*g2,gy=R[3]*g0+R[4]*g1+R[5]*g2,gz=R[6]*g0+R[7]*g1+R[8]*g2,ax=R[0]*a0+R[1]*a1+R[2]*a2,ay=R[3]*a0+R[4]*a1+R[5]*a2,az=R[6]*a0+R[7]*a1+R[8]*a2;x[i]=gx/gs;x[L+i]=gy/gs;x[2*L+i]=gz/gs;x[3*L+i]=Math.hypot(gx,gy,gz)/gs;x[4*L+i]=ax/as;x[5*L+i]=ay/as;x[6*L+i]=az/as;x[7*L+i]=Math.hypot(ax,ay,az)/as;}
// 输出通道优先布局 [c*L+i]，越界部分用首尾值延拓。features 选择特征版本（默认 2：姿态解算后的挥杆坐标系）。
export function windowAt(res,anchor,opts={}){
 const features=opts.features??(opts.canonical===false?1:FEATURES);
 if(features>=2){const before=opts.before??WINDOW.before,after=opts.after??WINDOW.after,L=before+after,start=anchor-before+1,ser=referenceSeries(res,start,anchor+after),R=frameFromSeries(ser,before-1),x=new Float32Array(WINDOW.channels*L);for(let i=0;i<L;i++)fillChannels(x,L,i,R,ser.g[i*3],ser.g[i*3+1],ser.g[i*3+2],ser.a[i*3],ser.a[i*3+1],ser.a[i*3+2]);return x;}
 return windowFixed(res,anchor,opts);
}
// 特征版本 1：整个窗口用同一个旋转（旧模型继续可用）。
function windowFixed(res,anchor,opts={}){
 const before=opts.before??WINDOW.before,after=opts.after??WINDOW.after,L=before+after,x=new Float32Array(WINDOW.channels*L),gs=WINDOW.gyroScale,as=WINDOW.accelScale,R=opts.canonical===false?[1,0,0,0,1,0,0,0,1]:swingFrame(res,anchor,opts);
 for(let i=0;i<L;i++){
  const j=Math.max(0,Math.min(res.n-1,anchor-before+1+i)),g0=res.g[j*3],g1=res.g[j*3+1],g2=res.g[j*3+2],a0=res.a[j*3],a1=res.a[j*3+1],a2=res.a[j*3+2];
  const gx=R[0]*g0+R[1]*g1+R[2]*g2,gy=R[3]*g0+R[4]*g1+R[5]*g2,gz=R[6]*g0+R[7]*g1+R[8]*g2,ax=R[0]*a0+R[1]*a1+R[2]*a2,ay=R[3]*a0+R[4]*a1+R[5]*a2,az=R[6]*a0+R[7]*a1+R[8]*a2;
  x[i]=gx/gs;x[L+i]=gy/gs;x[2*L+i]=gz/gs;x[3*L+i]=Math.hypot(gx,gy,gz)/gs;x[4*L+i]=ax/as;x[5*L+i]=ay/as;x[6*L+i]=az/as;x[7*L+i]=Math.hypot(ax,ay,az)/as;
 }
 return x;
}
// 从完整录音得到模型输入：重采样 → 锚点 → 因果窗口。
export function prepareInput(rec,opts={}){const res=opts.resampled||resample(rec);const anchor=opts.anchor??findAnchor(res);return {x:windowAt(res,anchor+(opts.shift||0),{features:opts.features}),anchor,res};}

export function quality(rec){
 const n=rec.t.length,duration=n>1?rec.t[n-1]-rec.t[0]:0,hz=duration>0?(n-1)*1000/duration:0;let peak=0,gaps=0,accelDev=0;
 for(let i=0;i<n;i++){peak=Math.max(peak,Math.hypot(rec.g[i*3],rec.g[i*3+1],rec.g[i*3+2]));accelDev=Math.max(accelDev,Math.abs(Math.hypot(rec.a[i*3],rec.a[i*3+1],rec.a[i*3+2])-9.81));if(i&&rec.t[i]-rec.t[i-1]>120)gaps++;}
 return {duration,hz,peak,accelDev,gaps,ok:duration>=250&&hz>=25&&gaps===0};
}
// 手工特征：用于最近质心基线与界面摘要，不进入网络。
export function features(res,anchor=findAnchor(res)){
 const m=magnitude(res.g,res.n),dt=1/res.hz,peak=m[anchor];let energy=0,active=0,start=anchor,end=anchor;
 for(let i=0;i<res.n;i++){energy+=m[i]*m[i]*dt;if(m[i]>Math.max(20,peak*.2))active+=dt;}
 while(start>0&&m[start-1]>Math.max(15,peak*.12))start--;while(end<res.n-1&&m[end+1]>Math.max(15,peak*.12))end++;
 let axis=0,best=0;for(let k=0;k<3;k++){let s=0;for(let i=start;i<=end;i++)s+=Math.abs(res.g[i*3+k]);if(s>best){best=s;axis=k;}}
 let sign=0,flips=0;for(let i=start;i<=end;i++){const v=res.g[i*3+axis];if(Math.abs(v)>Math.max(15,peak*.15)){const sg=Math.sign(v);if(sign&&sg!==sign)flips++;sign=sg;}}
 const am=magnitude(res.a,res.n);let amin=Infinity,amax=-Infinity;for(let i=start;i<=end;i++){amin=Math.min(amin,am[i]);amax=Math.max(amax,am[i]);}
 return {peak,energy:Math.sqrt(energy),active,motion:(end-start)*dt,rise:(anchor-start)*dt,flips,accelRange:Number.isFinite(amax)?amax-amin:0};
}
export const featureVector=f=>[Math.log1p(f.peak),Math.log1p(f.energy),f.active,f.motion,f.rise,Math.min(4,f.flips),Math.log1p(f.accelRange)];
// 降采样的 |ω| 轮廓，供界面缩略图使用。
export function sparkline(res,points=48){const m=magnitude(res.g,res.n),out=[];for(let i=0;i<points;i++){const a=Math.floor(i*res.n/points),b=Math.max(a+1,Math.floor((i+1)*res.n/points));let v=0;for(let j=a;j<b;j++)v=Math.max(v,m[j]);out.push(Math.round(v));}return out;}
