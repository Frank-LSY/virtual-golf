import {SwingDetector} from './swing.js';
const axes=['alpha','beta','gamma'],clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const CALIBRATION_STEPS={axis:'02 找到挥杆方向',light:'03 轻挥采样',full:'03 舒适大幅采样',verify:'04 复现中等力度',review:'校准完成'};
export class GuidedCalibration {
 constructor({dirZero=0,noise=0}={}){this.dirZero=dirZero;this.noise=noise;this.phase='axis';this.axis='beta';this.collecting=false;this.message='横握手机，慢慢上杆，再沿原路回摆。点击开始后只做一次。';this.verifications=[];this.attempts=[];}
 begin(now){this.collecting=true;this.started=now;this.lastAt=now;this.energy={alpha:0,beta:0,gamma:0};this.detectors=Object.fromEntries(axes.map(k=>[k,new SwingDetector({BACK_START:40,DOWN_MIN:27,IDLE_MAX:25})]));this.message=this.phase==='verify'?'对准 50% 目标带，做一次中等幅度挥杆。':'慢慢上杆 → 顺势下挥 → 回到静止。';}
 retry(){this.collecting=false;this.message='准备好后点击开始，再做一次。';}
 redoPower(){this.phase='light';this.verifications=[];this.collecting=false;this.message='重新采样轻挥，保留已经确认的握姿与感应轴。';}
 sample(raw,dir,now){
  if(!this.collecting)return null;if(now-this.lastAt>350||now<this.lastAt){this.retry();this.message='数据中断了，这次不计。保持页面在前台，再开始。';return {rejected:true};}this.lastAt=now;
  if(now-this.started>7000){const max=Math.max(...Object.values(this.energy));this.retry();this.message=max<200?'还没有识别到完整动作。先慢慢抬起，再沿原路挥回。':'只识别到部分动作。先上杆，再反向下挥，最后停稳。';return {rejected:true};}
  for(const k of axes)this.energy[k]+=Math.abs(raw[k]||0);
  const candidates=axes.map(k=>({axis:k,hit:this.detectors[k].sample(raw[k]||0,dir,now)})).filter(c=>c.hit);if(!candidates.length)return null;
  const dominant=axes.toSorted((a,b)=>this.energy[b]-this.energy[a]),candidate=candidates.find(c=>c.axis===(this.phase==='axis'?dominant[0]:this.axis));if(!candidate)return null;
  const hit=candidate.hit;this.collecting=false;
  if(hit.peak<80||hit.backswingMs<100||hit.backswingMs+hit.downswingMs<220){this.message='这次动作太短或太轻，没有采用。请缓慢上杆，再顺势挥回。';return {rejected:true};}
  if(this.phase==='axis'){if(this.energy[dominant[0]]<this.energy[dominant[1]]*1.3){this.message='几个方向混在一起了。保持手腕稳定，沿同一个方向再试。';return {rejected:true};}this.axis=candidate.axis;this.phase='light';this.message='方向已找到。下一步做一次小幅、轻松的完整挥杆。';return {accepted:true};}
  if(this.phase==='light'){this.light=hit.peak;this.phase='full';this.message='轻挥已记录。下一次幅度稍大，舒适挥出，不需要用力甩。';return {accepted:true};}
  if(this.phase==='full'){
   if(hit.peak<this.light*1.35){this.message='两次力度太接近，暂不保存。请增加一点挥幅，或重新采样更轻的一杆。';return {rejected:true};}
   this.full=hit.peak;this.gamma=clamp(Math.log(.25/.8)/Math.log(this.light/this.full),1,3);this.peakMax=this.full/Math.pow(.8,1/this.gamma);this.threshold=clamp(this.light*.35,40,180);this.phase='verify';this.message='力度范围已建立。用两次中等挥幅，把力量落在 50% 附近。';return {accepted:true};
  }
  if(this.phase==='verify'){
   const power=clamp(hit.peak/this.peakMax,0,1)**this.gamma,offset=((hit.direction-this.dirZero+540)%360)-180;this.attempts.push({power,offset});this.attempts=this.attempts.slice(-6);
   if(power<.35||power>.65||Math.abs(offset)>15){this.verifications=[];this.message=Math.abs(offset)>15?`握姿偏转 ${Math.round(Math.abs(offset))}°，先回到最初的握姿再试。`:`本次 ${Math.round(power*100)}%，${power<.35?'略增加':'稍减小'}挥幅，目标为 35%–65%。`;return {power,rejected:true};}
   this.verifications.push(power);if(this.verifications.length===2&&Math.abs(this.verifications[0]-power)>.15){this.verifications=[power];this.message='都落在目标带内，但两次差距较大。保持这次幅度，再复现一次。';return {power,rejected:true};}
   if(this.verifications.length>=2){this.phase='review';this.quality=Math.round((1-Math.abs(this.verifications[0]-power))*100);this.message=`两次为 ${this.verifications.map(p=>Math.round(p*100)+'%').join(' / ')}，已经可以复现。点击使用这组校准。`;}
   else this.message=`本次 ${Math.round(power*100)}%，进入目标带。保持同样幅度，再做一次。`;return {power,accepted:true};
  }
 }
 result(){if(this.phase!=='review')return null;return {axis:this.axis,dirZero:this.dirZero,noise:this.noise,peakMax:this.peakMax,verified:true,quality:this.quality,lightPeak:this.light,fullPeak:this.full,verifyPowers:[...this.verifications],settings:{threshold:this.threshold,gamma:this.gamma,powerGain:1}};}
}
