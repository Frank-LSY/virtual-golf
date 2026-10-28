import {CLUBS} from '../shared/clubs.js';
import {GuidedCalibration,CALIBRATION_STEPS} from '../shared/calibration.js';
import {Connection} from '../shared/connection.js';
import {SwingDetector,mapSwing,median,SWING_CONFIG} from '../shared/swing.js';
import {chineseLog,chineseConfig,chineseCalibration,chineseCsv} from '../shared/locale.js';
import {INPUT_DEFAULTS,inputSettings} from '../shared/training.js';
const $=id=>document.getElementById(id),conn=new Connection('phone');
let calibration=null;try{const x=JSON.parse(localStorage.getItem('swinglink-calibration'));if(x?.version===SWING_CONFIG.version&&Number.isFinite(x.peakMax)&&x.peakMax>=80&&Number.isFinite(x.dirZero)&&['alpha','beta','gamma'].includes(x.axis))calibration=x;}catch{}
let detector=new SwingDetector(),stage='intro',playMode='play',axis=calibration?.axis||'beta',samples=[],peaks=[],lastSample=0,lastUI=0,stillStart=0,latestDir=0,latestRaw={},enabled=false,online=false,locked=true,wakeLock=null,seq=Number(localStorage.getItem('swinglink-phone-seq')||sessionStorage.getItem('swinglink-phone-seq')||0),stateVersion=-1,gamePhase='lobby',logs=[],sampleCount=0,sampleStart=0,reusePeak=null;
let wizard=null,identity=null,practiceSelected=true,roundCanControl=true,activeOwner='',lastCalProgress=0;
let settings={...INPUT_DEFAULTS},practiceActive=false,practiceArmed=false,stream=false,roundStream=false,roundActive=false,roundArmed=false,previousMode='play',practiceBusyUntil=0,practiceTimer,lastTelemetry=0,hz=0;
try{settings=inputSettings(JSON.parse(localStorage.getItem('swinglink-input-settings')));}catch{}
applySettings(settings);
try{logs=JSON.parse(localStorage.getItem('swinglink-logs'))||[];if(!Array.isArray(logs))logs=[];}catch{}
$('axis').value=axis;
$('phone-club').innerHTML='<option value="auto">自动推荐</option>'+CLUBS.map(c=>`<option value="${c.id}">${c.name} · ${c.range} 米</option>`).join('');
$('phone-club').onchange=()=>{if(online&&roundActive&&roundCanControl&&gamePhase==='playing')conn.send({type:'round_club',clubId:$('phone-club').value,stateVersion});};
if(calibration){$('reuse-calibration').classList.remove('hidden');$('reuse-calibration').onclick=()=>{reusePeak=calibration.peakMax;$('enable').click();};}
function warn(text){$('sensor-warning').textContent=text;$('sensor-warning').classList.toggle('hidden',!text);}
function saveLogs(){logs=logs.slice(0,50);localStorage.setItem('swinglink-logs',JSON.stringify(logs));$('log-count').textContent=`已在这台手机保存 ${logs.length} / 50 条记录。`;}
saveLogs();
async function keepAwake(){if(!navigator.wakeLock){$('wake-status').textContent='○ 此设备不支持屏幕常亮';return;}try{wakeLock=await navigator.wakeLock.request('screen');$('wake-status').textContent='● 屏幕常亮已开启';wakeLock.addEventListener('release',()=>{$('wake-status').textContent='○ 屏幕常亮已暂停';});}catch{$('wake-status').textContent='○ 请手动保持屏幕常亮';}}
function startStill(){wizard=null;stage='still';stillStart=0;samples=[];peaks=[];detector.reset();conn.send({type:'uncalibrated'});$('enable').classList.add('hidden');$('reuse-calibration').classList.add('hidden');$('ready-controls').classList.add('hidden');$('calibration-progress').classList.remove('hidden');$('phone-illustration').classList.remove('hidden');$('orb-number').classList.add('hidden');$('orb').classList.remove('ready');$('title').innerHTML='站稳，<br>找到自然姿势。';$('instruction').innerHTML='横向握住手机，保持静止。<br>我们会记录你的自然起始姿势。';$('orb-label').textContent='请保持静止约一秒';warn('');renderCalibration();}
$('enable').onclick=async()=>{
 try{
  if(!window.isSecureContext)return warn('体感需要受信任的 HTTPS 连接。请在电脑上打开“连接手机”，按说明完成 iPhone 设置。');
  if(typeof DeviceMotionEvent==='undefined')return warn('当前浏览器无法提供运动传感器，请用 iPhone 的 Safari 打开此页面。');
  const permission=typeof DeviceMotionEvent.requestPermission==='function'?await DeviceMotionEvent.requestPermission():'granted';
  if(permission!=='granted')return warn('体感权限未获允许。请在 Safari 的网站设置中允许运动与方向访问，重新加载后再试。');
  enabled=true;$('sensor-status').textContent='○ 正在等待体感数据';window.removeEventListener('devicemotion',onMotion);window.addEventListener('devicemotion',onMotion);keepAwake();startStill();lastSample=performance.now();
 }catch(e){warn(`无法启用体感。请确认已允许传感器访问，然后再点一次。`);}
};
function ready(){stage='ready';wizard=null;$('orb').classList.remove('hidden');localStorage.setItem('swinglink-calibration',JSON.stringify(calibration));conn.send({type:'calibrated',...calibration});$('calibration-progress').classList.add('hidden');$('ready-controls').classList.remove('hidden');$('orb-number').classList.add('hidden');$('phone-illustration').classList.remove('hidden');$('orb').classList.add('ready');detector.reset();renderReady();}
function renderReady(){if(stage!=='ready')return;const inactive=practiceActive&&!practiceSelected||roundActive&&!roundCanControl;const practiceBusy=playMode==='practice'&&Date.now()<practiceBusyUntil,waiting=playMode==='play'&&locked,active=practiceActive||roundActive,armed=practiceActive?practiceArmed:roundArmed;
 $('phone-club-picker').classList.toggle('hidden',!roundActive||practiceActive);$('phone-club').disabled=!online||!roundCanControl||gamePhase!=='playing';
 $('title').innerHTML=gamePhase==='transferring'&&!practiceActive?'乘车换洞，<br>欣赏沿途风景。':inactive?'轮到同伴，<br>稍作放松。':!online?'正在恢复连接。':practiceBusy||waiting?(gamePhase==='animating'||practiceBusy?'看一看，<br>这一杆的落点。':'球场已备好，<br>就等你开场。'):active?(armed?'站稳，<br>挥出这一杆。':'先试挥，<br>找到你的节奏。'):'准备好了，<br>随时挥杆。';
 $('instruction').textContent='';$('instruction').innerHTML=gamePhase==='transferring'&&!practiceActive?'所有球手一起前往下一站。<br>到站后重新选杆，再准备击球。':inactive?'当前由同伴控制角色。<br>你的握姿和灵敏度仍独立保存。':practiceBusy?'训练球正在运动。<br>等球停稳，再试下一杆。':waiting?'在电脑上开始或继续本局。<br>人物随球位移动后，再准备下一杆。':active?(armed?'下一次挥动将击球。<br>轻转手机仍可调整人物视角。':'试挥不击球，也不计杆数。<br>轻转手机观察，准备好后点击下方按钮。'):'轻轻上杆，顺势挥出。<br>剩下的，交给手机。';
 $('orb-label').textContent=gamePhase==='transferring'&&!practiceActive?'球车接驳中 · 暂停击球':inactive?'等待轮到这台手机':!online?'正在重新连接':practiceBusy||waiting?'等待球局就绪':active&&!armed?'试挥模式 · 不击球':'已准备 · 下一挥击球';
 $('phone-practice-arm').classList.toggle('hidden',!active);$('phone-practice-mode').classList.toggle('hidden',!active);$('phone-practice-arm').textContent=armed?'取消准备':'准备击球 →';$('phone-practice-arm').disabled=!online||practiceBusy||waiting||inactive;$('phone-practice-mode').textContent=armed?'已准备 · 体感视角持续生效':'试挥模式 · 体感视角持续生效，不计杆数';
}
$('phone-practice-arm').onclick=()=>{if(practiceActive&&!practiceSelected||roundActive&&!roundCanControl)return;conn.send({type:practiceActive?'practice_arm':'round_arm',armed:!(practiceActive?practiceArmed:roundArmed)});};

