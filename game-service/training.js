import {TRAINING_CLUBS,makeRange,practiceSettings} from '../shared/training.js';
import {simulateShot} from './physics.js';

export class Training {
 constructor(){this.settings={clubId:'iron',target:150,aim:0};this.armed=false;this.history=[];this.sequences=new Map();this.busyUntil=0;this.version=0;}
 snapshot(){const key=JSON.stringify(this.settings);if(this.guideKey!==key){this.guideKey=key;const hole=makeRange(this.settings),club=TRAINING_CLUBS.find(c=>c.id===this.settings.clubId);this.powerMarks=[.25,.5,.75,1].map(power=>{const shot=simulateShot(hole,hole.tee,power,0,this.settings.aim,{club,capture:false});return {power,to:shot.to,carry:shot.carry,total:shot.travel};});}return {settings:this.settings,armed:this.armed,powerMarks:this.powerMarks,history:this.history,busyUntil:this.busyUntil,busyMs:Math.max(0,this.busyUntil-Date.now()),version:this.version};}
 configure(value,now=Date.now()){
  if(now<this.busyUntil)throw Error('请等训练球停稳后再更换球杆或目标。');
  this.settings=practiceSettings(value);this.armed=false;this.version++;
 }
 stroke(m,clientId,source,settings,now=Date.now(),rehearsal=false){
  if(!Number.isFinite(m.power)||m.power<0||m.power>1||!Number.isFinite(m.dir)||Math.abs(m.dir)>1||!Number.isSafeInteger(m.seq)||m.seq<0)throw Error('练习挥杆数据无效。');
  if(source==='phone'&&(!Number.isFinite(m.peak)||m.peak<0||m.peak>10000))throw Error('手机角速度数据无效。');
  if(m.seq<=(this.sequences.get(clientId)??-1))throw Error('这一杆已经收到，请开始下一次挥杆。');
  if(now<this.busyUntil)throw Error('训练球还在运动，请稍候再挥杆。');
  const club=TRAINING_CLUBS.find(c=>c.id===this.settings.clubId),hole=makeRange(this.settings);
  const shot=simulateShot(hole,hole.tee,m.power,m.dir,this.settings.aim,{club,capture:false});
  const {path,...summary}=shot;
  const back=source==='phone'&&Number.isFinite(m.backswingMs)&&m.backswingMs>=60&&m.backswingMs<=1800?m.backswingMs:null;
  const down=source==='phone'&&Number.isFinite(m.downswingMs)&&m.downswingMs>=45&&m.downswingMs<=1800?m.downswingMs:null;
  const lateral=shot.to.x,longitudinal=shot.to.z-this.settings.target,targetError=Math.hypot(lateral,longitudinal);
  const tolerance=Math.max(2,this.settings.target*.06);
  const feedback=[];
  if(shot.penalty)feedback.push('球已离开训练区，以下偏差按轨迹终点计算。减小瞄准角度或挥杆偏转后再试。');
  const model=source==='phone'&&m.detector==='model';
  if(Math.abs(lateral)>tolerance)feedback.push(`落点偏${lateral<0?'左':'右'} ${Math.abs(lateral).toFixed(1)} 米。${model?'方向以你最近几杆的习惯起杆朝向为零点，保持同样的握姿起杆即可打直':'先让握持姿势回到校准零点'}；若小幅偏转就偏得很多，可降低方向灵敏度。`);
  else feedback.push('方向进入目标走廊，保持当前握持起点。');
  if(Math.abs(longitudinal)>tolerance)feedback.push(`${longitudinal<0?'短了':'长了'} ${Math.abs(longitudinal).toFixed(1)} 米。${m.power>=.98&&longitudinal<0?'力量已接近上限，尝试换用更长的球杆。':longitudinal<0?'逐步增加挥杆幅度或力量灵敏度，再比较落点。':'先减小挥杆幅度；若持续打长，可降低力量灵敏度。'}`);
  else feedback.push('距离进入目标区域，尝试连续三杆复现这个力度。');
  const tempo=back&&down?back/down:null;
  if(tempo)feedback.push(`${model?'模型估计的':'识别到的'}上杆 / 下挥时间比为 ${tempo.toFixed(2)}∶1。用相同阈值比较多杆，寻找能稳定复现的节奏。`);
  const result={...summary,id:rehearsal?null:++this.version,time:new Date(now).toISOString(),source,rehearsal,aim:this.settings.aim,clubId:club.id,target:this.settings.target,peak:source==='phone'?m.peak:null,backswingMs:back,downswingMs:down,tempo,detector:source==='phone'?(model?'model':'rule'):null,ml:model&&m.ml&&typeof m.ml==='object'?{label:typeof m.ml.label==='string'?m.ml.label.slice(0,12):null,confidence:Number.isFinite(m.ml.confidence)?m.ml.confidence:null,learned:!!m.ml.learned}:null,input:source==='phone'?settings:null,lateral,longitudinal,targetError,feedback};
  this.sequences.set(clientId,m.seq);if(this.sequences.size>200)this.sequences.delete(this.sequences.keys().next().value);
  if(!rehearsal){this.armed=false;this.history.unshift(result);this.history=this.history.slice(0,50);this.busyUntil=now+shot.duration*1000+850;}
  return {shot,report:result};
 }
}
