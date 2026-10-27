const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

// 有限角度的相对观察：静止时缓慢回中，断流后归零，不累积无限漂移。
export class MotionView {
 constructor(){this.reset();}
 reset(){this.yaw=0;this.pitch=0;this.targetYaw=0;this.targetPitch=0;this.lastAt=null;}
 sample(t,now){
  if(t.stage!=='ready'||!['alpha','beta','gamma'].every(k=>Number.isFinite(t[k]))){this.reset();return;}
  const dt=this.lastAt===null||now-this.lastAt>1800?.08:clamp((now-this.lastAt)/1000,0,.15);this.lastAt=now;
  const velocity=n=>Math.abs(n)<6?0:clamp(n,-90,90)*Math.PI/180;
  this.targetYaw=clamp(this.targetYaw*Math.exp(-dt*.7)+velocity(t.alpha+t.gamma*.35)*dt*.65,-.42,.42);
  this.targetPitch=clamp(this.targetPitch*Math.exp(-dt*.9)+velocity(t.beta)*dt*.4,-.18,.18);
 }
 update(dt,now){
  if(this.lastAt===null||now-this.lastAt>1800){this.targetYaw=0;this.targetPitch=0;}
  const f=1-Math.exp(-Math.max(0,dt)*6);this.yaw+=(this.targetYaw-this.yaw)*f;this.pitch+=(this.targetPitch-this.pitch)*f;
 }
}
