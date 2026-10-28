import {CourseAtlas,courseArt} from './course-atlas.js';
import {courseSummary,challengeLabel} from '../shared/course-layout.js';
import {SpatialGolfAudio} from './spatial-audio.js';
import {ShotAudioMix} from './audio-mix.js';
import {CourseAmbience} from './soundscape.js';
import {puttingRead} from '../shared/putting.js';
import {initMusic} from './music.js';
import {CLUBS} from '../shared/clubs.js';
import {MapView} from './view-controls.js';
import {ClubPreview} from './club-preview.js';
import {Multiplayer} from './multiplayer.js';
import {PLAYER_COLORS} from '../shared/players.js';
import {COURSES,makeHole,clamp,distance,heightAt,surfaceAt,slopeAt,clubFor} from '../shared/courses.js';
import {Connection} from '../shared/connection.js';
import {PlayerScene} from './player-scene.js';
import {TrainingRoom} from './training.js';
const $=id=>document.getElementById(id);
const icons={phone:'<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/>',arrow:'<path d="M4 12h15m-5-5 5 5-5 5"/>',mouse:'<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 3v6"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',back:'<path d="m14 6-6 6 6 6"/>',grid:'<path d="M3 7h18M3 12h18M3 17h18M7 3v18M12 3v18M17 3v18"/>',aim:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/>',camera:'<rect x="2" y="6" width="20" height="15" rx="3"/><path d="m7 6 2-3h6l2 3"/><circle cx="12" cy="13" r="4"/>',sound:'<path d="m3 9 4 0 5-5v16l-5-5H3zM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>'};
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[el.dataset.icon]||''}</svg>`);
let selected='orchard',mode=9,state=null,view='lobby',scene,wsReady=false,controller={connected:false,calibrated:false},seq=Number(sessionStorage.getItem('swinglink-seq')||0),loadedKey='',toastTimer,soundOn=localStorage.getItem('swinglink-sound')!=='off',audio,charging=false,chargeStart=0,chargeTimer,logs=[],lastShot=null,mapBackground=null;
let roundPending=false,roundTimer,lastMotionAt=0;
const music=initMusic(),audioMix=new ShotAudioMix(),ambience=new CourseAmbience(()=>{audio??=new AudioContext();return audio;},{enabled:soundOn});
const spatialAudio=new SpatialGolfAudio(()=>{audio??=new AudioContext();return audio;},position=>activeSoundScene()?.audioFrame(position));
function activeSoundScene(){return view==='lab'?training.scene:scene;}
const soundScope=()=>view==='lab'?'practice':'round';
function watchShot(scope,shot,source){audioMix.begin(scope,performance.now(),shot.duration*1000+(source==='phone'?100:540)+400);}
function soundPhase(scope,phase){if(['landing','holed','address'].includes(phase))audioMix.settle(scope);}
let audioClock=performance.now();const audioTimer=setInterval(()=>{const now=performance.now(),gain=audioMix.update(now,Math.min(1,(now-audioClock)/1000));audioClock=now;music.setDucking(soundOn?gain:1);ambience.update(gain);spatialAudio.update();},50);
const unlockAmbience=()=>ambience.unlock();document.addEventListener('pointerdown',unlockAmbience);document.addEventListener('keydown',unlockAmbience);
document.addEventListener('visibilitychange',()=>{ambience.setVisible(!document.hidden);if(document.hidden)spatialAudio.clear();});
window.addEventListener('pagehide',()=>{ambience.setVisible(false);spatialAudio.clear();});window.addEventListener('pageshow',()=>{ambience.setVisible(!document.hidden);if(document.hidden)spatialAudio.clear();});
$('sound-button').style.opacity=soundOn?1:.4;$('sound-button').setAttribute('aria-pressed',String(soundOn));
const conn=new Connection('screen');
const multiplayer=new Multiplayer(conn,toast);
const training=new TrainingRoom($('lab'),conn,{connect:pair,toast,tone,onShot:(shot,source)=>{if(view==='lab')watchShot('practice',shot,source);},onPhase:phase=>{if(view==='lab')soundPhase('practice',phase);},onImpact:e=>{if(view==='lab')impactSound(e);}});
const mapView=new MapView($('minimap'),drawMap),clubPreview=new ClubPreview();
$('round-club').innerHTML='<option value="auto">自动推荐</option>'+CLUBS.map(c=>`<option value="${c.id}">${c.name} · ${c.range} 米</option>`).join('');
function chooseClub(clubId){if(!roundBusy())conn.send({type:'round_club',clubId,stateVersion:state.stateVersion});}
$('round-club').onchange=()=>chooseClub($('round-club').value);
$('club-details').onclick=()=>clubPreview.show(state?.selectedClub?.id||'iron',{choose:chooseClub,canChoose:()=>!roundBusy()});
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),4000);}
function tone(){audioMix.impact(soundScope(),'hit',performance.now());if(!soundOn||document.hidden)return;spatialAudio.strike(activeSoundScene()?.lastResult);}
function impactSound(event){
 if(event.type!=='ground')audioMix.impact(soundScope(),event.type,performance.now());
 if(!soundOn||document.hidden)return;spatialAudio.impact(event);
}
const courseAtlas=new CourseAtlas();
$('clubhouse-score').onclick=()=>openScore(true);
$('clubhouse-select').onclick=()=>conn.send({type:'lobby'});
$('course-atlas-lobby').onclick=()=>courseAtlas.show(selected);
$('course-atlas-game').onclick=()=>courseAtlas.show(state.courseId,state.seed,state);
$('journey-map').onclick=()=>courseAtlas.show(state.courseId,state.seed,state);
$('journey-skip').onclick=()=>{if(state?.transfer&&wsReady)conn.send({type:'skip_transfer',transferId:state.transfer.id,stateVersion:state.stateVersion});};
function renderCards(){ $('course-cards').innerHTML=COURSES.map((c,i)=>{const summary=courseSummary(c);return `<button class="course-card ${c.id===selected?'selected':''}" data-course="${c.id}" aria-pressed="${c.id===selected}">${courseArt(c)}<div class="course-info"><span class="eyebrow">${c.theme} · 球场 0${i+1}</span><h3>${c.name}</h3><div class="course-detail">${c.difficulty}<span>·</span>9 洞<span>·</span>难度 ${c.level}/6</div><p>${c.subtitle}</p><small class="course-par">标准杆 ${summary.par} · ${summary.length.toLocaleString()} 米</small></div><span class="card-check">✓</span></button>`;}).join('');document.querySelectorAll('[data-course]').forEach(b=>b.onclick=()=>selectCourse(b.dataset.course));}
function selectCourse(id){selected=id;if(view==='lobby')ambience.setWeather(makeHole(id,0,421).wind.speed);renderCards();const c=COURSES.find(c=>c.id===id);$('preview-name').textContent=c.name;$('preview-collection').textContent=c.location;scene?.load(makeHole(id,0,421));loadedKey='';}
function showView(next){if(next!=='game')scene?.endJourney();audioMix.clear();spatialAudio.clear();view=next;ambience.setWeather(next==='lab'?0:next==='game'?(state?.hole?.wind?.speed||0):makeHole(selected,0,421).wind.speed);for(const id of ['lobby','game','lab'])$(id).classList.toggle('hidden',id!==next);$('play-tab').classList.toggle('active',next!=='lab');$('lab-tab').classList.toggle('active',next==='lab');training.show(next==='lab');conn.send({type:'round_view',active:next==='game'});charging=false;clearInterval(chargeTimer);if(next==='lobby'){scene?.mount($('preview'),true);selectCourse(selected);}else if(next==='game'){scene?.mount($('game-canvas'),false);loadedKey='';renderState();}}
try{scene=new PlayerScene($('preview'),phase=>{if(view==='game'){soundPhase('round',phase);if(phase==='flight')tone();}renderRoundControls();});scene.onImpact=e=>{if(view==='game')impactSound(e);renderRoundControls();};selectCourse(selected);}catch(e){$('preview').innerHTML='<div style="padding:40px">三维球场需要 WebGL。请启用浏览器硬件加速，或使用 Chrome、Edge、Safari 打开挥杆之间。</div>';toast('当前浏览器无法显示三维球场。');console.error(e);}
renderCards();
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=Number(b.dataset.mode);document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('selected',x===b));});
$('start-button').onclick=()=>{if(!wsReady)return toast('正在重新连接本地游戏服务。');if(!scene)return toast('请先启用 WebGL，再开始本局。');const options=multiplayer.options();if(options)conn.send({type:'start_round',courseId:selected,mode,...options});};
$('play-tab').onclick=()=>showView(state&&state.phase!=='lobby'?'game':'lobby');$('brand').onclick=()=>{$('clubhouse-button').click();};
$('clubhouse-button').onclick=()=>{if(['animating','transferring'].includes(state?.phase))return toast('请等球停稳或球车到站。');conn.send({type:'lobby'});showView('lobby');};
$('lab-tab').onclick=()=>showView('lab');$('help-button').onclick=()=>$('help-dialog').showModal();
document.querySelectorAll('.dialog-close,.dialog-dismiss').forEach(b=>b.onclick=()=>b.closest('dialog').close());document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
async function pair(){if(!conn.config)try{conn.config=await fetch('/api/config').then(r=>r.json());}catch{return toast('请先启动本地游戏服务，再连接手机。');}const c=conn.config;$('qr').innerHTML=c.qr;$('phone-link').href=c.phoneUrl;const ca=`http://${c.addresses[0]||'localhost'}:${c.port}/local-ca.cer`;
 $('https-instructions').innerHTML=c.secure?`<ol><li>在 iPhone 上打开<a href="${ca}" target="_blank" rel="noopener">本地证书下载链接</a>，在“设置 → 通用 → VPN 与设备管理”中安装下载的描述文件。</li><li>在“设置 → 通用 → 关于本机 → 证书信任设置”中启用<b id="ca-name"></b>。</li><li>重新扫码，然后点击“启用体感”。</li></ol><p>两台设备需连接同一无线网络。如果无法打开页面，请允许游戏服务通过家庭网络的防火墙。</p>`:'<p>iPhone 体感需要受信任的 HTTPS 连接。请在电脑上运行<code>npm run setup:https</code>并重启游戏，再打开此面板获取证书和连接二维码。Mac 用户也可双击“配置手机连接.command”。</p>';
 if($('ca-name'))$('ca-name').textContent=c.caName||'挥杆之间 本地证书';$('pair-dialog').showModal();updateController();}
