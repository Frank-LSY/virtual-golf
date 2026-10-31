import {BALL_RADIUS,CUP_RADIUS,PIN_RADIUS} from './ball.js';
import {clamp,heightAt,slopeAt} from './courses.js';

// 实心球纯滚动的重力分量；用非负速度收缩处理摩擦，避免停球后反向抖动。
export const ROLL_GRAVITY=9.81*5/7;
export function rollStep(v,slope,friction,dt){
 const scale=ROLL_GRAVITY/(1+slope.x*slope.x+slope.z*slope.z);
 const x=v.x-slope.x*scale*dt,z=v.z-slope.z*scale*dt,speed=Math.hypot(x,z);
 const drag=Math.max(0,1-friction*dt/(speed||1));
 return drag===0?{x:0,y:0,z:0}:{x:x*drag,y:0,z:z*drag};
}
export const CUP_LABELS={graze:'擦过洞缘',lip_out:'绕洞后弹出',rim_drop:'绕洞后落杯',drop:'落入洞杯',roll_over:'速度过快，越过洞口',pin_drop:'碰到旗杆，落入洞杯',pin_bounce:'球速太快，撞旗杆弹开',dunk:'直接落入洞杯',pin_hit:'击中旗杆'};

// 0.22 进洞手感：洞口留球更宽容——
//  · 正中进洞的速度上限 2.35 米/秒（原 1.9），偏心时缓慢降低；球心压到洞缘外侧一点（偏心 ≤ 1.12 倍洞半径）仍可能绕洞落杯；
//  · 旗杆留在洞中：正对洞心、速度偏快的球会先撞上旗杆，3.6 米/秒以内被旗杆挡下落杯，更快才会弹开。
export const CUP_CAPTURE_SPEED=2.35;
export const PIN_STOP_SPEED=3.6;
export const RIM_TOLERANCE=1.12;
export function captureLimit(q){return CUP_CAPTURE_SPEED*(1-.42*Math.min(1.2,q)**2);}
// 仅在球的实际运动段接触洞缘时响应。速度越高、入射越偏，越难被洞杯留住。
// 洞缘轨迹为有耗能、有限接触时长的游戏近似，并非完整刚体仿真。
export function cupContact(a,b,pin,v,{flagstick=true}={}){
 const speed=Math.hypot(v.x,v.z);if(speed<1e-6)return null;
 const dx=b.x-a.x,dz=b.z-a.z,rx=a.x-pin.x,rz=a.z-pin.z,A=dx*dx+dz*dz;
 const outer=CUP_RADIUS+BALL_RADIUS*.55,B=2*(rx*dx+rz*dz),C=rx*rx+rz*rz-outer*outer;
 if(!A||rx*dx+rz*dz>=0)return null;
 const disc=B*B-4*A*C;if(disc<0)return null;
 const f=C<=0?0:(-B-Math.sqrt(disc))/(2*A);if(f<0||f>1)return null;
 const x=a.x+dx*f,z=a.z+dz*f,offset=Math.abs(rx*v.z-rz*v.x)/speed,q=offset/CUP_RADIUS;
 const captured=q<RIM_TOLERANCE&&speed<captureLimit(q),pole=flagstick&&offset<PIN_RADIUS+BALL_RADIUS;
 const kind=q<.5?(captured?'drop':pole?(speed<PIN_STOP_SPEED?'pin_drop':'pin_bounce'):'roll_over'):q>1.2||speed>3?'graze':captured?'rim_drop':'lip_out';
 const sign=Math.sign((x-pin.x)*v.z-(z-pin.z)*v.x)||1;
 const arc=kind==='rim_drop'?1.5:kind==='lip_out'?clamp((1.3-q)*3.7+.35,.35,2.5):.12;
 return {kind,x,z,f,speed,outer,offset,q,sign,angle:Math.atan2(z-pin.z,x-pin.x),arc,
  duration:['drop','pin_drop','pin_bounce'].includes(kind)?0:kind==='roll_over'?.18:kind==='graze'?.14:clamp(outer*arc/Math.max(.35,speed*.55),.32,.85)};
}
// 洞口周围极浅的“漏斗”（0.22）：0.6 米以内、慢速滚动的球受到很小的向心加速度，
// 相当于洞口一圈约 3% 的内倾坡——擦着洞边的慢推更容易被留住，远处与快球几乎不受影响。
export const FUNNEL_RADIUS=.6;
export const FUNNEL_ACCEL=.32;
export function cupFunnel(p,v,pin,dt){
 const dx=pin.x-p.x,dz=pin.z-p.z,d=Math.hypot(dx,dz),speed=Math.hypot(v.x,v.z);
 if(d>=FUNNEL_RADIUS||d<CUP_RADIUS*.6||speed>2.6||speed<1e-6)return v;
 const pull=FUNNEL_ACCEL*(1-d/FUNNEL_RADIUS)*(1-speed/2.6)*dt;return {x:v.x+dx/d*pull,y:v.y,z:v.z+dz/d*pull};
}
export function sampleRim(contact,pin,u){
 const {kind,outer,arc,angle,sign}=contact;
 // 从接触点平滑进入洞缘、再返回草面；无隔空吸附或位置跳跃。
 const inward=kind==='rim_drop'?.12:kind==='lip_out'?.10:0;
 const radius=outer-inward*Math.sin(Math.PI*u),theta=angle+sign*arc*u;
 const overhang=Math.max(0,CUP_RADIUS-radius),dip=Math.min(kind==='rim_drop'?.055:.035,BALL_RADIUS-Math.sqrt(Math.max(0,BALL_RADIUS**2-overhang**2)));
 return {x:pin.x+Math.cos(theta)*radius,z:pin.z+Math.sin(theta)*radius,
  dip,theta};
}
export function puttingRead(h,ball,aim=0){
 const s=slopeAt(h,ball.x,ball.z),a=Math.atan2(h.pin.x-ball.x,h.pin.z-ball.z)+aim*Math.PI/180;
 const along=s.x*Math.sin(a)+s.z*Math.cos(a),across=s.x*Math.cos(a)-s.z*Math.sin(a);
 const rise=heightAt(h,h.pin.x,h.pin.z)-heightAt(h,ball.x,ball.z);
 return {percent:Math.hypot(s.x,s.z)*100,along:along*100,across:across*100,rise,
  pace:Math.abs(along)<.002?'前后接近平坦':along>0?'上坡 · 减速更快':'下坡 · 减速更慢',
  // 场景世界 X 在正式球局镜像；符号与玩家看到的左右一致。
  break:Math.abs(across)<.002?'侧向偏移较小':across>0?'向右弯 · 瞄准偏左':'向左弯 · 瞄准偏右'};
}
