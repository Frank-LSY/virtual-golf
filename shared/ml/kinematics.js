// 挥杆运动学：把手机陀螺仪积分成“挥杆弧度”——绕挥杆平面法线转过的角度（上杆为正，下挥回到 0 附近，送杆为负）。
// 用于游戏里小人的实时跟随与真实回放、动作采样校准、力度档位检查。纯计算，不依赖模型，手机、电脑、服务器共用；
// 离线分析（recordingKinematics）与手机实时（LiveArc）用同一套算法，保证校准数据与实时跟随一致。
import {qmul,qmat} from './signal.js';

export const ARC=Object.freeze({
 still:28,        // 低于此角速度（°/s）且加速度接近 1 g 视为静止
 stillMs:260,     // 静止多久算“站定”
 startRate:40,    // 站定后角速度超过此值开始上杆
 minBack:8,       // 上杆弧度低于此值时的回摆不算下挥
 dropRatio:.15,   // 弧度从上杆最高点回落超过 max(8°, 15%) 才确认进入下挥（过滤上杆途中的抖动）
 homeTol:16,      // 回到站位：重力方向与站位时相差小于此角度
 holdMs:3000,     // 停在站位以外超过 3 秒，认为离开了击球准备（小人回到站位）
 maxMotionMs:6000,// 连续动作超过 6 秒仍未停稳则重新开始
 traceHz:25       // 回放轨迹采样率
});
// 小人姿势 u：0 = 站位，正值上杆（u = 力度档位 / 5：膝 .2、腰 .4、胸 .6、肩 .8、完整上杆 1），负值送杆（-1 = 收杆）。
export const POSE_U=Object.freeze({address:0,knee:.2,waist:.4,chest:.6,shoulder:.8,top:1,finish:-1});
// 未校准时“手机弧度 → 小人姿势”的参考点（°，按 0.19 的真实录音估计，竖握）。
export const DEFAULT_ARC=Object.freeze({
 swing:Object.freeze([[0,0],[30,.2],[60,.4],[90,.6],[125,.8],[170,1]]),
 putt:Object.freeze([[0,0],[8,.2],[16,.4],[24,.6],[33,.8],[45,1]]),
 finish:Object.freeze({swing:110,putt:45})
});
const round1=v=>Math.round(v*10)/10;
const unit=v=>{const l=Math.hypot(...v);return l>1e-9?v.map(x=>x/l):null;};