$('connect-button').onclick=pair;$('lab-connect').onclick=pair;
function updateController(){$('game').classList.toggle('has-phone',controller.connected);multiplayer.update(controller.phones);if(state)multiplayer.round(state);$('phone-status').textContent=controller.count>1?`${controller.count} 台手机已连接`:controller.calibrated?'手机已就绪':controller.connected?'正在校准…':'连接手机';document.querySelector('.connection-dot').classList.toggle('connected',controller.connected);$('pair-state').innerHTML=`<i></i>${controller.calibrated?'已连接并完成校准，可以挥杆了。':controller.connected?'手机已连接，请完成校准。':'等待手机连接'}`;if(!controller.calibrated)scene?.motionView.reset();renderRoundControls();}

function scoreTotal(){return state?.scores.reduce((s,h)=>s+h.strokes-h.par,0)||0;}
const relativeScore=s=>s===0?'平杆':s>0?'+'+s:String(s);
function renderState(){
 if(!state)return;const transferring=state.phase==='transferring',atClubhouse=state.phase==='finished'&&!!state.returnedToClubhouse;$('game').classList.toggle('at-clubhouse',atClubhouse);$('clubhouse-hud').hidden=!atClubhouse;if(atClubhouse)$('clubhouse-result').textContent=`完成 ${state.mode} 洞 · ${state.players.length} 位球手 · ${COURSES.find(c=>c.id===state.courseId).name}`;$('game').classList.toggle('is-transferring',transferring);$('journey-hud').hidden=!transferring;if(!transferring&&!state.returnedToClubhouse&&scene?.journey){scene.endJourney();loadedKey='';}
const current=multiplayer.round(state);$('round-avatar').disabled=!!current?.deviceId;const h=state.hole,c=COURSES.find(c=>c.id===state.courseId),key=`${state.courseId}-${state.holeIndex}-${state.seed}-${state.activePlayerId}`;
 if(view==='game'&&scene&&loadedKey!==key){scene.setStyle(state.players?.find(p=>p.id===state.activePlayerId)?.style||localStorage.getItem('swinglink-avatar')||'sage');$('round-avatar').value=scene.style;scene.load(h);loadedKey=key;mapBackground=null;mapView.reset();$('round-preview').textContent='先试挥，找到手感';$('round-power-reference').style.display='none';scene.setBall(state.ball,state.aim);scene.setCamera(true);}
 if(view==='game'&&scene){scene.setStyle(current?.deviceId?current.style:$('round-avatar').value);scene.setPlayers?.(state.players,state.activePlayerId);}
 if(view==='game'&&!['animating','transferring'].includes(state.phase)){scene?.setClub(state.selectedClub?.id||clubFor(h,state.ball).id);scene?.setHoled(current?.holeDone);scene?.finish(state.ball,state.aim);}
 const d=distance(state.ball,h.pin),club=(state.phase==='animating'&&lastShot?CLUBS.find(c=>c.id===lastShot.clubId):null)||state.selectedClub||clubFor(h,state.ball),lie=surfaceAt(h,state.ball.x,state.ball.z);
 if(view==='game'&&state.returnedToClubhouse&&state.clubhouseVisit)scene?.beginJourney({...state,transfer:state.clubhouseVisit});
 if(view==='game'&&transferring){$('score-dialog').close();scene?.beginJourney(state);$('journey-title').textContent=state.transfer.toIndex===null?`${state.mode} 洞完成，返回会所`:`第 ${state.holeIndex+1} 洞 → 第 ${state.transfer.toIndex+1} 洞`;$('journey-next').textContent=state.transfer.toIndex===null?'本轮计分卡已保存，回到会所查看成绩。':c.holes[state.transfer.toIndex][4].advice;}
 $('course-hole-tip').textContent=`${challengeLabel(h.challenge)} · ${h.advice}`;
 $('game-course').textContent=c.name.toUpperCase();$('hole-number').textContent=String(state.holeIndex+1).padStart(2,'0');$('hole-name').textContent=h.name;$('hole-meta').innerHTML=`标准杆 ${h.par} <span>·</span> ${h.length} 米`;
 $('score-total').textContent=relativeScore(scoreTotal());$('distance').textContent=d<10?d.toFixed(1):Math.round(d);$('club').textContent=club.name;$('club-range').textContent=`参考距离 ${club.range} 米`;$('round-club').value=state.phase==='animating'?club.id:state.clubId||'auto';$('round-club').options[0].textContent=`推荐 · ${state.recommendedClub?.name||club.name}`;$('club-swatch').className='club-swatch swatch-'+club.id;$('stroke').textContent=state.strokes;$('hole-progress').textContent='杆';$('lie').textContent=({tee:'发球台',fairway:'球道',rough:'长草区',green:'果岭',sand:'沙坑'}[lie]||lie.toUpperCase());
 
 if(view==='game')ambience.setWeather(h.wind.speed);$('wind-speed').textContent=h.wind.speed.toFixed(1);const heading=Math.atan2(h.pin.x-state.ball.x,h.pin.z-state.ball.z)+state.aim*Math.PI/180,tail=h.wind.x*Math.sin(heading)+h.wind.z*Math.cos(heading),cross=h.wind.x*Math.cos(heading)-h.wind.z*Math.sin(heading);
 $('wind-arrow').style.transform=`rotate(${Math.atan2(cross,tail)*180/Math.PI}deg)`;$('wind-relative').textContent=`${Math.abs(cross).toFixed(1)} 侧风 · ${Math.abs(tail).toFixed(1)} ${tail>=0?'顺风':'逆风'}`;
 $('aim').value=state.aim;$('aim-value').textContent=state.aim===0?'正前方':`${Math.abs(state.aim)}° ${state.aim<0?'左':'右'}`;if(view==='game'&&state.phase==='playing'&&scene?.phase==='address')scene.setBall(state.ball,state.aim);
 renderRoundControls();
 const elev=heightAt(h,h.pin.x,h.pin.z)-heightAt(h,state.ball.x,state.ball.z);$('elevation-label').textContent=`${elev>=0?'↗':'↘'} ${Math.abs(elev).toFixed(1)} 米高差`;
 if(state.phase==='playing'){$('shot-eyebrow').textContent=lie==='green'?'轻轻一推，留一点耐心':'放松呼吸，找到你的线路';$('shot-heading').textContent=state.strokes===0?'第一杆，由你挥出。':lie==='green'?'让球慢慢滚向洞口。':lastShot?.penalty?'加罚一杆，重新找回节奏。':'准备好，下一杆。';}
 drawMap();renderRoundControls();
 if(['hole_complete','finished'].includes(state.phase)&&view==='game')openScore(true);
}
function drawMap(){if(!state)return;const canvas=$('minimap'),ctx=canvas.getContext('2d'),h=state.hole,c=COURSES.find(c=>c.id===state.courseId),sx=2.2,sz=390/(h.length+35),px=x=>180+x*sx,pz=z=>430-(z+10)*sz;
 if(!mapBackground){const bg=document.createElement('canvas');bg.width=360;bg.height=460;const g=bg.getContext('2d');g.fillStyle='#e9efdf';g.beginPath();g.roundRect(0,0,360,460,65);g.fill();g.lineCap='round';g.lineJoin='round';g.strokeStyle=c.fairway;g.lineWidth=h.width*sx*2;g.beginPath();h.route.forEach((p,i)=>i?g.lineTo(px(p.x),pz(p.z)):g.moveTo(px(p.x),pz(p.z)));g.stroke();g.fillStyle=c.green;g.beginPath();g.ellipse(px(0),pz(h.length),h.greenRadius*sx,h.greenRadius*sz,0,0,Math.PI*2);g.fill();for(const p of h.hazards){g.fillStyle=p.type==='water'?c.water:'#e1d5b0';g.beginPath();g.ellipse(px(p.x),pz(p.z),p.rx*sx,p.rz*sz,-p.angle,0,Math.PI*2);g.fill();}g.fillStyle=c.trees;for(const t of h.trees){g.beginPath();g.arc(px(t.x),pz(t.z),3.4,0,Math.PI*2);g.fill();}g.strokeStyle='#a98d62';g.lineWidth=2;g.beginPath();g.moveTo(px(h.pin.x),pz(h.pin.z));g.lineTo(px(h.pin.x),pz(h.pin.z)-20);g.stroke();g.fillStyle='#cf9460';g.beginPath();g.moveTo(px(h.pin.x),pz(h.pin.z)-20);g.lineTo(px(h.pin.x)+15,pz(h.pin.z)-14);g.lineTo(px(h.pin.x),pz(h.pin.z)-9);g.fill();mapBackground=bg;}
 ctx.clearRect(0,0,360,460);ctx.fillStyle='#e9efdf';ctx.fillRect(0,0,360,460);mapView.begin(ctx);ctx.drawImage(mapBackground,0,0);for(const p of state.players||[]){if(p.id===state.activePlayerId)continue;ctx.beginPath();ctx.arc(px(p.ball.x),pz(p.ball.z),5,0,Math.PI*2);ctx.fillStyle=PLAYER_COLORS[p.style];ctx.fill();ctx.fillText(p.name,px(p.ball.x)+8,pz(p.ball.z));}ctx.setLineDash([5,7]);ctx.strokeStyle='#647a5488';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px(state.ball.x),pz(state.ball.z));ctx.lineTo(px(h.pin.x),pz(h.pin.z));ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.arc(px(state.ball.x),pz(state.ball.z),7,0,Math.PI*2);ctx.fillStyle='#315440';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.stroke();mapView.end(ctx);
}
let aimTimeout;$('aim').oninput=()=>{const v=Number($('aim').value);$('aim-value').textContent=v===0?'正前方':`${Math.abs(v)}° ${v<0?'左':'右'}`;scene?.setBall(state.ball,v);clearTimeout(aimTimeout);aimTimeout=setTimeout(()=>conn.send({type:'aim',aim:v}),65);};$('reset-aim').onclick=()=>conn.send({type:'aim',aim:0});
function setRoundPower(power){const p=clamp(power,0,1);$('round-power-value').innerHTML=`${Math.round(p*100)}<small>%</small>`;$('round-power-fill').style.height=p*100+'%';}
$('power').oninput=()=>{$('power-value').textContent=$('power').value+'%';setRoundPower(Number($('power').value)/100);};
function activePhone(){const player=state?.players?.find(p=>p.id===state.activePlayerId);return controller.phones?.find(p=>p.id===player?.deviceId);}
function roundBusy(){return !state||state.phase!=='playing'||!wsReady||roundPending||['transferring','swing','flight','settling','splash','cup','holed','landing','moving','boarding','driving','alighting','rehearsal'].includes(scene?.phase);}
function renderRoundControls(){
 if(!state)return;if(state.phase==='transferring'&&state.transfer){const t=state.transfer,progress=clamp((Date.now()-t.startedAt)/t.duration,0,1);$('journey-progress').value=progress;$('journey-status').textContent=`${scene?.journeyLabel||'球车接驳中'} · 约 ${Math.round(t.meters)} 米 · ${state.players.length} 位球手随行`;$('journey-skip').disabled=!wsReady;}const busy=roundBusy(),armed=!!state.armed,phase=scene?.phase||'address';
 const putting=state.phase==='animating'&&lastShot?lastShot.clubId==='putter':state.terrain?.surface==='green'||state.selectedClub?.id==='putter';$('putting-card').hidden=!putting;$('slope-legend').hidden=!scene?.slopeVisible;
 if(putting){const ball=scene?.flight?scene.ball.position:state.phase==='animating'&&lastShot?lastShot.from:state.ball,r=puttingRead(state.hole,ball,state.aim||0);$('putting-grade').textContent=`脚下坡度 ${r.percent.toFixed(1)}%`;$('putting-pace').textContent=`${r.pace} · ${Math.abs(r.along).toFixed(1)}%`;$('putting-break').textContent=r.break;$('putting-rise').textContent=`洞杯比球位${r.rise>=0?'高':'低'} ${Math.abs(r.rise*100).toFixed(0)} 厘米`;$('putting-speed').textContent=scene?.flight?`当前球速 ${Number(scene.rollSpeed||0).toFixed(2)} 米/秒`:'轻推控制入洞速度，侧坡越明显越要留出借位';}
 const showLanding=['settling','landing','moving','boarding','driving','alighting'].includes(phase),terrain=state.phase==='animating'&&!showLanding&&lastShot?.terrain?lastShot.terrain:state.terrain;if(terrain){$('terrain-condition').textContent=`${showLanding?'落点 · ':''}${terrain.name} · ${terrain.condition}`;$('terrain-speed').textContent=`${showLanding?(state.selectedClub?.name||'')+' · ':''}出球速度 ${terrain.speedPercent}%`;$('terrain-roll').textContent=terrain.roll;$('terrain-tip').textContent=terrain.tip;}
 for(const id of ['hit-button','round-arm','aim','power','reset-aim','round-club'])$(id).disabled=busy;
 $('hit-button').disabled=busy||!!state.multiplayer;$('round-arm').disabled=busy||(state.multiplayer&&!activePhone()?.calibrated);
 $('hit-button').textContent=state.multiplayer?'使用当前手机挥杆':roundPending?'正在识别…':busy?'请稍候…':armed?'按此力度击球':'试挥一次';$('round-arm').textContent=armed?'取消准备':'准备击球 →';$('round-mode').textContent=state.phase==='animating'?'击球中 · 观看落点':armed?'已准备 · 下一挥计杆':'试挥模式 · 不计杆数';
 $('game').classList.toggle('round-armed',armed);$('control-hint').textContent=state.multiplayer?'轮到 '+(state.players.find(p=>p.id===state.activePlayerId)?.name||'')+' · 请使用绑定手机试挥与击球':armed?'已准备：挥动手机，或按住空格再松开击球':'先试挥找手感，再点击准备击球 · 空格可蓄力';
 if(view==='game'){
  if(phase==='cup'||phase==='holed')$('shot-heading').textContent=phase==='cup'?'贴着洞缘，落入洞杯。':'进洞！这一杆很漂亮。';
  else if(phase==='settling')$('shot-heading').textContent=lastShot?.endSurface==='sand'?'球缓缓陷入沙中，下一杆留意球位。':'草叶包住球，滚动停下来了。';
  else if(phase==='splash')$('shot-heading').textContent='落水了，加罚一杆。';
  else if(scene?.impactUntil>performance.now())$('shot-heading').textContent=scene.impactLabel;
  else if(['boarding','driving','alighting'].includes(phase))$('shot-heading').textContent=({boarding:'上车，前往新的球位。',driving:'球车接送中，欣赏沿途风景。',alighting:'到站了，下车准备下一杆。'})[phase];
  else if(phase==='moving')$('shot-heading').textContent='走到球边，准备下一杆。';
  else if(phase==='landing')$('shot-heading').textContent=lastShot?.penalty?'加罚一杆，返回有效球位。':lastShot?.endSurface==='sand'?'球已陷沙，抵达后可换沙坑杆。':lastShot?.endSurface==='rough'?'球停在长草中，下一杆多留飞行距离。':'看清落点，调整下一杆。';
  else if(state.phase==='animating')$('shot-heading').textContent=lastShot?.clubId==='putter'?'观察球速与侧坡带来的弯曲。':'看球飞向下一片落点。';
  else if(phase==='rehearsal')$('shot-heading').textContent='试挥找手感，球留在原位。';
  else $('shot-heading').textContent=armed?'已准备，下一挥就出球。':'先试挥，再挥出这一杆。';
 }
 $('round-recenter').disabled=['swing','flight','settling','splash','cup','holed','moving','boarding','driving','alighting'].includes(phase);
 $('camera-button').textContent=scene?.view==='overview'?'↙ 人物视角':'↗ 球道俯视';
}
function hit(){if(roundBusy()||state.multiplayer)return;clearTimeout(aimTimeout);const aim=Number($('aim').value);if(aim!==state.aim){conn.send({type:'aim',aim});toast('方向已更新，可以挥杆了。');return;}seq++;sessionStorage.setItem('swinglink-seq',String(seq));if(conn.send({type:'swing',power:Number($('power').value)/100,dir:0,seq,stateVersion:state.stateVersion})){roundPending=true;clearTimeout(roundTimer);roundTimer=setTimeout(()=>{roundPending=false;renderRoundControls();},4000);renderRoundControls();}}
$('round-arm').onclick=()=>{if(!roundBusy())conn.send({type:'round_arm',armed:!state.armed});};
$('round-avatar').onchange=()=>{const style=$('round-avatar').value;localStorage.setItem('swinglink-avatar',style);scene?.setStyle(style);training.avatarStyle=style;document.getElementById('avatar-style').value=style;training.scene?.setStyle(style);};
$('round-recenter').onclick=()=>scene?.resetAddress();
setInterval(()=>{if(view!=='game')return;const live=wsReady&&(state?.multiplayer?activePhone()?.calibrated:controller.calibrated)&&performance.now()-lastMotionAt<1800;if(!live){for(const k of ['alpha','beta','gamma'])$('round-'+k).textContent='—';}$('round-motion-status').textContent=live?'体感视角实时连接 · 度/秒':controller.connected?'等待手机体感数据':'连接手机，轻转观察人物视角';renderRoundControls();},250);
$('hit-button').onclick=hit;
document.addEventListener('keydown',e=>{if(e.code!=='Space'||view!=='game'||document.querySelector('dialog[open]')||(e.target.matches('input,select,textarea')||(e.target.matches('button')&&!['round-arm','hit-button'].includes(e.target.id)))||e.repeat||roundBusy()||state.multiplayer)return;e.preventDefault();charging=true;chargeStart=performance.now();chargeTimer=setInterval(()=>{const t=(performance.now()-chargeStart)/1500,p=.02+.98*(1-Math.abs((t%2)-1));$('power').value=Math.round(p*100);$('power').oninput();},25);});
document.addEventListener('keyup',e=>{if(e.code==='Space'&&charging){e.preventDefault();charging=false;clearInterval(chargeTimer);hit();}});window.addEventListener('blur',()=>{charging=false;clearInterval(chargeTimer);});
$('cup-button').onclick=()=>scene?.focusCup();
$('overview-button').onclick=()=>scene?.overview();$('camera-button').onclick=()=>scene?.overview();$('slope-button').onclick=()=>{$('slope-button').classList.toggle('active',scene?.toggleSlope());if(state){const slope=slopeAt(state.hole,state.hole.pin.x,state.hole.pin.z);toast(`果岭坡度：${(Math.hypot(slope.x,slope.z)*100).toFixed(1)}%。箭头朝向下坡；越暖、流动越快，坡度越大。`);}};$('sound-button').onclick=()=>{soundOn=!soundOn;ambience.setEnabled(soundOn);if(!soundOn)spatialAudio.clear();if(soundOn)ambience.unlock();$('sound-button').setAttribute('aria-pressed',String(soundOn));localStorage.setItem('swinglink-sound',soundOn?'on':'off');$('sound-button').style.opacity=soundOn?1:.4;toast(soundOn?'球场音效已开启':'球场音效已关闭');};
function openScore(completed=false){if(!state)return;const end=state.phase==='finished',last=state.scores.at(-1),names={[-3]:'信天翁！低于标准杆三杆',[-2]:'老鹰球！低于标准杆两杆',[-1]:'小鸟球！低于标准杆一杆',0:'稳稳打出标准杆。',1:'高出一杆，下一洞继续。'};$('score-eyebrow').textContent=end?'一场好球，一段好时光':completed?`第 ${state.holeIndex+1} 洞完成`:'认真打好每一杆';$('score-title').textContent=end?'这一局，打得尽兴。':completed?last?.capped?'下一洞，重新出发。':names[last.strokes-last.par]||'又完成了一洞。':'这一局的成绩。';$('score-description').textContent=`${COURSES.find(c=>c.id===state.courseId).name} · ${state.mode} 洞${last?.capped?' · 已达到 12 杆上限':''}`;
 $('score-rows').innerHTML=Array.from({length:state.mode},(_,i)=>{const s=state.scores.find(x=>x.hole===i+1),data=COURSES.find(c=>c.id===state.courseId).holes[i];return `<div class="score-row"><span>${String(i+1).padStart(2,'0')} <small>${data[0]}</small></span><small>标准杆 ${data[1]}</small><span>${s?s.strokes+(s.capped?'*':''):'—'}</span><span>${s?relativeScore(s.strokes-s.par):'—'}</span></div>`;}).join('');$('score-summary').textContent=relativeScore(scoreTotal());$('score-actions').innerHTML=completed?end?(state.returnedToClubhouse?'<button class="secondary" id="change-course">更换球场</button><button class="primary" id="replay">再来一局 →</button>':'<button class="primary" id="return-clubhouse">乘球车返回会所 →</button><button class="secondary" id="change-course">更换球场</button>'):'<button class="primary" id="next-hole">乘球车前往下一洞 →</button>':'<button class="primary" id="back-game">回到球场 →</button>';
 $('return-clubhouse')?.addEventListener('click',()=>{$('score-dialog').close();conn.send({type:'return_clubhouse'});});
 $('next-hole')?.addEventListener('click',()=>{$('score-dialog').close();lastShot=null;conn.send({type:'next_hole'});});$('replay')?.addEventListener('click',()=>{$('score-dialog').close();conn.send({type:'start_round',courseId:state.courseId,mode:state.mode,multiplayer:state.multiplayer,playerIds:state.players.map(p=>p.deviceId)});});$('change-course')?.addEventListener('click',()=>{$('score-dialog').close();conn.send({type:'lobby'});});$('back-game')?.addEventListener('click',()=>$('score-dialog').close());multiplayer.score(state);if(!$('score-dialog').open)$('score-dialog').showModal();}
