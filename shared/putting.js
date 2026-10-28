import {BALL_RADIUS,CUP_RADIUS} from './ball.js';
import {clamp,heightAt,slopeAt} from './courses.js';

// 实心球纯滚动的重力分量；用非负速度收缩处理摩擦，避免停球后反向抖动。
export const ROLL_GRAVITY=9.81*5/7;
export function rollStep(v,slope,friction,dt){
 const scale=ROLL_GRAVITY/(1+slope.x*slope.x+slope.z*slope.z);
 const x=v.x-slope.x*scale*dt,z=v.z-slope.z*scale*dt,speed=Math.hypot(x,z);
 const drag=Math.max(0,1-friction*dt/(speed||1));
 return drag===0?{x:0,y:0,z:0}:{x:x*drag,y:0,z:z*drag};
}
export const CUP_LABELS={graze:'擦过洞缘',lip_out:'绕洞后弹出',rim_drop:'绕洞后落杯',drop:'落入洞杯',roll_over:'速度过快，越过洞口'};

// 仅在球的实际运动段接触洞缘时响应。速度越高、入射越偏，越难被洞杯留住。
// 洞缘轨迹为有耗能、有限接触时长的游戏近似，并非完整刚体仿真。
export function cupContact(a,b,pin,v){
 const speed=Math.hypot(v.x,v.z);if(speed<1e-6)return null;
 const dx=b.x-a.x,dz=b.z-a.z,rx=a.x-pin.x,rz=a.z-pin.z,A=dx*dx+dz*dz;
 const outer=CUP_RADIUS+BALL_RADIUS*.45,B=2*(rx*dx+rz*dz),C=rx*rx+rz*rz-outer*outer;
 if(!A||rx*dx+rz*dz>=0)return null;
 const disc=B*B-4*A*C;if(disc<0)return null;
 const f=C<=0?0:(-B-Math.sqrt(disc))/(2*A);if(f<0||f>1)return null;
 const x=a.x+dx*f,z=a.z+dz*f,offset=Math.abs(rx*v.z-rz*v.x)/speed,q=offset/CUP_RADIUS;
 const captured=q<1&&speed<1.9*(1-.55*q*q);
 const kind=q<.5?(captured?'drop':'roll_over'):q>1.13||speed>2.7?'graze':captured?'rim_drop':'lip_out';
 const sign=Math.sign((x-pin.x)*v.z-(z-pin.z)*v.x)||1;
 const arc=kind==='rim_drop'?1.5:kind==='lip_out'?clamp((1.25-q)*3.7+.35,.35,2.5):.12;
 return {kind,x,z,f,speed,outer,sign,angle:Math.atan2(z-pin.z,x-pin.x),arc,
  duration:kind==='drop'?0:kind==='roll_over'?.18:kind==='graze'?.14:clamp(outer*arc/Math.max(.35,speed*.55),.32,.85)};
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
