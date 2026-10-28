// SwingNet：8×96 输入的小型 1D 卷积网络，纯 JavaScript 前向与反向传播，浏览器与 Node 通用。
// 编码器：3 层卷积 + 池化 → 64 维特征 h；头部：嵌入 e(32, tanh) → 类别 logits(4) 与力度分数 s(1)。
import {float32ToBase64,base64ToFloat32} from './codec.js';
import {ML_VERSION,CLASSES} from './labels.js';
import {WINDOW} from './signal.js';

export const ARCH=Object.freeze({channels:WINDOW.channels,length:WINDOW.length,conv:[[8,16,7,true],[16,24,5,true],[24,32,3,false]],hidden:64,embed:32,classes:CLASSES.length});
export const ENCODER_PARAMS=['c0w','c0b','c1w','c1b','c2w','c2b'];
export const HEAD_PARAMS=['dw','db','cw','cb','iw','iv','ib'];
// 力度头的直连幅度特征：窗口内 |ω| 峰值与均方根的对数，使力度分数对没见过的力量范围也保持单调。
export const AMPLITUDE_FEATURES=2;

export function rng(seed=1){let a=seed>>>0;return ()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
function gaussian(r){let u=0,v=0;while(!u)u=r();while(!v)v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
function shapes(){const s={};ARCH.conv.forEach(([cin,cout,k],i)=>{s[`c${i}w`]=[cout*cin*k,cin*k];s[`c${i}b`]=[cout,0];});s.dw=[ARCH.embed*ARCH.hidden,ARCH.hidden];s.db=[ARCH.embed,0];s.cw=[ARCH.classes*ARCH.embed,ARCH.embed];s.cb=[ARCH.classes,0];s.iw=[ARCH.embed,ARCH.embed];s.iv=[AMPLITUDE_FEATURES,0];s.ib=[1,0];return s;}
export function createParams(seed=1){const r=rng(seed),p={};for(const [name,[size,fan]] of Object.entries(shapes())){const w=new Float32Array(size);if(name==='iv')w.fill(.5);if(fan){const std=Math.sqrt(2/fan)*(name==='dw'||name==='cw'||name==='iw'?.7:1);for(let i=0;i<size;i++)w[i]=gaussian(r)*std;}p[name]=w;}return p;}
export const zerosLike=p=>Object.fromEntries(Object.entries(p).map(([k,v])=>[k,new Float32Array(v.length)]));
export const cloneParams=p=>Object.fromEntries(Object.entries(p).map(([k,v])=>[k,Float32Array.from(v)]));
export const countParams=p=>Object.values(p).reduce((s,v)=>s+v.length,0);

// 卷积按“输出通道 × 输入通道 × 卷积核位置”展开，内层是连续内存上的乘加，避免逐点边界判断。
function conv(x,cin,T,w,b,cout,k){const y=new Float32Array(cout*T),pad=(k-1)>>1;for(let o=0;o<cout;o++){const yo=o*T;y.fill(b[o],yo,yo+T);for(let c=0;c<cin;c++){const xo=c*T,wo=(o*cin+c)*k;for(let j=0;j<k;j++){const wv=w[wo+j],shift=j-pad,t0=Math.max(0,-shift),t1=Math.min(T,T-shift),base=xo+shift;for(let t=t0;t<t1;t++)y[yo+t]+=wv*x[base+t];}}}return y;}
function convBack(dy,x,cin,T,w,cout,k,dw,db,needDx){const pad=(k-1)>>1,dx=needDx?new Float32Array(cin*T):null;for(let o=0;o<cout;o++){const yo=o*T;let sb=0;for(let t=0;t<T;t++)sb+=dy[yo+t];db[o]+=sb;for(let c=0;c<cin;c++){const xo=c*T,wo=(o*cin+c)*k;for(let j=0;j<k;j++){const shift=j-pad,t0=Math.max(0,-shift),t1=Math.min(T,T-shift),base=xo+shift,wv=w[wo+j];let acc=0;for(let t=t0;t<t1;t++)acc+=dy[yo+t]*x[base+t];dw[wo+j]+=acc;if(dx)for(let t=t0;t<t1;t++)dx[base+t]+=dy[yo+t]*wv;}}}return dx;}
function relu(a){const r=new Float32Array(a.length);for(let i=0;i<a.length;i++)r[i]=a[i]>0?a[i]:0;return r;}
function pool2(x,C,T){const H=T>>1,y=new Float32Array(C*H),idx=new Int32Array(C*H);for(let c=0;c<C;c++)for(let t=0;t<H;t++){const i=c*T+2*t,j=i+1,m=x[j]>x[i]?j:i;y[c*H+t]=x[m];idx[c*H+t]=m;}return {y,idx};}

// 编码器前向；keep=true 时保留反向传播所需的中间结果。
export function encode(p,x,keep=false){
 let h=x,T=ARCH.length;const cache=[];
 ARCH.conv.forEach(([cin,cout,k,pool],i)=>{const a=conv(h,cin,T,p[`c${i}w`],p[`c${i}b`],cout,k),r=relu(a);const layer={input:h,a,cin,cout,k,T};if(pool){const q=pool2(r,cout,T);layer.idx=q.idx;h=q.y;T=T>>1;}else h=r;layer.output=h;cache.push(layer);});
 const C=ARCH.conv.at(-1)[1],feat=new Float32Array(2*C),maxIdx=new Int32Array(C);
 for(let c=0;c<C;c++){let s=0,m=-Infinity,mi=0;for(let t=0;t<T;t++){const v=h[c*T+t];s+=v;if(v>m){m=v;mi=t;}}feat[c]=s/T;feat[C+c]=m;maxIdx[c]=mi;}
 const f=amplitude(x);return keep?{h:feat,f,cache,last:{T,C,maxIdx}}:{h:feat,f};
}
export function amplitude(x){const L=ARCH.length,o=3*L;let peak=0,sq=0;for(let i=0;i<L;i++){const v=x[o+i];if(v>peak)peak=v;sq+=v*v;}return new Float32Array([Math.log1p(peak*4),Math.log1p(Math.sqrt(sq/L)*4)]);}
export function head(p,h,f){
 const E=ARCH.embed,H=ARCH.hidden,K=ARCH.classes,e=new Float32Array(E),z=new Float32Array(K);
 for(let i=0;i<E;i++){let s=p.db[i];for(let j=0;j<H;j++)s+=p.dw[i*H+j]*h[j];e[i]=Math.tanh(s);}
 for(let k=0;k<K;k++){let s=p.cb[k];for(let i=0;i<E;i++)s+=p.cw[k*E+i]*e[i];z[k]=s;}
 let s=p.ib[0];for(let i=0;i<E;i++)s+=p.iw[i]*e[i];if(f)for(let i=0;i<f.length;i++)s+=p.iv[i]*f[i];return {e,z,s,f};
}
export function forward(p,x){const enc=encode(p,x);return {...head(p,enc.h,enc.f),h:enc.h};}
// 头部反向：dz(类别 logits 梯度)、ds(力度分数梯度) → 参数梯度，返回 dh 供编码器继续反向。
export function headBackward(p,h,out,dz,ds,g){
 const E=ARCH.embed,H=ARCH.hidden,K=ARCH.classes,de=new Float32Array(E);
 for(let k=0;k<K;k++){if(!dz[k])continue;g.cb[k]+=dz[k];for(let i=0;i<E;i++){g.cw[k*E+i]+=dz[k]*out.e[i];de[i]+=p.cw[k*E+i]*dz[k];}}
 if(ds){g.ib[0]+=ds;for(let i=0;i<E;i++){g.iw[i]+=ds*out.e[i];de[i]+=p.iw[i]*ds;}if(out.f)for(let i=0;i<out.f.length;i++)g.iv[i]+=ds*out.f[i];}
 const dh=new Float32Array(H);
 for(let i=0;i<E;i++){const du=de[i]*(1-out.e[i]*out.e[i]);if(!du)continue;g.db[i]+=du;for(let j=0;j<H;j++){g.dw[i*H+j]+=du*h[j];dh[j]+=p.dw[i*H+j]*du;}}
 return dh;
}
export function encoderBackward(p,enc,dh,g){
 const {T,C,maxIdx}=enc.last;let d=new Float32Array(C*T);
 for(let c=0;c<C;c++){const avg=dh[c]/T;for(let t=0;t<T;t++)d[c*T+t]+=avg;d[c*T+maxIdx[c]]+=dh[C+c];}
 for(let i=ARCH.conv.length-1;i>=0;i--){
  const L=enc.cache[i];let dr=d;
  if(L.idx){dr=new Float32Array(L.cout*L.T);for(let q=0;q<L.idx.length;q++)dr[L.idx[q]]+=d[q];}
  for(let q=0;q<dr.length;q++)if(L.a[q]<=0)dr[q]=0;
  d=convBack(dr,L.input,L.cin,L.T,p[`c${i}w`],L.cout,L.k,g[`c${i}w`],g[`c${i}b`],i>0);
 }
}
export function softmax(z){const m=Math.max(...z),e=Array.from(z,v=>Math.exp(v-m)),s=e.reduce((a,b)=>a+b,0);return e.map(v=>v/s);}

export class Adam {
 constructor(params,{lr=3e-3,beta1=.9,beta2=.999,eps=1e-8,decay=1e-4,names=Object.keys(params)}={}){this.p=params;this.lr=lr;this.b1=beta1;this.b2=beta2;this.eps=eps;this.decay=decay;this.names=names;this.m=zerosLike(params);this.v=zerosLike(params);this.t=0;}
 step(g,scale=1){this.t++;const c1=1-this.b1**this.t,c2=1-this.b2**this.t;for(const n of this.names){const p=this.p[n],gr=g[n],m=this.m[n],v=this.v[n],wd=n.endsWith('w')?this.decay:0;for(let i=0;i<p.length;i++){const gi=gr[i]*scale+wd*p[i];m[i]=this.b1*m[i]+(1-this.b1)*gi;v[i]=this.b2*v[i]+(1-this.b2)*gi*gi;p[i]-=this.lr*(m[i]/c1)/(Math.sqrt(v[i]/c2)+this.eps);}}}
}

export function serializeModel(model){return {format:'swingnet-v1',version:ML_VERSION,arch:ARCH,classes:CLASSES,window:WINDOW,trainedAt:model.trainedAt||new Date().toISOString(),id:model.id||null,kind:model.kind||'full',parent:model.parent||null,stream:Number(model.stream)||0,features:Number(model.features)||1,metrics:model.metrics||null,samples:model.samples||0,params:Object.fromEntries(Object.entries(model.params).map(([k,v])=>[k,float32ToBase64(v)]))};}
export function deserializeModel(data){
 if(data?.format!=='swingnet-v1')throw Error('模型格式无效。');const expected=shapes(),params={};
 for(const [name,[size]] of Object.entries(expected)){if(typeof data.params?.[name]!=='string')throw Error('模型缺少参数：'+name);const v=Float32Array.from(base64ToFloat32(data.params[name]));if(v.length!==size||!v.every(Number.isFinite))throw Error('模型参数尺寸不符：'+name);params[name]=v;}
 return {...data,params};
}