$('score-button').onclick=()=>openScore(['hole_complete','finished'].includes(state?.phase));
conn.addEventListener('message',({detail:m})=>{
 if(m.type==='ready'){wsReady=true;$('start-button').disabled=false;conn.send({type:'round_view',active:view==='game'});}
 if(m.type==='room_state'){if(state&&m.state.stateVersion<state.stateVersion)return;const previous=state;state=m.state;if(previous?.clubId!==state.clubId&&state.phase==='playing'){$('round-preview').textContent='球杆已更新，请先试挥';$('round-power-reference').style.display='none';if(scene?.forecast)scene.forecast.visible=false;}if(state.phase==='lobby'){if(view==='game')showView('lobby');}else if(view==='lobby'||(previous?.phase==='lobby'&&state.phase==='playing'))showView('game');renderState();}
 if(m.type==='controller_status'){controller=m;updateController();}
 if(m.type==='sensor_sample'&&m.scope==='round'&&view==='game'){const t=m.sample;lastMotionAt=performance.now();scene?.sample(t);for(const k of ['alpha','beta','gamma'])$('round-'+k).textContent=Math.round(t[k]);if(t.stage==='ready'&&['BACK','DOWN'].includes(t.state))setRoundPower(clamp(Math.pow(clamp(Math.abs(t[t.axis])/(t.peakMax||600)*(m.settings?.powerGain||1),0,1),m.settings?.gamma||1.6),0,1));}
 if(m.type==='round_rehearsal'||m.type==='shot_result'){clearTimeout(roundTimer);roundPending=false;const shot=m.shot;setRoundPower(shot.power);$('round-power-reference').style.display='block';$('round-power-reference').style.bottom=shot.power*100+'%';$('round-preview').textContent=(m.type==='round_rehearsal'?'试挥参考 ':'本杆距离 ')+shot.travel.toFixed(1)+' 米';if(view==='game'){if(m.type==='round_rehearsal')scene?.rehearse(shot,m.source);else{lastShot=shot;scene?.playShot(shot,m.source);watchShot('round',shot,m.source);}}renderRoundControls();}
 if(m.type==='error'){roundPending=false;clearTimeout(roundTimer);toast(m.message);renderState();}
});conn.addEventListener('offline',()=>{wsReady=false;roundPending=false;lastMotionAt=0;$('start-button').disabled=true;renderState();toast('正在重新连接本地游戏…');});conn.connect();
