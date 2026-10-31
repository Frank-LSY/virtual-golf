import {CLUBS} from '../shared/clubs.js';
import {Connection} from '../shared/connection.js';
import {chineseLog,chineseCsv} from '../shared/locale.js';
import {INPUT_DEFAULTS,inputSettings} from '../shared/training.js';
import {MotionRecorder,TrialSegmenter,sampleId,ML_LABEL_TIPS} from './ml-recorder.js';
import {encodeRecording} from '../shared/ml/codec.js';
import {deserializeModel} from '../shared/ml/net.js';
import {predictWindow,motionCalibration} from '../shared/ml/adapt.js';
import {withAdapter,deserializeHead} from '../shared/ml/personal.js';
import {resample,findAnchor,windowAt,prepareInput} from '../shared/ml/signal.js';
import {CLASS_NAMES,CLASSES,SWING_CLASSES,LEVELS,LEVEL_NAMES,levelText,deviceLabel} from '../shared/ml/labels.js';
import {LiveArc,arcCurve,arcToPose,traceToPose,recordingKinematics} from '../shared/ml/kinematics.js';
import {StreamDetector,streamPower,streamDecision,heuristicDecision,STREAM} from '../shared/ml/stream.js';
import {motionSVG,gripSVG,GRIP_TIPS,GRIPS,MOTION_TIPS} from '../shared/ml/illustrations.js';
// 手机球杆：不再需要握姿归零与引导校准。启用体感即可挥杆——有模型时用模式识别，没有时用免校准规则；
// 力度区间、方向习惯都从这个人在这台手机上的挥杆中自动学习。
// 0.20：手机同时实时估计“挥杆弧度”，按个人动作校准换算成小人的姿势发给电脑，小人实时跟随并按真实轨迹回放。
const $=id=>document.getElementById(id),conn=new Connection('phone');
let stage='intro',playMode='play',lastSample=0,lastUI=0,latestRaw={alpha:0,beta:0,gamma:0},enabled=false,online=false,locked=true,wakeLock=null,seq=Number(localStorage.getItem('swinglink-phone-seq')||sessionStorage.getItem('swinglink-phone-seq')||0),stateVersion=-1,gamePhase='lobby',logs=[],sampleCount=0,sampleStart=0;
let mazeActive=false;
let identity=null,practiceSelected=true,roundCanControl=true,activeOwner='';
let settings={...INPUT_DEFAULTS},practiceActive=false,practiceArmed=false,stream=false,roundStream=false,roundActive=false,roundArmed=false,previousMode='play',practiceBusyUntil=0,practiceTimer,lastTelemetry=0,hz=0;
try{settings=inputSettings(JSON.parse(localStorage.getItem('swinglink-input-settings')));}catch{}
// 传感器缓冲与流式识别器（模型或免校准规则共用同一套候选峰值）。
const recorder=new MotionRecorder(),det=new StreamDetector({buffer:recorder}),arcLive=new LiveArc();
let arcState={mode:'idle',arc:0,top:0},arcCurves={swing:null,putt:null},motionCal=null,lastPoseSent=0;
let mlPersonal=null,mlBase=null,mlAdapter=null,mlTraining=false,mlTrial=null,trialKey='',segmenter=null,review=null,reviewTimer=null,mlModel=null,mlProfile=null,mlFallback=null,mlShadow=true,mlHzSent=0,lastPlaySample=null,mlUploading=false,mlLastW=0,mlLastA=9.81;
let mlSettings={shadow:true,detector:'model',threshold:STREAM.threshold},activeDetector='rule',detectorReason='',statusSent='',ruleHits=[],lastModelHit=0,lastCandidateAt=0,pendingNear=null,lastDecision=null,lastRoll=null;
let deviceName='',grip='vertical';try{deviceName=localStorage.getItem('swinglink-device-name')||'';grip=localStorage.getItem('swinglink-grip')==='horizontal'?'horizontal':'vertical';}catch{}
const autoDevice=()=>deviceLabel(navigator.userAgent||''),currentDevice=()=>deviceName||autoDevice();
applySettings(settings);
try{logs=JSON.parse(localStorage.getItem('swinglink-logs'))||[];if(!Array.isArray(logs))logs=[];}catch{}
$('phone-club').innerHTML='<option value="auto">自动推荐</option>'+CLUBS.map(c=>`<option value="${c.id}">${c.name} · ${c.range} 米</option>`).join('');
$('phone-club').onchange=()=>{if(online&&roundActive&&roundCanControl&&gamePhase==='playing')conn.send({type:'round_club',clubId:$('phone-club').value,stateVersion});};
// 0.22 手机遥控：调整击球方向（每次 1°，按住连续调整）、切换与转动大屏镜头。手机挥杆仍保留“未准备 = 试挥”。
let roundAim=0,aimLocalUntil=0;
function aimText(v){return v===0?'正前方':`${Math.abs(v)}° ${v<0?'左':'右'}`;}
function canAim(){return online&&roundActive&&roundCanControl&&!practiceActive&&gamePhase==='playing';}
function canCamera(){return online&&roundActive&&roundStream&&!practiceActive;}
function nudgeAim(step){if(!canAim())return false;const next=step===0?0:Math.max(-80,Math.min(80,roundAim+step));if(next===roundAim&&step!==0)return false;roundAim=next;aimLocalUntil=Date.now()+450;$('prp-aim-value').textContent=aimText(roundAim);conn.send({type:'round_aim',aim:roundAim});return true;}
function cameraSend(action){if(!canCamera())return false;conn.send({type:'round_camera',action});return true;}
// 按住重复：先触发一次，350 毫秒后每 120 毫秒重复，松手或移出按钮即停止。
function holdRepeat(id,fn){const b=$(id);let timer=null,held=false;const stop=()=>{held=false;clearTimeout(timer);timer=null;};const loop=()=>{if(!held)return;fn(true);timer=setTimeout(loop,120);};b.onpointerdown=e=>{e?.preventDefault?.();held=true;fn(false);timer=setTimeout(loop,350);};b.onpointerup=stop;b.onpointerleave=stop;b.onpointercancel=stop;b.onclick=e=>{if(!e||e.detail===0)fn(false);};}
holdRepeat('prp-aim-left',repeat=>nudgeAim(repeat?-2:-1));holdRepeat('prp-aim-right',repeat=>nudgeAim(repeat?2:1));$('prp-aim-reset').onclick=()=>nudgeAim(0);
for(const [id,action] of [['prp-cam-up','up'],['prp-cam-down','down'],['prp-cam-left','left'],['prp-cam-right','right'],['prp-cam-in','in'],['prp-cam-out','out']])holdRepeat(id,()=>cameraSend(action));
$('prp-cam-reset').onclick=()=>cameraSend('reset');for(const mode of ['follow','overview','cup'])$('prp-view-'+mode).onclick=()=>cameraSend('view-'+mode);
function warn(text){$('sensor-warning').textContent=text;$('sensor-warning').classList.toggle('hidden',!text);}
function saveLogs(){logs=logs.slice(0,50);localStorage.setItem('swinglink-logs',JSON.stringify(logs));$('log-count').textContent=`已在这台手机保存 ${logs.length} / 50 条记录。`;}
saveLogs();
async function keepAwake(){if(!navigator.wakeLock){$('wake-status').textContent='○ 此设备不支持屏幕常亮';return;}try{wakeLock=await navigator.wakeLock.request('screen');$('wake-status').textContent='● 屏幕常亮已开启';wakeLock.addEventListener('release',()=>{$('wake-status').textContent='○ 屏幕常亮已暂停';});}catch{$('wake-status').textContent='○ 请手动保持屏幕常亮';}}
function setStage(){$('phone-main').dataset.stage=stage;}