// ---------- 逐帧估计（手机实时与离线分析共用） ----------
// 站定时记下重力方向并把姿态清零；上杆时累积“站位参考系里的角速度向量”，它的方向就是挥杆平面法线、长度就是上杆弧度；
// 弧度从最高点明显回落后冻结法线，继续沿法线积分到送杆；停稳后若手机回到站位方向，弧度归零。
export class LiveArc{
 constructor(opts={}){this.o={...ARC,...opts};this.reset();}
 reset(){this.mode='idle';this.q=[1,0,0,0];this.cum=[0,0,0];this.n=null;this.nTop=null;this.arc=0;this.top=0;this.low=0;this.topAt=null;this.lowAt=null;this.stillSince=null;this.lastT=null;this.lastG=null;this.home=null;this.motionStart=null;this.holdSince=null;this.holdFromBack=false;this.history=[];}
 rotate(g){const R=qmat(this.q);return [R[0]*g[0]+R[1]*g[1]+R[2]*g[2],R[3]*g[0]+R[4]*g[1]+R[5]*g[2],R[6]*g[0]+R[7]*g[1]+R[8]*g[2]];}
 anchorHome(a){const u=unit(a)||[0,0,1];this.home=this.home?unit(this.home.map((v,i)=>v*.8+u[i]*.2)):u;this.q=[1,0,0,0];this.cum=[0,0,0];this.n=null;this.nTop=null;this.arc=0;this.top=0;this.low=0;this.topAt=null;this.lowAt=null;this.motionStart=null;this.holdSince=null;this.history=[];}
 atHome(a){if(!this.home)return false;const u=unit(a);if(!u)return false;const c=u[0]*this.home[0]+u[1]*this.home[1]+u[2]*this.home[2];return Math.acos(Math.max(-1,Math.min(1,c)))*180/Math.PI<this.o.homeTol;}
 begin(t){this.mode='back';this.motionStart=t;this.history=[{t,arc:0}];}
 push(t,g,a){
  const o=this.o,w=Math.hypot(g[0],g[1],g[2]),am=Math.hypot(a[0],a[1],a[2]),dt=this.lastT===null?0:Math.min(.05,Math.max(0,(t-this.lastT)/1000));this.lastT=t;
  // 中点角速度：先转到当前姿态的参考系，再更新姿态（设备 → 站位参考系）。
  const gm=this.lastG?[(g[0]+this.lastG[0])/2,(g[1]+this.lastG[1])/2,(g[2]+this.lastG[2])/2]:g;this.lastG=g;const wr=this.rotate(gm);
  const k=Math.PI/180,wx=gm[0]*k,wy=gm[1]*k,wz=gm[2]*k,mag=Math.hypot(wx,wy,wz),th=mag*dt;
  if(th>1e-9){const s=Math.sin(th/2)/mag;this.q=qmul(this.q,[Math.cos(th/2),wx*s,wy*s,wz*s]);const l=Math.hypot(...this.q);this.q=this.q.map(v=>v/l);}
  const still=w<o.still&&Math.abs(am-9.81)<1.3;if(still)this.stillSince??=t;else this.stillSince=null;const settled=this.stillSince!==null&&t-this.stillSince>=o.stillMs;
  if(this.mode==='idle'){if(settled){this.mode='address';this.anchorHome(a);}return this.output(t);}
  if(this.mode==='address'){if(still){this.anchorHome(a);return this.output(t);}if(w<o.startRate)return this.output(t);this.begin(t);}
  if(this.mode==='hold'){
   if(settled){if(this.atHome(a)&&Math.abs(this.arc)<70){this.mode='address';this.anchorHome(a);return this.output(t);}if(t-this.holdSince>o.holdMs){this.mode='idle';this.arc=0;this.history=[];return this.output(t);}}
   else if(!still){const rate=this.n?wr[0]*this.n[0]+wr[1]*this.n[1]+wr[2]*this.n[2]:0;this.mode=this.holdFromBack&&rate>0?'back':this.arc>0?'down':'follow';this.holdSince=null;}
  }
  if(this.mode==='back'){
   for(let i=0;i<3;i++)this.cum[i]+=wr[i]*dt;const len=Math.hypot(...this.cum);
   if(len>=this.top){this.top=len;this.nTop=unit(this.cum);this.topAt=t;}
   this.arc=len;
   const drop=Math.max(o.minBack,this.top*o.dropRatio);
   if(this.top>=o.minBack&&this.nTop&&len<this.top-drop){this.n=this.nTop;this.arc=this.cum[0]*this.n[0]+this.cum[1]*this.n[1]+this.cum[2]*this.n[2];this.mode='down';}
  }else if(this.mode==='down'||this.mode==='follow'){
   this.arc+=(wr[0]*this.n[0]+wr[1]*this.n[1]+wr[2]*this.n[2])*dt;this.mode=this.arc>0?'down':'follow';
   if(this.arc<this.low){this.low=this.arc;this.lowAt=t;}
  }
  if((this.mode==='back'||this.mode==='down'||this.mode==='follow')&&settled){
   if(this.atHome(a)&&Math.abs(this.arc)<70){this.mode='address';this.anchorHome(a);return this.output(t);}
   this.holdFromBack=this.mode==='back';if(this.holdFromBack&&!this.n)this.n=this.nTop;this.mode='hold';this.holdSince=t;
  }
  if(this.motionStart!==null&&!settled&&t-this.motionStart>o.maxMotionMs){this.reset();return this.output(t);}
  if(this.motionStart!==null){this.history.push({t,arc:this.arc});if(this.history.length>720)this.history.shift();}
  return this.output(t);
 }
 output(t){return {t,mode:this.mode,arc:round1(this.arc),top:round1(this.top),low:round1(this.low)};}
 // 从动作开始到最近一帧的轨迹（默认 25 Hz，°）。
 trace(from=this.motionStart,hz=this.o.traceHz){return resampleHistory(this.history.filter(p=>from===null||p.t>=from),hz);}
}
export function resampleHistory(h,hz=ARC.traceHz){
 if(!h.length)return {t0:null,dt:1000/hz,arc:[]};const step=1000/hz,out=[];let j=0;
 for(let time=h[0].t;time<=h.at(-1).t+1e-6;time+=step){while(j<h.length-2&&h[j+1].t<time)j++;const a=h[j],b=h[Math.min(h.length-1,j+1)],f=b.t>a.t?Math.max(0,Math.min(1,(time-a.t)/(b.t-a.t))):0;out.push(round1(a.arc+(b.arc-a.arc)*f));}
 return {t0:h[0].t,dt:step,arc:out};
}

