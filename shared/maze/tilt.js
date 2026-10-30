import {clamp,vector} from './physics.js';
const radians=degrees=>degrees*Math.PI/180;
const degrees=radians=>radians*180/Math.PI;
const wrap=x=>((x+180)%360+360)%360-180;
// Rotation-independent screen axes. Y is down on the computer's fixed board.
export function orientationGravity(beta,gamma){
  const b=radians(beta),g=radians(gamma);
  return {x:-Math.cos(b)*Math.sin(g),y:Math.sin(b),z:Math.cos(b)*Math.cos(g)};
}
export function screenTilt(gravity,angle=0){
  if(!gravity||![gravity.x,gravity.y,gravity.z,angle].every(Number.isFinite))return null;
  const {x,y,z}=gravity;if(Math.hypot(x,y,z)<.1)return null;
  const a=radians(angle),sx=-x*Math.cos(a)+y*Math.sin(a),sy=y*Math.cos(a)+x*Math.sin(a);
  return {x:degrees(Math.atan2(sx,z)),y:degrees(Math.atan2(sy,z))};
}
export class TiltMapper {
  constructor(){this.reset();}
  reset(){this.baseline=null;this.samples=[];this.filtered={x:0,y:0};this.value={x:0,y:0};this.lastTime=null;this.angle=null;this.progress=0;}
  sample(gravity,time,screenAngle=0){
    const raw=screenTilt(gravity,screenAngle);if(!raw||!Number.isFinite(time))return null;
    let changed=false;
    if(this.angle!==null&&screenAngle!==this.angle){this.reset();changed=true;}
    if(this.lastTime!==null&&(time-this.lastTime>400||time<this.lastTime)){this.reset();changed=true;}
    const dt=this.lastTime===null?16:Math.max(0,time-this.lastTime);this.lastTime=time;this.angle=screenAngle;
    if(!this.baseline){
      const last=this.samples.at(-1),first=this.samples[0];if(last&&(Math.hypot(wrap(raw.x-last.x),wrap(raw.y-last.y))>1.5||Math.hypot(wrap(raw.x-first.x),wrap(raw.y-first.y))>2.5))this.samples=[];
      this.samples.push({...raw,t:time});const elapsed=time-this.samples[0].t;this.progress=Math.min(1,elapsed/600);
      if(elapsed<600||this.samples.length<10)return {ready:false,progress:this.progress,changed,x:0,y:0};
      const mean=axis=>{const values=this.samples.map(p=>radians(p[axis]));return degrees(Math.atan2(values.reduce((s,a)=>s+Math.sin(a),0),values.reduce((s,a)=>s+Math.cos(a),0)));};
      this.baseline={x:mean('x'),y:mean('y')};this.samples=[];this.filtered={x:0,y:0};
    }
    const alpha=1-Math.exp(-Math.min(dt,80)/90);
    this.filtered.x+=wrap(raw.x-this.baseline.x-this.filtered.x)*alpha;this.filtered.y+=wrap(raw.y-this.baseline.y-this.filtered.y)*alpha;
    const magnitude=Math.hypot(this.filtered.x,this.filtered.y),amount=Math.pow(clamp((magnitude-1.5)/16.5,0,1),1.25);
    this.value=magnitude>0?vector(this.filtered.x/magnitude*amount,this.filtered.y/magnitude*amount):{x:0,y:0};
    return {ready:true,progress:1,changed,...this.value,offset:{...this.filtered}};
  }
}