// ---------- 个人习惯：力度参考、方向零点（按人、按动作类别保存在本机） ----------
const habitKey=(kind,label)=>`swinglink-habit-${kind}:${identity?.name||''}:${label}`;
function habit(kind,label){try{const v=JSON.parse(localStorage.getItem(habitKey(kind,label)));return Array.isArray(v)?v.filter(Number.isFinite):[];}catch{return [];}}
function remember(kind,label,v){if(!Number.isFinite(v))return;const h=habit(kind,label);h.push(Math.round(v*10)/10);try{localStorage.setItem(habitKey(kind,label),JSON.stringify(h.slice(-30)));}catch{}}
// 规则力度：满力参考取这个人这类动作最近 30 杆角速度峰值的 90% 分位（少于 5 杆时用默认值）。
const RULE_REF={swing:900,putt:400};
function ruleRef(label){const h=habit('peak',label).sort((a,b)=>a-b);return h.length<5?RULE_REF[label]||900:Math.max(label==='putt'?120:300,h[Math.floor((h.length-1)*.9)]);}
function rulePower(label,peak){return Math.max(0,Math.min(1,Math.min(1,peak/ruleRef(label))**settings.gamma*settings.powerGain));}
// 方向：姿态解算得到每杆“起杆到击球的手腕转动角”，以最近 30 杆的平均值为习惯零点；偏离 12° 以内不影响方向，超出部分每 45° 满偏。
const ROLL_DEADZONE=12,ROLL_FULL=45;
function rollDirection(roll,label){const h=habit('roll',label),zero=h.length?h.reduce((a,b)=>a+b,0)/h.length:null;if(!Number.isFinite(roll)||zero===null)return {dir:0,zero};const dev=roll-zero,eff=Math.sign(dev)*Math.max(0,Math.abs(dev)-ROLL_DEADZONE);return {dir:Math.max(-1,Math.min(1,eff/ROLL_FULL*settings.directionGain)),zero};}
$('habit-reset').onclick=()=>{for(const kind of ['roll','peak'])for(const c of ['swing','putt','full','partial'])try{localStorage.setItem(habitKey(kind,c),'[]');}catch{}$('shot-status').textContent='方向与力度习惯已清空，接下来几杆会重新学习。';};

// ---------- 启用体感：直接就绪 ----------
$('enable').onclick=async()=>{
 try{
  if(!window.isSecureContext)return warn('体感需要受信任的 HTTPS 连接。请在电脑上打开“连接手机”，按说明完成 iPhone 设置。');
  if(typeof DeviceMotionEvent==='undefined')return warn('当前浏览器无法提供运动传感器，请用 iPhone 的 Safari 打开此页面。');
  const permission=typeof DeviceMotionEvent.requestPermission==='function'?await DeviceMotionEvent.requestPermission():'granted';
  if(permission!=='granted')return warn('体感权限未获允许。请在 Safari 的网站设置中允许运动与方向访问，重新加载后再试。');
  enabled=true;$('sensor-status').textContent='○ 正在等待体感数据';window.removeEventListener('devicemotion',onMotion);window.addEventListener('devicemotion',onMotion);keepAwake();ready();lastSample=performance.now();if(online)conn.send({type:'ml_motion',ready:true,hz:Math.round(hz)||null,device:{name:currentDevice()}});
 }catch(e){warn(`无法启用体感。请确认已允许传感器访问，然后再点一次。`);}
};
function readyInfo(){return {version:'auto',peakMax:ruleRef('swing'),dirZero:0,axis:'auto',noise:0,mode:activeDetector==='model'?'model':'auto'};}
function ready(){stage='ready';setStage();warn('');$('enable').classList.add('hidden');$('orb').classList.remove('hidden');conn.send({type:'calibrated',...readyInfo()});$('ready-controls').classList.remove('hidden');$('orb').classList.add('ready');det.reset();renderAdapt();renderReady();}
function renderReady(){if(stage!=='ready')return;const inactive=practiceActive&&!practiceSelected||roundActive&&!roundCanControl;const practiceBusy=playMode==='practice'&&Date.now()<practiceBusyUntil,waiting=playMode==='play'&&locked,active=practiceActive||roundActive,armed=practiceActive?practiceArmed:roundArmed;
 $('phone-club-picker').classList.toggle('hidden',!roundActive||practiceActive);$('phone-club').disabled=!online||!roundCanControl||gamePhase!=='playing';
 $('phone-round-pad').classList.toggle('hidden',!roundActive||practiceActive);for(const id of ['prp-aim-left','prp-aim-right','prp-aim-reset'])$(id).disabled=!canAim();for(const id of ['prp-cam-up','prp-cam-down','prp-cam-left','prp-cam-right','prp-cam-in','prp-cam-out','prp-cam-reset','prp-view-follow','prp-view-overview','prp-view-cup'])$(id).disabled=!canCamera();$('prp-aim-value').textContent=aimText(roundAim);
 // 0.23：文字只说“现在该做什么”，其余解释收进“更多设置”。
 $('title').innerHTML=gamePhase==='transferring'&&!practiceActive?'换洞中':inactive?'轮到同伴':!online?'正在恢复连接':practiceBusy||waiting?(gamePhase==='animating'||practiceBusy?'看球飞行':'等待开局'):active?(armed?'挥杆击球':'准备击球'):'随时挥杆';
 $('instruction').innerHTML=gamePhase==='transferring'&&!practiceActive?'到站后再准备下一杆。':inactive?'稍作放松，轮到你时会提示。':practiceBusy?'等球停稳。':waiting?'在电脑上开始或继续本局。':active?(armed?'下一次挥动就会击球。':'现在挥杆是试挥，不计杆数。'):'轻轻上杆，顺势挥出。';
 $('orb-label').textContent=gamePhase==='transferring'&&!practiceActive?'球车接驳中 · 暂停击球':inactive?'等待轮到这台手机':!online?'正在重新连接':practiceBusy||waiting?'等待球局就绪':active&&!armed?'试挥模式 · 不击球':'已准备 · 下一挥击球';
 const orbWaiting=(gamePhase==='transferring'&&!practiceActive)||inactive||!online||practiceBusy||waiting;if(!orbWaiting)$('orb-label').innerHTML=$('orb-label').textContent+`<br><small>${activeDetector==='model'?'模式识别':'免校准规则'}</small>`;
 $('orb').classList.toggle('waiting',orbWaiting);$('orb').classList.toggle('armed',!orbWaiting&&active&&armed);$('phone-main').dataset.state=orbWaiting?'waiting':active&&armed?'armed':'ready';
 $('phone-practice-arm').classList.toggle('hidden',!active);$('phone-practice-mode').classList.toggle('hidden',true);$('arm-main').textContent=armed?'已准备 · 挥杆！':'准备击球';$('arm-sub').textContent=armed?'点这里取消':'现在挥杆是试挥，不计杆数';$('phone-practice-arm').classList.toggle('cancel',!!armed);$('phone-main').dataset.active=active&&!orbWaiting?'1':'0';renderAdapt();renderPersonal();$('phone-practice-arm').disabled=!online||practiceBusy||waiting||inactive;$('phone-practice-mode').textContent=armed?'已准备 · 体感视角持续生效':'试挥模式 · 体感视角持续生效，不计杆数';
}
$('phone-practice-arm').onclick=()=>{if(practiceActive&&!practiceSelected||roundActive&&!roundCanControl)return;conn.send({type:practiceActive?'practice_arm':'round_arm',armed:!(practiceActive?practiceArmed:roundArmed)});};