function onMotion(e){
 const time=performance.now(),rr=e.rotationRate;if(!rr||!['alpha','beta','gamma'].some(k=>Number.isFinite(rr[k])))return;
 if(stage==='still'&&time-lastSample>350){stillStart=0;samples=[];}
 latestRaw={alpha:rr.alpha||0,beta:rr.beta||0,gamma:rr.gamma||0};lastSample=time;sampleCount++;sampleStart||=time;
 const g=e.accelerationIncludingGravity;if(g&&Number.isFinite(g.y)&&Number.isFinite(g.z))latestDir=Math.atan2(g.y,g.z)*180/Math.PI;
 let dir=latestDir;if(calibration){while(dir-calibration.dirZero>180)dir-=360;while(dir-calibration.dirZero<-180)dir+=360;}
 const velocity=latestRaw[axis];
 if(time-sampleStart>=1000){hz=sampleCount/((time-sampleStart)/1000);sampleStart=time;sampleCount=0;}
 if((stream||roundStream)&&online&&!document.hidden&&time-lastTelemetry>=80){conn.send({type:'sensor_sample',sample:{...latestRaw,axis,state:detector.state,stage,tilt:calibration?dir-calibration.dirZero:0,hz,peakMax:calibration?.peakMax??null}});lastTelemetry=time;}
 if(time-lastUI>120){$('readout').textContent=`α ${latestRaw.alpha.toFixed(0)} · β ${latestRaw.beta.toFixed(0)} · γ ${latestRaw.gamma.toFixed(0)} °/秒 | ${hz.toFixed(0)} 次/秒`;$('state-path').textContent=detector.path.map(s=>({IDLE:'静止',BACK:'上杆',DOWN:'下挥',HIT:'击球',COOLDOWN:'冷却'}[s]||s)).join(' → ');$('sensor-status').textContent='● 传感器数据正常';lastUI=time;if(!document.hidden&&$('sensor-warning').dataset.stalled==='true'){warn('');delete $('sensor-warning').dataset.stalled;}}
 if(document.hidden)return;
 if(stage==='still'){
  if(Math.max(...Object.values(latestRaw).map(Math.abs))>SWING_CONFIG.IDLE_MAX){stillStart=0;samples=[];renderCalibration('手机还在动，请放松手腕并停稳。',0);return;}
  if(!stillStart)stillStart=time;samples.push({dir:latestDir,noise:Math.max(...Object.values(latestRaw).map(Math.abs))});
  renderCalibration('保持当前自然握姿，圆满后自动进入下一步。',Math.min(1,(time-stillStart)/1100));
  if(time-stillStart>=1100&&samples.length>=25){const sin=samples.reduce((s,x)=>s+Math.sin(x.dir*Math.PI/180),0),cos=samples.reduce((s,x)=>s+Math.cos(x.dir*Math.PI/180),0);calibration={...calibration,version:SWING_CONFIG.version,dirZero:Math.atan2(sin,cos)*180/Math.PI,noise:median(samples.map(x=>x.noise)),peakMax:reusePeak||600,axis};if(reusePeak){reusePeak=null;ready();return;}wizard=new GuidedCalibration(calibration);stage='calibrating';renderCalibration();}
  return;
 }
 if(stage==='calibrating'){if(wizard?.collecting&&wizard.phase==='verify')$('cal-power-marker').style.left=Math.min(1,Math.abs(latestRaw[wizard.axis])/wizard.peakMax)**wizard.gamma*100+'%';const result=wizard?.sample(latestRaw,latestDir,time);if(result){if(Number.isFinite(result.power))$('cal-power-marker').style.left=result.power*100+'%';renderCalibration();if(result.accepted)flash();}return;}
 if(stage!=='ready')return;
 if((playMode==='play'&&(locked||roundActive&&!roundCanControl))||(playMode==='practice'&&(Date.now()<practiceBusyUntil||practiceActive&&!practiceSelected))){detector.reset();return;}
 const hit=detector.sample(velocity,dir,time);if(!hit)return;
 const swing=mapSwing(hit,calibration,detector.config);seq++;localStorage.setItem('swinglink-phone-seq',String(seq));
 const m={type:playMode==='practice'?'test_swing':'swing',...swing,seq,stateVersion,clientTime:Date.now(),path:hit.path,backswingMs:hit.backswingMs,downswingMs:hit.downswingMs};const sent=online&&conn.send(m);
 logs.unshift({...swing,playerId:identity?.id,playerName:identity?.name,phoneNumber:identity?.number,time:new Date().toISOString(),path:hit.path,backswingMs:hit.backswingMs,downswingMs:hit.downswingMs,axis,mode:playMode,sent,seq,feeling:'未标记',config:{...detector.config},calibration:{...calibration}});saveLogs();$('feeling').value='未标记';$('last-power').innerHTML=`${Math.round(swing.power*100)}<small>%</small>`;$('last-direction').textContent=`${swing.dir<0?'←':swing.dir>0?'→':''} ${Math.abs(swing.dir*25).toFixed(1)}°`;$('power-meter').style.width=swing.power*100+'%';$('delivery').textContent=sent?'已识别 · 正在发送':'未发送 · 连接已断开';$('shot-status').textContent='挥杆已识别，保持这个节奏。';flash();
}
function flash(){$('orb').classList.add('fired');navigator.vibrate?.(35);setTimeout(()=>$('orb').classList.remove('fired'),220);}
$('quick-zero').onclick=()=>{reusePeak=calibration?.peakMax||null;startStill();};
$('recalibrate').onclick=()=>{reusePeak=null;startStill();};
function setMode(mode){if(playMode===mode)return;playMode=mode;document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('selected',x.dataset.mode===mode));detector.reset();renderReady();}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
$('axis').onchange=()=>{axis=$('axis').value;if(enabled)startStill();};
function applySettings(value,requestId){settings=inputSettings(value);const {threshold,gamma,powerGain,directionGain}=settings;detector=new SwingDetector({BACK_START:threshold,DOWN_MIN:threshold*2/3,POWER_GAMMA:gamma,POWER_GAIN:powerGain,DIRECTION_GAIN:directionGain});for(const [key,id] of Object.entries({threshold:'threshold',gamma:'gamma',powerGain:'phone-power-gain',directionGain:'phone-direction-gain'}))$(id).value=settings[key];localStorage.setItem('swinglink-input-settings',JSON.stringify(settings));if(online)conn.send({type:'input_settings',settings,requestId});}
function updateConfig(){try{applySettings({threshold:Number($('threshold').value),gamma:Number($('gamma').value),powerGain:Number($('phone-power-gain').value),directionGain:Number($('phone-direction-gain').value)});$('tuning-status').textContent='灵敏度已保存，并同步到电脑。';}catch(e){$('tuning-status').textContent=e.message;}}
for(const id of ['threshold','gamma','phone-power-gain','phone-direction-gain'])$(id).onchange=updateConfig;
$('feeling').onchange=()=>{if(logs[0]){logs[0].feeling=$('feeling').value;saveLogs();}};
$('missed').onclick=()=>{logs.unshift({time:new Date().toISOString(),feeling:'漏识别',axis,sent:false,mode:playMode});saveLogs();$('shot-status').textContent='已在记录中标记本次漏识别。';};
function download(format){const data=format==='json'?JSON.stringify({'参数版本':SWING_CONFIG.version,'校准':chineseCalibration(calibration),'识别参数':chineseConfig(detector.config),'球手':identity,'挥杆记录':logs.map(chineseLog)},null,2):chineseCsv(logs);const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type:format==='json'?'application/json':'text/csv;charset=utf-8'}));a.download=`挥杆记录.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
$('export-json').onclick=()=>download('json');$('export-csv').onclick=()=>download('csv');
document.addEventListener('visibilitychange',()=>{detector.reset();if(document.hidden){if(wizard?.collecting){wizard.retry();wizard.message='页面已切到后台，这次未采用。回来后点击开始。';renderCalibration();}if(stage==='still'){stillStart=0;samples=[];}if(practiceActive&&practiceArmed)conn.send({type:'practice_arm',armed:false});if(roundActive&&roundArmed)conn.send({type:'round_arm',armed:false});wakeLock?.release();warn('页面进入后台后，体感已暂停。返回此页面并保持静止后再挥杆。');}else if(enabled){keepAwake();lastSample=performance.now();$('sensor-warning').dataset.stalled='true';}});
setInterval(()=>{if(enabled&&!document.hidden&&performance.now()-lastSample>1800){$('sensor-status').textContent='○ 尚未收到传感器数据';warn('传感器数据已中断。请保持 Safari 在前台，检查体感权限，或刷新页面重新连接。');$('sensor-warning').dataset.stalled='true';detector.reset();if(stage==='still'){stillStart=0;samples=[];}if(wizard?.collecting){wizard.retry();wizard.message='体感数据中断，本次未采用。恢复数据后点击开始重试。';renderCalibration();}}},1000);
conn.addEventListener('message',({detail:m})=>{
 if(m.type==='player_identity'){identity=m.player;$('player-name').value=identity.name;$('player-style').value=identity.style;renderOwner();}
 if(m.type==='calibration_request'){if(!enabled){warn('电脑请求校准，请先点击启用体感。');return;}reusePeak=m.mode==='zero'?calibration?.peakMax:null;startStill();}
 if(m.type==='ready'){online=true;$('connection').textContent='● 已连接';$('connection').classList.add('online');conn.send({type:'input_settings',settings});if(stage==='ready'&&calibration)conn.send({type:'calibrated',...calibration});renderReady();}
 if(m.type==='practice_subscription'){if(practiceSelected!==(m.selected!==false))detector.reset();practiceSelected=m.selected!==false;activeOwner=m.active?m.owner?.name||'':'';renderOwner();stream=m.stream;practiceArmed=!!m.armed;if(m.active!==practiceActive){practiceActive=m.active;if(m.active){previousMode=playMode;setMode('practice');}else setMode(previousMode);document.querySelector('[data-mode="play"]').disabled=m.active;}practiceBusyUntil=Date.now()+(m.busyMs||0);clearTimeout(practiceTimer);practiceTimer=setTimeout(renderReady,Math.max(0,practiceBusyUntil-Date.now())+50);renderReady();}
 if(m.type==='round_subscription'){if(roundCanControl!==(m.canControl!==false))detector.reset();roundCanControl=m.canControl!==false;if(!practiceActive)activeOwner=m.active?m.playerName||'':'';roundActive=m.active;renderOwner();roundStream=m.stream;roundArmed=!!m.armed;if(m.active&&!practiceActive)setMode('play');document.querySelector('[data-mode="practice"]').disabled=m.active;renderReady();}
 if(m.type==='input_settings_request'){try{applySettings(m.settings,m.requestId);$('tuning-status').textContent='电脑调整的灵敏度已生效。';}catch(e){$('tuning-status').textContent=e.message;}}
 if(m.type==='practice_ack'||m.type==='practice_rehearsal_ack'){$('delivery').textContent=m.rehearsal?'试挥已识别 · 尚未击球':'训练场已击球';$('phone-training-label').textContent=m.rehearsal?'试挥模拟参考 · 球未击出':'本杆模拟击球反馈';$('phone-training-result').classList.remove('hidden');$('phone-training-distance').textContent=`${m.travel.toFixed(1)} 米`;$('phone-training-detail').textContent=`${m.club} · 距目标 ${m.targetError.toFixed(1)} 米 · ${Math.abs(m.lateral)<.5?'方向居中':(m.lateral<0?'偏左 ':'偏右 ')+Math.abs(m.lateral).toFixed(1)+' 米'}`;$('phone-training-tip').textContent=m.feedback.slice(0,2).join(' ');const entry=logs.find(x=>x.seq===m.seq);if(entry){entry.acknowledged=true;saveLogs();}}
 if(m.type==='room_state'&&m.state.stateVersion>=stateVersion){stateVersion=m.state.stateVersion;gamePhase=m.state.phase;const terrain=m.state.terrain;$('phone-terrain').textContent=terrain?`${terrain.name} · ${terrain.condition}。同杆同力度出球速度为球道的 ${terrain.speedPercent}%。${terrain.roll}。${terrain.tip}`:'';$('phone-club').value=m.state.clubId||'auto';$('phone-club-tip').textContent=`${m.state.selectedClub?.name||'自动推荐'} · ${m.state.selectedClub?.range||'—'} 米参考距离。换杆后重新准备击球。`;if(m.state.putting){const p=m.state.putting;$('phone-club-tip').textContent+=` ${p.pace}，${p.break}。`;}roundArmed=roundCanControl&&!!m.state.armed;renderReady();}
 if(m.type==='input_lock'){locked=m.locked;renderReady();}
 if(m.type==='ack'||m.type==='rehearsal_ack'){$('delivery').textContent=m.type==='rehearsal_ack'?'试挥已接收 · 不计杆数':'已击球 · 计入本局';if(m.type==='rehearsal_ack')$('shot-status').textContent=`试挥参考 ${m.travel.toFixed(1)} 米，球仍在原位。`;const entry=logs.find(x=>x.seq===m.seq);if(entry){entry.acknowledged=true;saveLogs();}}
 if(m.type==='error'){$('shot-status').textContent=m.message;$('delivery').textContent='本次挥杆未被接受';}
});conn.addEventListener('offline',()=>{online=false;locked=true;$('connection').textContent='正在重新连接…';$('connection').classList.remove('online');detector.reset();renderReady();});conn.connect();

function renderOwner(){$('phone-identity').textContent=identity?`手机 ${String(identity.number).padStart(2,'0')} · ${identity.name}`:'正在分配手机编号';$('turn-owner').textContent=activeOwner?`当前控制：${activeOwner}`:'每台手机对应一位球手';}
$('save-profile').onclick=()=>conn.send({type:'player_profile',name:$('player-name').value,style:$('player-style').value});
function renderCalibration(hint,progress){
 const still=stage==='still',phase=wizard?.phase||'still',review=phase==='review';
 const titles={axis:'沿一个方向，慢慢挥回。',light:'小幅轻挥，留一点余量。',full:'舒适挥出，不必全力。',verify:'相同挥幅，重复两次。',review:'这次校准，有据可依。'};
 if(!still){$('title').textContent=titles[phase];$('instruction').textContent='跟随下方动作提示，一步一步完成。';$('orb').classList.add('hidden');}else $('orb').classList.add('hidden');
 $('cal-step-title').textContent=still?'01 握姿归零':CALIBRATION_STEPS[phase];
 $('cal-action').textContent=still?'横握手机，自然站稳，保持静止约一秒。':{axis:'慢慢抬起 → 沿原路下挥 → 停稳。自动判断感应轴。',light:'用较小挥幅完成一杆，建立轻挥参考。',full:'比上一杆增加挥幅，建立约八成力参考。不要猛甩。',verify:'目标 50%。连续两次进入 35%–65%，相差不超过 15 个百分点。',review:`感应轴 ${wizard?.axis} · 满力参考 ${Math.round(wizard?.peakMax||0)}°/秒`}[phase];
 $('cal-feedback').textContent=hint||wizard?.message||'握稳后自动进入下一步，无需点击。';$('cal-progress').value=progress??({axis:.25,light:.45,full:.6,verify:.8,review:1}[phase]||0);
 $('cal-demo-caption').textContent=still?'保持自然握姿 · 无需挥动':review?'已完成 · 可以随时重置方向':'上杆 ↗　下挥 ↙　停稳';$('cal-footnote').textContent=still?'此步自动完成。看到下一步的开始按钮后再挥动。':'每次点击开始后只做一个完整动作。无需用力甩动手机。力度来自手机运动估算。';$('cal-demo').dataset.phase=phase;$('cal-demo').classList.toggle('capturing',!!wizard?.collecting);
 $('cal-start').classList.toggle('hidden',still||review);$('cal-start').disabled=!!wizard?.collecting;$('cal-start').textContent=wizard?.collecting?'正在识别：上杆 → 下挥 → 停稳':'开始这一步 →';
 $('cal-redo').classList.toggle('hidden',!['full','verify','review'].includes(phase));$('cal-redo').disabled=!!wizard?.collecting;$('cal-use').classList.toggle('hidden',!review);
 const now=performance.now();if(hint===undefined||now-lastCalProgress>250){lastCalProgress=now;conn.send({type:'calibration_progress',step:$('cal-step-title').textContent,hint:$('cal-feedback').textContent,progress:Number($('cal-progress').value)});}
}
$('cal-start').onclick=()=>{if(!wizard||wizard.phase==='review')return;wizard.begin(performance.now());renderCalibration();};
$('cal-redo').onclick=()=>{wizard?.redoPower();renderCalibration();};
$('cal-use').onclick=()=>{const result=wizard?.result();if(!result)return;calibration={version:SWING_CONFIG.version,...result};axis=result.axis;$('axis').value=axis;
$('phone-club').innerHTML='<option value="auto">自动推荐</option>'+CLUBS.map(c=>`<option value="${c.id}">${c.name} · ${c.range} 米</option>`).join('');
$('phone-club').onchange=()=>{if(online&&roundActive&&roundCanControl&&gamePhase==='playing')conn.send({type:'round_club',clubId:$('phone-club').value,stateVersion});};applySettings({...settings,...result.settings});$('orb').classList.remove('hidden');ready();};