// 离线：把一段录音逐帧送入 LiveArc，得到上杆弧度、送杆弧度、各段时长与回放轨迹。
// anchorTime 为击球峰值时刻（流式识别的候选时刻或录音锚点），用于计算下挥与送杆时长。
export function recordingKinematics(rec,{anchorTime=null}={}){
 const live=new LiveArc(),hist=[];let top=0,topAt=null,low=0,lowAt=null,start=null,last=null,impactArc=null;
 for(let i=0;i<rec.n;i++){
  const out=live.push(rec.t[i],[rec.g[i*3],rec.g[i*3+1],rec.g[i*3+2]],[rec.a[i*3],rec.a[i*3+1],rec.a[i*3+2]]),moving=['back','down','follow','hold'].includes(out.mode);last=out;
  // 只取第一段动作（站位 → 动作 → 停稳）；包含击球时刻的那一段优先。
  if(moving){if(start===null||(anchorTime!==null&&live.motionStart!==start&&live.motionStart<=anchorTime&&start<anchorTime-2500)){start=live.motionStart;hist.length=0;top=0;topAt=null;low=0;lowAt=null;}
   if(live.motionStart===start){hist.push({t:out.t,arc:out.arc});if(out.arc>top&&out.mode!=='follow'){top=out.arc;topAt=out.t;}if(out.arc<low){low=out.arc;lowAt=out.t;}}}
  if(anchorTime!==null&&impactArc===null&&rec.t[i]>=anchorTime)impactArc=out.arc;
  if(!moving&&start!==null&&hist.length&&(anchorTime===null||rec.t[i]>anchorTime))break;
 }
 if(start!==null)hist.unshift({t:start,arc:0});
 const tr=resampleHistory(hist,ARC.traceHz),ms=v=>Number.isFinite(v)?Math.round(v):null;
 return {top:round1(top),finish:round1(-low),impact:impactArc===null?null:round1(impactArc),hold:last&&last.mode==='hold'?last.arc:null,endMode:last?.mode||'idle',
  backswingMs:start!==null&&topAt!==null?ms(topAt-start):null,downswingMs:anchorTime!==null&&topAt!==null&&anchorTime>topAt?ms(anchorTime-topAt):null,followMs:anchorTime!==null&&lowAt!==null&&lowAt>anchorTime?ms(lowAt-anchorTime):null,
  startTime:start,topTime:topAt,lowTime:lowAt,trace:start!==null?tr:{t0:null,dt:1000/ARC.traceHz,arc:[]}};
}

// ---------- 弧度 → 小人姿势 ----------
// 个人校准：points 为 [[弧度, u], …]（来自“动作采样”的停住弧度与各力度档位挥杆的上杆弧度中位数）；缺失时用默认参考。
export function arcCurve(calibration,kind='swing'){
 const base=kind==='putt'?DEFAULT_ARC.putt:DEFAULT_ARC.swing,points=calibration?.[kind];
 if(!Array.isArray(points)||!points.length)return base;
 const pts=points.filter(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&p[0]>0&&p[1]>0&&p[1]<=1.2).sort((a,b)=>a[1]-b[1]||a[0]-b[0]),mono=[[0,0]];
 for(const p of pts)if(p[0]>mono.at(-1)[0]+2&&p[1]>mono.at(-1)[1])mono.push(p);
 if(mono.length<2)return base;
 // 只有部分档位时，用默认曲线按比例补齐到 u = 1。
 const last=mono.at(-1);if(last[1]<1){const ref=base.find(p=>p[1]>=last[1])||base.at(-1),scale=last[0]/Math.max(1,ref[0]);for(const p of base)if(p[1]>last[1]+1e-6)mono.push([p[0]*scale,p[1]]);}
 return mono;
}
export function arcToPose(arc,{kind='swing',calibration=null,curve=null}={}){
 if(!Number.isFinite(arc))return 0;
 if(arc<0){const ref=Number(calibration?.finish?.[kind])||DEFAULT_ARC.finish[kind]||110;return -Math.min(1.05,-arc/ref);}
 const c=curve||arcCurve(calibration,kind);let i=1;while(i<c.length-1&&arc>c[i][0])i++;const [x0,y0]=c[i-1],[x1,y1]=c[i];
 return Math.max(0,Math.min(1.1,y0+(y1-y0)*(arc-x0)/Math.max(1e-6,x1-x0)));
}
// 由 25 Hz 弧度轨迹得到小人姿势轨迹（保留 3 位小数，便于传输）。
export const traceToPose=(trace,opts)=>trace.map(a=>Math.round(arcToPose(a,opts)*1000)/1000);