// ---------- 传感器 ----------
function onMotion(e){
 if(mazeActive)return;
 const time=performance.now(),rr=e.rotationRate;if(!rr||!['alpha','beta','gamma'].some(k=>Number.isFinite(rr[k])))return;
 latestRaw={alpha:rr.alpha||0,beta:rr.beta||0,gamma:rr.gamma||0};lastSample=time;sampleCount++;sampleStart||=time;
 const acc=e.accelerationIncludingGravity||{},ax=Number.isFinite(acc.x)?acc.x:0,ay=Number.isFinite(acc.y)?acc.y:0,az=Number.isFinite(acc.z)?acc.z:0,g=[latestRaw.alpha,latestRaw.beta,latestRaw.gamma];recorder.push(time,g,[ax,ay,az]);mlLastW=Math.hypot(...g);mlLastA=Math.hypot(ax,ay,az);arcState=arcLive.push(time,g,[ax,ay,az]);
 if(time-sampleStart>=1000){hz=sampleCount/((time-sampleStart)/1000);sampleStart=time;sampleCount=0;if(online&&Math.abs(hz-mlHzSent)>5){conn.send({type:'ml_motion',ready:true,hz:Math.round(hz),device:{name:currentDevice()}});mlHzSent=hz;}}
 // 小人跟随：动作中每 40 毫秒、站位时每 80 毫秒发送一次姿势（u：0 站位、1 完整上杆、-1 收杆）。
 if((stream||roundStream)&&online&&!document.hidden){const u=poseNow(),moving=arcState.mode!=='address'&&arcState.mode!=='idle'||Math.abs(u)>.01;if(time-lastTelemetry>=(moving?40:80)){conn.send({type:'sensor_sample',sample:{...latestRaw,axis:'auto',detector:activeDetector,state:lastDecision?.kind||'idle',stage,tilt:lastRoll??0,hz,peakMax:ruleRef('swing'),t:Math.round(time),u:Math.round(u*1000)/1000,arc:arcState.arc,phase:arcState.mode}});lastTelemetry=time;}}
 if(time-lastUI>120){$('readout').textContent=`α ${latestRaw.alpha.toFixed(0)} · β ${latestRaw.beta.toFixed(0)} · γ ${latestRaw.gamma.toFixed(0)} °/秒 | ${hz.toFixed(0)} 次/秒`;$('sensor-status').textContent='● 传感器数据正常';lastUI=time;if(!document.hidden&&$('sensor-warning').dataset.stalled==='true'){warn('');delete $('sensor-warning').dataset.stalled;}}
 if(document.hidden)return;
 if(mlTrial){mlStep(time);return;}
 if(stage!=='ready')return;
 if((playMode==='play'&&(locked||roundActive&&!roundCanControl))||(playMode==='practice'&&(Date.now()<practiceBusyUntil||practiceActive&&!practiceSelected))){det.reset();return;}
 const r=det.push(time,g,[ax,ay,az],true);
 if(r){lastDecision=r;$('state-path').textContent=`${r.detector==='model'?'模式识别':'规则'} · ${r.kind==='swing'?'挥杆':'不是挥杆'} · ${r.decision.label==='other'?(r.rule?.reason||'非挥杆动作'):CLASS_NAMES[r.decision.label]}${r.detector==='model'?` ${Math.round(r.decision.confidence*100)}%`:''} · ${r.ms.toFixed(1)} 毫秒`;}
 if(activeDetector==='model'){
  if(r?.rule&&r.rule.label!=='other')ruleHits.push({time:r.time,label:r.rule.label,peak:r.peak,power:rulePower(r.rule.label,r.peak)});
  if(r?.kind==='swing'){lastModelHit=r.time;pendingNear=null;fireModel(r);}else if(r?.kind==='reject')noteNearMiss(r);
  checkCandidates(time);return;
 }
 if(r?.kind==='swing')fireRule(r);
}
// 发送一次挥杆，并更新手机上的力量、方向与记录。
// 这一杆的真实轨迹：从上杆开始到现在的小人姿势（25 Hz），以及击球峰值时刻，电脑据此回放下挥与击球时机。
function swingKin(r,label){const tr=arcLive.trace(),kind=label==='putt'?'putt':'swing',u=traceToPose(tr.arc,{kind,curve:curveFor(kind),calibration:motionCal});if(!tr.t0||u.length<3)return null;return {t0:Math.round(tr.t0),dt:tr.dt,u:u.slice(-120),impactAt:Math.round(r.time),now:Math.round(performance.now()),top:arcState.top,topU:Math.round(arcToPose(arcState.top,{kind,curve:curveFor(kind)})*1000)/1000};}
function sendSwing(swing,fields){
 seq++;localStorage.setItem('swinglink-phone-seq',String(seq));
 const m={type:playMode==='practice'?'test_swing':'swing',...swing,seq,stateVersion,clientTime:Date.now(),...fields};const sent=online&&conn.send(m);
 logs.unshift({...swing,playerId:identity?.id,playerName:identity?.name,phoneNumber:identity?.number,time:new Date().toISOString(),path:fields.path,backswingMs:fields.backswingMs,downswingMs:fields.downswingMs,axis:'auto',mode:playMode,sent,seq,feeling:'未标记',detector:fields.detector,ml:fields.ml||null,device:currentDevice(),grip,config:{...settings}});saveLogs();$('feeling').value='未标记';$('last-power').innerHTML=`${Math.round(swing.power*100)}<small>%</small>`;$('last-direction').textContent=`${swing.dir<0?'←':swing.dir>0?'→':''} ${Math.abs(swing.dir*25).toFixed(1)}°`;$('power-meter').style.width=swing.power*100+'%';$('dir-marker').style.left=(50+Math.max(-1,Math.min(1,swing.dir))*46)+'%';$('delivery').textContent=sent?'已识别 · 正在发送':'未发送 · 连接已断开';flash();
 return {m,sent};
}
const validMs=v=>Number.isFinite(v)&&v>=45&&v<=1800?v:null,round3=v=>Math.round(v*1000)/1000;
function rollText(roll,zero){return Number.isFinite(roll)?` · 手腕转动 ${roll>0?'+':''}${Math.round(roll)}°${zero===null?'（开始学习你的习惯）':`（习惯 ${zero>0?'+':''}${Math.round(zero)}°）`}`:'';}
function fireModel(r){
 const d=r.decision,label=d.label,{power,learned,source}=streamPower(label,r.prediction.s,mlProfile,{peak:r.peak,fallbackProfile:mlFallback,gain:settings.powerGain}),roll=r.timing.roll,{dir,zero}=rollDirection(roll,label);remember('roll',label,roll);lastRoll=roll;
 const swing={peak:Math.round(r.peak),power:round3(power),dir:round3(dir)},ml={label,confidence:round3(d.confidence),s:round3(r.prediction.s),learned,source,roll:Number.isFinite(roll)?roll:null,rollZero:zero===null?null:Math.round(zero*10)/10,modelId:mlModel.id,threshold:det.threshold,ms:Math.round(r.ms*10)/10};
 const {m}=sendSwing(swing,{path:['MODEL',label],backswingMs:validMs(r.timing.backswingMs),downswingMs:validMs(r.timing.downswingMs),detector:'model',ml,kin:swingKin(r,label)});
 $('shot-status').textContent=`模式识别：${CLASS_NAMES[label]} ${Math.round(d.confidence*100)}% · ${{personal:'力度来自你的个人映射',population:'力度暂用全体球手的总体映射',peak:'力度按角速度估算'}[source]}${rollText(roll,zero)}`;
 capture(r,swing,m,{detector:'model',stream:{...ml,power:swing.power}});
}
function fireRule(r){
 const label=r.decision.label,power=rulePower(label,r.peak),roll=r.timing.roll,{dir,zero}=rollDirection(roll,label);remember('peak',label,r.peak);remember('roll',label,roll);lastRoll=roll;
 const swing={peak:Math.round(r.peak),power:round3(power),dir:round3(dir)},rule={label,ref:Math.round(ruleRef(label)),roll:Number.isFinite(roll)?roll:null,rollZero:zero===null?null:Math.round(zero*10)/10};
 const {m}=sendSwing(swing,{path:['RULE',label],backswingMs:validMs(r.timing.backswingMs),downswingMs:validMs(r.timing.downswingMs),detector:'rule',ml:null,kin:swingKin(r,label)});
 $('shot-status').textContent=`免校准规则：${label==='putt'?'推杆':'挥杆'} · 满力参考 ${rule.ref}°/秒${rollText(roll,zero)}`;
 capture(r,swing,m,{detector:'rule',rule:{triggered:true,power:swing.power,dir:swing.dir,peak:swing.peak,axis:'auto'}});
}
function playContext(){return {mode:playMode,scope:practiceActive?'practice':roundActive?'round':'free',clubId:practiceActive?(lastPracticeClub||''):($('phone-club').value==='auto'?(lastRoundClub||''):$('phone-club').value),armed:!!(practiceActive?practiceArmed:roundArmed)};}
// 每一杆：1 秒后上传 [峰值前 2.6 秒, 峰值后 1 秒]，附带识别方式与另一种方式的对照，用于持续学习。
function capture(r,swing,message,extra){
 if(!online)return;const t=r.time,context=playContext();$('ml-shadow').classList.add('hidden');
 setTimeout(()=>{
  const rule=extra.detector==='model'?ruleHits.find(h=>Math.abs(h.time-t)<700):null;
  const up=uploadSample({source:'play',from:t-2600,to:t+1000,extra:{seq:message.seq,context,...extra,...(extra.detector==='model'?{rule:rule?{triggered:true,power:rule.power,dir:0,peak:rule.peak,axis:'auto'}:{triggered:false}}:{})}});if(up)lastPlaySample={id:up.id,seq:message.seq};
  if(!mlShadow)return;
  if(extra.detector==='model'){$('ml-shadow').textContent=rule?`规则（对照）：也会识别 · 力度 ${Math.round(rule.power*100)}%`:'规则（对照）：这一杆规则不会触发';$('ml-shadow').classList.remove('hidden');}
  else if(mlModel&&up){try{const x=prepareInput(up.rec,{features:mlModel.features||1}).x,p=predictWindow(mlModel,mlProfile,x);$('ml-shadow').textContent=`模式识别（对照）：${CLASS_NAMES[p.label]} ${Math.round(p.confidence*100)}%${p.power!==null?` · 力度 ${Math.round(p.power*100)}%`:''}`;$('ml-shadow').classList.remove('hidden');}catch{}}
 },1000);
}
// 待定动作（模式识别时）：规则触发而模型没有触发，或模型差一点触发的动作，上传待复核。
function noteNearMiss(r){const g=r.decision.probs,best=SWING_CLASSES.reduce((a,b)=>(g[b]||0)>(g[a]||0)?b:a);if(!(practiceActive||roundActive)||g[best]<.3||r.peak<100)return;if(!pendingNear||g[best]>pendingNear.p)pendingNear={time:r.time,p:g[best],label:best,s:r.prediction.s};}
function uploadCandidate(t,extra){if(t-lastCandidateAt<2500)return;lastCandidateAt=t;const context=playContext();setTimeout(()=>uploadSample({source:'candidate',from:t-2600,to:t+600,extra:{detector:'model',context,...extra}}),650);}
function checkCandidates(now){
 while(ruleHits.length&&now-ruleHits[0].time>2500)ruleHits.shift();
 const h=ruleHits.find(h=>!h.checked&&now-h.time>500);if(h){h.checked=true;if(!(lastModelHit&&Math.abs(lastModelHit-h.time)<700)){const last=det.last,near=last&&Math.abs(last.time-h.time)<600?{label:last.decision.label,confidence:round3(last.decision.confidence)}:{};uploadCandidate(h.time,{rule:{triggered:true,power:h.power,dir:0,peak:h.peak,axis:'auto'},stream:{reason:'rule',...near,threshold:det.threshold,modelId:mlModel?.id}});}}
 if(pendingNear&&now-pendingNear.time>800){const p=pendingNear;pendingNear=null;if(!(lastModelHit&&lastModelHit>=p.time-50))uploadCandidate(p.time,{stream:{reason:'near',label:p.label,confidence:round3(p.p),s:round3(p.s),threshold:det.threshold,modelId:mlModel?.id}});}
}
function flash(){$('orb').classList.add('fired');$('flash').classList.remove('go');void $('flash').offsetWidth;$('flash').classList.add('go');navigator.vibrate?.([30,40,30]);setTimeout(()=>$('orb').classList.remove('fired'),320);setTimeout(()=>$('flash').classList.remove('go'),480);}
function setMode(mode){if(playMode===mode)return;playMode=mode;document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('selected',x.dataset.mode===mode));det.reset();renderReady();}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
function applySettings(value,requestId){settings=inputSettings(value);det.o.rule={minPeak:settings.threshold};for(const [key,id] of Object.entries({threshold:'threshold',gamma:'gamma',powerGain:'phone-power-gain',directionGain:'phone-direction-gain'}))$(id).value=settings[key];localStorage.setItem('swinglink-input-settings',JSON.stringify(settings));if(online)conn.send({type:'input_settings',settings,requestId});}
function updateConfig(){try{applySettings({threshold:Number($('threshold').value),gamma:Number($('gamma').value),powerGain:Number($('phone-power-gain').value),directionGain:Number($('phone-direction-gain').value)});$('tuning-status').textContent='灵敏度已保存，并同步到电脑。';}catch(e){$('tuning-status').textContent=e.message;}}
for(const id of ['threshold','gamma','phone-power-gain','phone-direction-gain'])$(id).onchange=updateConfig;
$('feeling').onchange=()=>{if(logs[0]){logs[0].feeling=$('feeling').value;saveLogs();}if(lastPlaySample&&$('feeling').value==='误触发')conn.send({type:'ml_feedback',id:lastPlaySample.id,feeling:'误触发'});};
$('missed').onclick=()=>{logs.unshift({time:new Date().toISOString(),feeling:'漏识别',axis:'auto',sent:false,mode:playMode,detector:activeDetector});saveLogs();$('shot-status').textContent='已在记录中标记本次漏识别。';const now=recorder.latestTime();if(now&&online)uploadSample({source:'missed',from:now-5000,to:now});};
function download(format){const data=format==='json'?JSON.stringify({'识别方式':activeDetector==='model'?'模式识别':'免校准规则','灵敏度':settings,'球手':identity,'设备':currentDevice(),'握法':GRIPS[grip],'挥杆记录':logs.map(chineseLog)},null,2):chineseCsv(logs);const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type:format==='json'?'application/json':'text/csv;charset=utf-8'}));a.download=`挥杆记录.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
$('export-json').onclick=()=>download('json');$('export-csv').onclick=()=>download('csv');
document.addEventListener('visibilitychange',()=>{det.reset();if(document.hidden){if(mlTrial&&!mlTrial.paused)conn.send({type:'ml_session',action:'pause'});if(practiceActive&&practiceArmed)conn.send({type:'practice_arm',armed:false});if(roundActive&&roundArmed)conn.send({type:'round_arm',armed:false});wakeLock?.release();warn('页面进入后台后，体感已暂停。回到此页面后即可继续。');}else if(enabled){keepAwake();lastSample=performance.now();$('sensor-warning').dataset.stalled='true';}});
setInterval(()=>{if(enabled&&!document.hidden&&performance.now()-lastSample>1800){$('sensor-status').textContent='○ 尚未收到传感器数据';warn('传感器数据已中断。请保持 Safari 在前台，检查体感权限，或刷新页面重新连接。');$('sensor-warning').dataset.stalled='true';det.reset();}},1000);
conn.addEventListener('message',({detail:m})=>{
 // 电脑当前所在的游戏：顶部标签与配色跟着变；在大厅时提示“选好游戏后手机会自动切换”。
 if(m.type==='screen_view'){const names={hub:'游戏大厅',golf:'高尔夫 · 球杆',skyroll:'云端滚球 · 手柄'};document.body.dataset.game=m.game;$('game-strip').dataset.game=m.game;$('game-strip').textContent=names[m.game]||'游戏大厅';$('hub-note').classList.toggle('show',m.game==='hub');}
 if(m.type==='maze_subscription'){mazeActive=m.active===true;det.reset();arcLive.reset();if(mazeActive){wakeLock?.release();wakeLock=null;}}
 if(m.type==='player_identity'){identity=m.player;$('player-name').value=identity.name;$('player-style').value=identity.style;if(!$('ml-record-person').value)$('ml-record-person').value=identity.name||'';renderOwner();renderRecord();renderAdapt();}
 if(m.type==='calibration_request'){$('shot-status').textContent='现在不需要校准：启用体感后直接挥杆；想让识别更贴合你，可以做一次快速适应。';}
 if(m.type==='ready'){online=true;$('connection').textContent='● 已连接';$('connection').classList.add('online');conn.send({type:'input_settings',settings});if(stage==='ready')conn.send({type:'calibrated',...readyInfo()});statusSent='';refreshDetector();renderReady();}
 if(m.type==='practice_subscription'){if(practiceSelected!==(m.selected!==false))det.reset();practiceSelected=m.selected!==false;activeOwner=m.active?m.owner?.name||'':'';renderOwner();stream=m.stream;practiceArmed=!!m.armed;if(m.active!==practiceActive){practiceActive=m.active;if(m.active){previousMode=playMode;setMode('practice');}else setMode(previousMode);document.querySelector('[data-mode="play"]').disabled=m.active;}practiceBusyUntil=Date.now()+(m.busyMs||0);clearTimeout(practiceTimer);practiceTimer=setTimeout(renderReady,Math.max(0,practiceBusyUntil-Date.now())+50);lastPracticeClub=m.settings?.clubId||lastPracticeClub;renderReady();}
 if(m.type==='round_subscription'){if(roundCanControl!==(m.canControl!==false))det.reset();roundCanControl=m.canControl!==false;if(!practiceActive)activeOwner=m.active?m.playerName||'':'';roundActive=m.active;renderOwner();roundStream=m.stream;roundArmed=!!m.armed;if(m.active&&!practiceActive)setMode('play');document.querySelector('[data-mode="practice"]').disabled=m.active;renderReady();}
 if(m.type==='input_settings_request'){try{applySettings(m.settings,m.requestId);$('tuning-status').textContent='电脑调整的灵敏度已生效。';}catch(e){$('tuning-status').textContent=e.message;}}
 if(m.type==='practice_ack'||m.type==='practice_rehearsal_ack'){$('delivery').textContent=m.rehearsal?'试挥已识别 · 尚未击球':'训练场已击球';$('phone-training-label').textContent=m.rehearsal?'试挥模拟参考 · 球未击出':'本杆模拟击球反馈';$('phone-training-result').classList.remove('hidden');$('phone-training-distance').textContent=`${m.travel.toFixed(1)} 米`;$('phone-training-detail').textContent=`${m.club} · 距目标 ${m.targetError.toFixed(1)} 米 · ${Math.abs(m.lateral)<.5?'方向居中':(m.lateral<0?'偏左 ':'偏右 ')+Math.abs(m.lateral).toFixed(1)+' 米'}`;$('phone-training-tip').textContent=m.feedback.slice(0,2).join(' ');const entry=logs.find(x=>x.seq===m.seq);if(entry){entry.acknowledged=true;saveLogs();}}
 if(m.type==='room_state'&&m.state.stateVersion>=stateVersion){stateVersion=m.state.stateVersion;gamePhase=m.state.phase;$('phone-club').value=m.state.clubId||'auto';const auto=$('phone-club').options?.[0];if(auto)auto.textContent=`自动 · ${m.state.recommendedClub?.name||m.state.selectedClub?.name||'推荐球杆'}`;roundArmed=roundCanControl&&!!m.state.armed;if(Date.now()>aimLocalUntil)roundAim=Number.isFinite(m.state.aim)?m.state.aim:0;lastRoundClub=m.state?.selectedClub?.id||lastRoundClub;renderReady();}
 if(m.type==='input_lock'){locked=m.locked;renderReady();}
 if(m.type==='ack'||m.type==='rehearsal_ack'){$('delivery').textContent=m.type==='rehearsal_ack'?'试挥已接收 · 不计杆数':'已击球 · 计入本局';if(m.type==='rehearsal_ack')$('shot-status').textContent=`试挥参考 ${m.travel.toFixed(1)} 米，球仍在原位。`;const entry=logs.find(x=>x.seq===m.seq);if(entry){entry.acknowledged=true;saveLogs();}}
 if(m.type==='error'){if(mlTrial){mlResult(m.message,'retry');mlUploading=false;}else{$('shot-status').textContent=m.message;$('delivery').textContent='本次挥杆未被接受';}}
 if(m.type==='ml_collect')setTrial(m.active?m.session:null);
 if(m.type==='ml_sample_ack')mlAck(m);
 if(m.type==='ml_review')decideReview(m.decision==='save');
 // 共享模型 + 自己的个人输出头（个性化后才有）：只替换头部参数，本机推理开销不变。
 if(m.type==='ml_model'){try{mlBase=m.model?deserializeModel(m.model):null;}catch{mlBase=null;}mlAdapter=null;if(mlBase&&m.adapter?.modelId===mlBase.id){try{mlAdapter=deserializeHead(m.adapter.head,mlBase);}catch{mlAdapter=null;}}mlModel=mlAdapter?withAdapter(mlBase,mlAdapter,m.adapter.version):mlBase;if(m.personal)setPersonal(m.personal);mlProfile=m.profile||null;mlFallback=m.fallback||null;refreshMotionCal();mlSettings={...mlSettings,...(m.settings||{})};mlShadow=mlSettings.shadow!==false;$('ml-model-status').textContent=mlModel?`模型 ${mlModel.id}${mlModel.legacy?' · 旧版标签（电脑重新训练后升级）':''}${mlModel.stream?' · 支持模式识别':' · 旧版模型（需重新训练）'}${(mlModel.features||1)>=2?' · 含手腕转动补偿':''}`:'尚未部署模型';refreshDetector();renderAdapt();}
 if(m.type==='ml_settings'){mlSettings={...mlSettings,...(m.settings||{})};mlShadow=mlSettings.shadow!==false;refreshDetector();}
 if(m.type==='ml_personal')setPersonal(m);
 if(m.type==='ml_profile'){if(m.personal)setPersonal(m.personal);mlProfile=m.profile||null;mlFallback=m.fallback||mlFallback;det.profile=mlProfile;refreshMotionCal();refreshDetector();renderAdapt();}
});conn.addEventListener('offline',()=>{online=false;locked=true;$('connection').textContent='正在重新连接…';$('connection').classList.remove('online');det.reset();renderReady();});
let lastPracticeClub='',lastRoundClub='';conn.connect();
function renderOwner(){$('phone-identity').textContent=identity?`手机 ${String(identity.number).padStart(2,'0')} · ${identity.name}`:'正在分配手机编号';$('turn-owner').textContent=activeOwner?`当前控制：${activeOwner}`:'每台手机对应一位球手';}
$('save-profile').onclick=()=>{deviceName=String($('device-name').value||'').trim().slice(0,32);try{localStorage.setItem('swinglink-device-name',deviceName);}catch{}statusSent='';conn.send({type:'player_profile',name:$('player-name').value,style:$('player-style').value});refreshDetector();renderRecord();};

// ---------- 识别方式 ----------
function hasPowerMap(){const p=mlProfile?.power;return !!p&&SWING_CLASSES.some(c=>(p[c]?.recent?.length||0)>=8||Object.values(p[c]?.anchors||{}).some(a=>a.length>=2));}
// 小人姿势：按当前球杆（推杆 / 其他）与这个人的动作校准，把挥杆弧度换算成 u。
function curveFor(kind){return arcCurves[kind]||(arcCurves[kind]=arcCurve(motionCal,kind));}
function currentKind(){const club=practiceActive?lastPracticeClub:($('phone-club').value==='auto'?lastRoundClub:$('phone-club').value);return club==='putter'?'putt':'swing';}
function poseNow(){const kind=currentKind();return arcToPose(arcState.arc,{kind,curve:curveFor(kind),calibration:motionCal});}
function refreshMotionCal(){motionCal=motionCalibration(mlProfile);arcCurves={swing:null,putt:null};}
function refreshDetector(){
 const streamOk=(Number(mlModel?.stream)||0)>=1,want=mlSettings.detector==='model',next=want&&mlModel&&streamOk?'model':'rule';
 detectorReason=!want?'已选择规则识别':!mlModel?'尚未训练模型，先用免校准规则':!streamOk?'当前模型需在练习室重新完整训练，先用免校准规则':'';
 det.model=next==='model'?mlModel:null;det.profile=mlProfile;det.threshold=Number(mlSettings.threshold)||STREAM.threshold;
 const changed=next!==activeDetector;activeDetector=next;if(changed){det.reset();if(stage==='ready')conn.send({type:'calibrated',...readyInfo()});}
 $('detector-model').classList.toggle('selected',want);$('detector-rule').classList.toggle('selected',!want);
 const st=$('detector-status');st.dataset.mode=next==='model'?'model':want?'fallback':'rule';
 st.textContent=next==='model'?`模式识别 · 触发置信度 ≥ ${Math.round(det.threshold*100)}% · ${hasPowerMap()?'力度来自个人映射':mlFallback?'尚无个人力度映射，暂用总体映射':'力度先按角速度估算'}`:`免校准规则 · 力度按你最近挥杆自动定标${detectorReason&&want?' · '+detectorReason:''}`;
 if(stage==='intro')$('orb-label').textContent=next==='model'?'模式识别 · 启用体感后即可挥杆':'启用体感后即可挥杆';
 const key=`${next}|${detectorReason}|${mlModel?.id||''}|${currentDevice()}|${grip}`;if(online&&key!==statusSent){statusSent=key;conn.send({type:'ml_status',detector:next,reason:detectorReason,modelId:mlModel?.id||null,grip,device:{name:currentDevice()}});}
 renderReady();
}
$('detector-model').onclick=()=>{mlSettings.detector='model';refreshDetector();conn.send({type:'ml_detector',detector:'model'});};
$('detector-rule').onclick=()=>{mlSettings.detector='rule';refreshDetector();conn.send({type:'ml_detector',detector:'rule'});};
// 首次使用：问一次要不要录 5 次挥杆做个性化（最少 3 次）；录完服务器自动做个人迁移训练。
const adaptKey=()=>'swinglink-adapt-later:'+(identity?.name||'');
function startPersonal(){if(!enabled)return warn('请先点击“启用体感”。');conn.send({type:'ml_session',action:'start',mode:'adapt',person:identity?.name||''});}
function renderAdapt(){
 let later=false;try{later=localStorage.getItem(adaptKey())==='1';}catch{}
 // 正在打球或练习时不弹大卡片（不挤占“准备击球”），改成顶部一个小邀请标签。
 const st=mlPersonal?.status||'none',fresh=['none','no-model'].includes(st)&&!(mlPersonal?.adaptSamples>0),busy=$('phone-main').dataset.active==='1',show=stage==='ready'&&!mlTrial&&!later&&!!mlPersonal&&fresh&&!busy;$('adapt-card').classList.toggle('hidden',!show);if(!show)return;
 $('adapt-text').textContent=st==='no-model'?'录 5 次挥杆（最少 3 次），约 1 分钟。电脑完成第一次训练后会自动为你个性化。':'录 5 次挥杆（最少 3 次），约 1 分钟。录完自动为你训练。';
}
// 个性化状态小标签：只在有状态可说时显示。
function inviteNow(){let later=false;try{later=localStorage.getItem(adaptKey())==='1';}catch{}const st=mlPersonal?.status||'none';return !later&&!!mlPersonal&&['none','no-model'].includes(st)&&!(mlPersonal.adaptSamples>0)&&$('phone-main').dataset.active==='1';}
function renderPersonal(){const invite=inviteNow(),st=invite?'invite':mlPersonal?.status,chip=$('personal-chip'),text={invite:'让识别更懂你 · 录 5 次挥杆 →',ready:'✓ 已个性化',power:'✓ 已个性化（力度）',queued:'正在为你训练…',training:'正在为你训练…',waiting:'已录入 · 等电脑完成训练',stale:'模型已更新 · 正在重新个性化',failed:'个性化未完成，可在“更多设置”里重做'}[st]||'';chip.classList.toggle('hidden',!text||stage!=='ready'||!!mlTrial);chip.dataset.status=st||'none';chip.textContent=text;}
function setPersonal(p){const prev=mlPersonal?.status;mlPersonal={...p};if(['queued','training'].includes(p.status))mlTraining=true;
 if(mlTraining&&['ready','power'].includes(p.status)){mlTraining=false;$('shot-status').textContent=p.status==='ready'?'个性化完成：识别与力度已按你的挥杆调整。':'已按你的挥杆调整力度。';flash();}
 if(mlTraining&&p.status==='failed'){mlTraining=false;$('shot-status').textContent='个性化没有完成，稍后可以在“更多设置”里重做。';}
 if(prev!==p.status){renderPersonal();renderAdapt();}}
$('adapt-start').onclick=()=>startPersonal();
$('personal-chip').onclick=()=>{if($('personal-chip').dataset.status==='invite')startPersonal();};
$('personal-redo').onclick=()=>{try{localStorage.removeItem(adaptKey());}catch{}$('phone-more').open=false;startPersonal();};
$('adapt-later').onclick=()=>{try{localStorage.setItem(adaptKey(),'1');}catch{}renderAdapt();};

// ---------- 数据采集：可暂停、可跳过；太小的动作忽略，不像的动作先确认 ----------
function uploadSample({source,from,to,rec=null,extra={}}){
 rec??=recorder.slice(from,to);if(rec.n<10)return null;const id=sampleId();
 const msg={type:'ml_sample',id,source,recording:encodeRecording(rec),device:{ua:navigator.userAgent||'',hz:Math.round(hz),name:currentDevice()},grip,...extra};if(!online||!conn.send(msg))return null;return {id,rec};
}
const TRIAL_MIN_PEAK={swing:100,putt:35,other:25,pose:24};
const trialKind=t=>t?.pose&&t.pose!=='finish'?'pose':t?.label;
function setTrial(trial){
 const prevKey=trialKey;mlTrial=trial;const on=!!trial;$('ml-collect').classList.toggle('hidden',!on);$('phone-main').dataset.ml=on?'on':'off';
 if(!on){segmenter=null;trialKey='';closeReview();renderReady();renderAdapt();return;}
 trialKey=`${trial.id}|${trial.index}|${trial.paused}`;const st=trial.stats||{};
 $('ml-collect').dataset.mode=trial.mode;$('ml-person').textContent=`${{adapt:'个性化',motion:'动作采样'}[trial.mode]||'数据采集'} · ${trial.person}`;$('ml-count').textContent=`${trial.index+1} / ${trial.count}`;
 $('ml-stop').textContent=trial.mode==='adapt'?(trial.canFinish?`完成（已录 ${st.saved} 次），开始训练`:`退出（至少录 ${trial.min} 次才能训练）`):'结束本组';$('ml-stop').classList.toggle('finish',!!trial.canFinish);
 $('ml-stats').textContent=`已保存 ${st.saved||0}${st.discarded?` · 丢弃 ${st.discarded}`:''}${st.skipped?` · 跳过 ${st.skipped}`:''}${st.small?` · 忽略小动作 ${st.small}`:''}`;
 $('ml-pause').textContent=trial.paused?'继续':'暂停';
 $('ml-demo').innerHTML=motionSVG(trial.label,trial.level||3,{grip,pose:trial.pose});$('ml-label').textContent=trial.labelName;$('ml-tier').textContent=trial.pose&&trial.pose!=='finish'?'停住 1 秒':trial.level?levelText(trial.label,trial.level):'自然动作';$('ml-tier').dataset.tier=trial.pose&&trial.pose!=='finish'?'pose':trial.level?`l${trial.level}`:'none';$('ml-prompt').textContent=trial.prompt||ML_LABEL_TIPS[trialKind(trial)]||'';$('adapt-card').classList.add('hidden');
 if(trialKey===prevKey&&(segmenter||review||trial.paused))return;
 closeReview();mlUploading=false;
 if(trial.paused){segmenter=null;mlRing('paused','已暂停','可以自由活动；准备好后点“继续”');return;}
 segmenter=new TrialSegmenter({onset:trial.onset,label:trial.pose?'swing':trial.label,postRoll:0,quietMs:trial.pose?600:450});
 mlRing(enabled?'settle':'off',enabled?'保持静止':'先启用体感',enabled?'站好后保持手机不动约半秒':'点击下方“启用体感”并允许访问');
}
function mlRing(state,title,hint,extra={}){if($('ml-ring').dataset.state!==state&&online)conn.send({type:'ml_trial_state',state,...extra});$('ml-ring').dataset.state=state;$('ml-state').textContent=title;$('ml-hint').textContent=hint;}
function mlResult(text,kind='ok'){$('ml-result').textContent=text;$('ml-result').dataset.kind=kind;}
// 检查录到的动作是否像提示：挥杆类要有上杆与反向下挥（或模型认为是挥杆）；非挥杆动作不能像一次挥杆；
// 停住类动作要真的停住且没有挥下去；有个人动作校准时，上杆幅度和提示的力度档位相差太多也先请你确认。
function checkTrial(rec,trial){
 const label=trial.label,res=resample(rec),anchor=findAnchor(res,{from:Math.min(res.n-1,20)}),rule=heuristicDecision(res,anchor,{minPeak:TRIAL_MIN_PEAK[label]||100,minPuttPeak:TRIAL_MIN_PEAK.putt,stillLevel:80});let d=null;
 const kin=recordingKinematics(rec,{anchorTime:rec.t[0]+anchor*1000/res.hz});
 if(trial.pose&&trial.pose!=='finish'){if(kin.endMode!=='hold'||!(kin.hold>8))return {ok:false,reason:'没有在上杆位置停住',kin};if(rule.label!=='other')return {ok:false,reason:'这次挥下去了，停住就好',kin};return {ok:true,kin};}
 if(mlModel){try{d=streamDecision(predictWindow(mlModel,mlProfile,windowAt(res,anchor,{features:mlModel.features||1})));}catch{}}
 if(label==='other'){const swingLike=rule.label!=='other'&&(!d||d.label!=='other');return swingLike?{ok:false,reason:'这次看起来像一次挥杆',kin}:{ok:true,kin};}
 if(!(rule.label!=='other'||(d&&d.label!=='other'&&d.confidence>=.5)))return {ok:false,reason:`${rule.reason||'不像挥杆'}${d?`，模型认为是${CLASS_NAMES[d.label]}`:''}`,kin};
 const cal=motionCal?.[label],level=trial.level;if(level&&Array.isArray(cal)&&cal.length>=3&&kin.top>0){const u=arcToPose(kin.top,{kind:label,curve:curveFor(label)}),got=Math.max(1,Math.min(5,Math.round(u*5)));if(Math.abs(got-level)>=2)return {ok:false,reason:`上杆幅度更像 ${LEVEL_NAMES[got]}，提示是 ${LEVEL_NAMES[level]}`,kin};}
 return {ok:true,model:d,kin};
}
function mlStep(time){
 if(!segmenter||mlUploading||review)return;$('ml-level').style.width=Math.min(100,mlLastW/6)+'%';const ev=segmenter.sample(time,mlLastW,mlLastA);if(!ev)return;
 if(ev.state==='ready'){const kind=trialKind(mlTrial);mlRing('ready',kind==='pose'?'慢慢上杆':mlTrial.label==='other'?'请做动作':'请挥杆',kind==='pose'||mlTrial.label==='other'?mlTrial.prompt:(mlTrial.level?levelText(mlTrial.label,mlTrial.level):ML_LABEL_TIPS[mlTrial.label]));}
 else if(ev.state==='recording')mlRing('recording','录制中…',trialKind(mlTrial)==='pose'?'到位后停住，不要挥下去':'完成动作后保持静止');
 else if(ev.segment){
  const label=mlTrial.label,kind=trialKind(mlTrial),small=ev.segment.peak<(TRIAL_MIN_PEAK[kind]||50)&&!(kind==='other'&&Math.abs(mlLastA-9.81)>1)||ev.segment.duration<200;
  if(small){mlResult('刚才的动作太小，没有记录，不影响本组。','info');segmenter.reset();mlRing('settle','保持静止','重新站好后再挥',{small:true});return;}
  const rec=recorder.slice(ev.segment.from,ev.segment.to),check=checkTrial(rec,mlTrial);
  if(check.ok)saveTrial(rec);else openReview(rec,check.reason);
 }
}
function saveTrial(rec){
 const sent=uploadSample({source:{adapt:'adapt',motion:'motion'}[mlTrial.mode]||'collect',rec,extra:{sessionId:mlTrial.id,trialIndex:mlTrial.index,label:mlTrial.label,level:mlTrial.level,pose:mlTrial.pose}});
 if(!sent){mlResult('连接中断，未能上传，请重来。','retry');segmenter?.reset();return;}mlUploading=true;mlRing('saving','上传中…','正在保存这次动作');
}
function openReview(rec,reason){
 review={rec};$('ml-review').classList.remove('hidden');$('ml-review-text').textContent=`这次不太像“${mlTrial.labelName}”：${reason}。6 秒后自动丢弃。`;mlRing('review','请确认',reason,{reason});
 clearTimeout(reviewTimer);reviewTimer=setTimeout(()=>decideReview(false),6000);
}
function closeReview(){review=null;clearTimeout(reviewTimer);$('ml-review').classList.add('hidden');}
function decideReview(keep){
 if(!review)return;const rec=review.rec;closeReview();
 if(keep){saveTrial(rec);return;}
 mlResult('已丢弃，请再做一次。','info');segmenter?.reset();mlRing('settle','保持静止','重新站好后再挥',{discarded:true});
}
$('ml-keep').onclick=()=>decideReview(true);$('ml-discard').onclick=()=>decideReview(false);
$('ml-pause').onclick=()=>{if(mlTrial)conn.send({type:'ml_session',action:mlTrial.paused?'resume':'pause'});};
$('ml-skip').onclick=()=>{if(mlTrial){closeReview();conn.send({type:'ml_session',action:'skip'});}};
$('ml-undo').onclick=()=>{if(mlTrial)conn.send({type:'ml_session',action:'undo'});};
$('ml-stop').onclick=()=>{if(mlTrial){closeReview();conn.send({type:'ml_session',action:mlTrial.canFinish?'finish':'stop'});}};
function mlAck(m){
 if(m.source==='play'){if(lastPlaySample?.id===m.id)lastPlaySample.ack=m;return;}
 if(m.source==='missed'){$('shot-status').textContent=m.ok?'已上传漏识别片段，可在电脑练习室复核。':m.reason;return;}
 if(m.source==='candidate')return;
 mlUploading=false;if(!m.ok){mlResult(m.reason||'未保存，请重来。','retry');segmenter?.reset();mlRing('settle','保持静止','重新站好');return;}
 flash();const p=m.prediction,k=m.kin,arc=k?(m.pose&&m.pose!=='finish'?` · 停在 ${Math.round(k.hold||0)}°`:k.top?` · 上杆 ${Math.round(k.top)}°`:''):'';mlResult(p?`已保存 ✓ 模型判断：${p.labelName} ${Math.round(p.confidence*100)}%${p.power!==null?` · 力度 ${Math.round(p.power*100)}%`:''}${arc}`:`已保存 ✓ 峰值 ${m.quality.peak}°/s · ${(m.quality.duration/1000).toFixed(1)} 秒${arc}`,'ok');
}

// ---------- 握持图解与手机录入 ----------
function renderPosture(){$('posture-grip').innerHTML=gripSVG(grip);$('posture-swing').innerHTML=motionSVG('swing',5,{grip});$('posture-tips').innerHTML=GRIP_TIPS[grip].map(t=>`<li>${t}</li>`).join('')+'<li>不需要校准：启用体感后直接挥杆，力度和方向习惯会自动学习。</li>';$('help-grip').innerHTML=gripSVG(grip);$('help-swing').innerHTML=motionSVG('swing',5,{grip});$('help-partial').innerHTML=motionSVG('swing',2,{grip});$('help-putt').innerHTML=motionSVG('putt',3,{grip});$('grip-note').textContent=GRIPS[grip];for(const [id,g] of [['grip-vertical','vertical'],['grip-horizontal','horizontal'],['grip-vertical-2','vertical'],['grip-horizontal-2','horizontal']])$(id).classList.toggle('selected',grip===g);}
function setGrip(g){grip=g==='horizontal'?'horizontal':'vertical';try{localStorage.setItem('swinglink-grip',grip);}catch{}renderPosture();renderRecord();if(mlTrial)$('ml-demo').innerHTML=motionSVG(mlTrial.label,mlTrial.level||3,{grip,pose:mlTrial.pose});refreshDetector();}
for(const [id,g] of [['grip-vertical','vertical'],['grip-horizontal','horizontal'],['grip-vertical-2','vertical'],['grip-horizontal-2','horizontal']])$(id).onclick=()=>setGrip(g);
$('ml-record-label').innerHTML=CLASSES.map(c=>`<option value="${c}">${CLASS_NAMES[c]}</option>`).join('');
function renderRecord(){const label=$('ml-record-label').value||'swing',level=$('ml-record-level').value||'ladder';$('ml-record-demo').innerHTML=motionSVG(label,level==='ladder'?3:Number(level),{grip});$('ml-record-tip').textContent=(label==='other'?MOTION_TIPS.other:level==='ladder'?`${MOTION_TIPS[label]}。力度按 20%→100% 轮换`:levelText(label,Number(level)))+'。随时可以暂停；太小的动作不会记录。';$('ml-record-level').disabled=label==='other';$('ml-record-device').textContent=`每条录音都会记录：${String($('ml-record-person').value||identity?.name||'球手').trim()} · 动作与力度 · ${currentDevice()} · ${GRIPS[grip]}`;}
$('ml-record-label').onchange=renderRecord;$('ml-record-level').onchange=renderRecord;$('ml-record-person').oninput=renderRecord;
function startRecording(mode){if(!enabled)return warn('请先点击“启用体感”，再录入训练数据。');const label=$('ml-record-label').value||'swing',level=$('ml-record-level').value||'ladder';conn.send({type:'ml_session',action:'start',mode,label,level:label==='other'?null:(level==='ladder'?'ladder':Number(level)),count:Number($('ml-record-count').value)||10,person:String($('ml-record-person').value||identity?.name||'').trim()});}
$('ml-record-start').onclick=()=>startRecording('collect');$('ml-record-motion').onclick=()=>startRecording('motion');
$('device-name').value=deviceName;$('device-name').placeholder=autoDevice();
renderPosture();renderRecord();setStage();refreshDetector();

export {conn};
