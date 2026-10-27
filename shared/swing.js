import {clamp} from './courses.js';
export const SWING_CONFIG={version:'0.1.0',BACK_START:120,DOWN_MIN:80,HIT_DECAY:.55,IDLE_MAX:30,SWING_COOLDOWN:1500,POWER_GAMMA:1.6,DIR_FULL_SCALE:45,MAX_SHOT_ANGLE:25};
export class SwingDetector {
 constructor(config={}){this.config={...SWING_CONFIG,...config};this.reset();}
 reset(){this.state='IDLE';this.sign=0;this.peak=0;this.since=0;this.quietSince=null;this.path=['IDLE'];this.lastTime=null;}
 transition(state,time){this.state=state;this.since=time;this.path.push(state);}
 sample(velocity,direction,time){
  if(!Number.isFinite(velocity)||!Number.isFinite(direction)||!Number.isFinite(time))return null;
  if(this.lastTime!==null&&(time-this.lastTime>350||time<this.lastTime))this.reset();
  this.lastTime=time;const c=this.config,a=Math.abs(velocity);
  if(this.state==='COOLDOWN'){
   if(a<c.IDLE_MAX){if(this.quietSince===null)this.quietSince=time;}else this.quietSince=null;
   if(time-this.since>=c.SWING_COOLDOWN&&this.quietSince!==null&&time-this.quietSince>=200){this.reset();this.lastTime=time;}return null;
  }
  if(this.state!=='IDLE'&&time-this.since>1800){this.reset();this.lastTime=time;return null;}
  if(this.state==='IDLE'&&a>c.BACK_START){this.sign=Math.sign(velocity);this.direction=direction;this.backStart=time;this.path=['IDLE'];this.transition('BACK',time);}
  else if(this.state==='BACK'&&Math.sign(velocity)!==this.sign&&a>c.DOWN_MIN&&time-this.since>60){this.peak=a;this.backswingMs=time-this.backStart;this.transition('DOWN',time);}
  else if(this.state==='DOWN'){
    this.peak=Math.max(this.peak,a);
    if(a<this.peak*c.HIT_DECAY&&time-this.since>=45){this.path.push('HIT');const hit={peak:this.peak,direction:this.direction,backswingMs:this.backswingMs,downswingMs:time-this.since,path:[...this.path,'COOLDOWN'],time};this.transition('COOLDOWN',time);this.quietSince=null;return hit;}
  }return null;
 }
}
export function mapSwing(hit,calibration,config=SWING_CONFIG){return {peak:hit.peak,power:clamp(hit.peak/calibration.peakMax*(config.POWER_GAIN??1),0,1)**config.POWER_GAMMA,dir:clamp((hit.direction-calibration.dirZero)/config.DIR_FULL_SCALE*(config.DIRECTION_GAIN??1),-1,1)};}
export const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
