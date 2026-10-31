import {MazeRoom,loadRecords,totalStars} from './maze.js';
import {SkyrollSfx} from './skyroll-sfx.js';
import {LEVELS as SKY_LEVELS} from '../shared/maze/levels.js';
import {CourseAtlas,courseArt} from './course-atlas.js';
import {courseSummary,challengeLabel} from '../shared/course-layout.js';
import {SpatialGolfAudio} from './spatial-audio.js';
import {ShotAudioMix} from './audio-mix.js';
import {CourseAmbience} from './soundscape.js';
import {puttingRead} from '../shared/putting.js';
import {SoundSystem,MusicDirector} from './music.js';
import {SoundSettings,soundGains,audible} from './sound-settings.js';
import {initSoundPanel} from './sound-panel.js';
import {CLUBS} from '../shared/clubs.js';
import {MapView} from './view-controls.js';
import {ClubPreview} from './club-preview.js';
import {Multiplayer} from './multiplayer.js';
import {PLAYER_COLORS} from '../shared/players.js';
import {COURSES,makeHole,clamp,distance,heightAt,surfaceAt,slopeAt,clubFor} from '../shared/courses.js';
import {Connection} from '../shared/connection.js';
import {PlayerScene} from './player-scene.js';
import {TrainingRoom} from './training.js';
import {MLLab} from './ml-lab.js';
const $=id=>document.getElementById(id);
const icons={phone:'<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/>',arrow:'<path d="M4 12h15m-5-5 5 5-5 5"/>',mouse:'<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 3v6"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',back:'<path d="m14 6-6 6 6 6"/>',grid:'<path d="M3 7h18M3 12h18M3 17h18M7 3v18M12 3v18M17 3v18"/>',aim:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/>',camera:'<rect x="2" y="6" width="20" height="15" rx="3"/><path d="m7 6 2-3h6l2 3"/><circle cx="12" cy="13" r="4"/>',sound:'<path d="m3 9 4 0 5-5v16l-5-5H3zM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>'};
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[el.dataset.icon]||''}</svg>`);
let selected='orchard',mode=9,state=null,view='hub',scene,wsReady=false,controller={connected:false,calibrated:false},seq=Number(sessionStorage.getItem('swinglink-seq')||0),loadedKey='',toastTimer,charging=false,chargeStart=0,chargeTimer,logs=[],lastShot=null,mapBackground=null;
let roundPending=false,roundTimer,lastMotionAt=0;
// 声音：一个 AudioContext，音乐 / 音效 / 环境声三路母线；音乐按场景（游戏大厅、高尔夫各页面、滚球地图与章节）自动切换。
const soundSettings=new SoundSettings(localStorage),sound=new SoundSystem(),music=new MusicDirector(sound,soundSettings),audioMix=new ShotAudioMix();
const ambience=new CourseAmbience(()=>sound.context,{enabled:audible(soundSettings.value,'ambience'),output:()=>sound.output('ambience')});
const spatialAudio=new SpatialGolfAudio(()=>sound.context,position=>activeSoundScene()?.audioFrame(position),{output:()=>sound.output('effects')});
const effectsOn=()=>audible(soundSettings.value,'effects');
sound.apply(soundGains(soundSettings.value));
soundSettings.on(v=>{sound.apply(soundGains(v));ambience.setEnabled(audible(v,'ambience'));if(music.unlocked)ambience.unlock();if(!audible(v,'effects'))spatialAudio.clear();music.sync();});
initSoundPanel({settings:soundSettings,director:music,toast:(...a)=>toast(...a)});
// 窄屏球局里，顶栏按钮和风向卡贴在击球面板上方：按面板实际高度定位，避免互相遮挡。
{const dock=document.querySelector('.shot-dock');if(dock&&window.ResizeObserver)new ResizeObserver(()=>document.body.style.setProperty('--dock-h',Math.round(dock.getBoundingClientRect().height)+'px')).observe(dock);}
function activeSoundScene(){return view==='lab'?training.scene:scene;}
const soundScope=()=>view==='lab'?'practice':'round';
function watchShot(scope,shot,source){audioMix.begin(scope,performance.now(),shot.duration*1000+(source==='phone'?100:540)+400);}
function soundPhase(scope,phase){if(['landing','holed','address'].includes(phase))audioMix.settle(scope);}
let audioClock=performance.now();const audioTimer=setInterval(()=>{const now=performance.now(),gain=audioMix.update(now,Math.min(1,(now-audioClock)/1000));audioClock=now;sound.setDuck(soundSettings.value.duck&&effectsOn()?gain:1);ambience.update(gain);spatialAudio.update();},50);
const unlockAudio=()=>{ambience.unlock();music.unlock();};document.addEventListener('pointerdown',unlockAudio);document.addEventListener('keydown',unlockAudio);
// 环境声（风声鸟鸣）只属于高尔夫球场；音乐在所有页面都有。
const golfView=()=>['lobby','game','lab'].includes(view);
document.addEventListener('visibilitychange',()=>{ambience.setVisible(!document.hidden&&golfView());music.setVisible(!document.hidden);if(document.hidden)spatialAudio.clear();});
window.addEventListener('pagehide',()=>{ambience.setVisible(false);music.setVisible(false);spatialAudio.clear();});window.addEventListener('pageshow',()=>{ambience.setVisible(!document.hidden&&golfView());music.setVisible(!document.hidden);if(document.hidden)spatialAudio.clear();});
const conn=new Connection('screen');
const multiplayer=new Multiplayer(conn,toast);
const training=new TrainingRoom($('lab'),conn,{connect:pair,toast,tone,onShot:(shot,source)=>{if(view==='lab')watchShot('practice',shot,source);},onPhase:phase=>{if(view==='lab')soundPhase('practice',phase);},onImpact:e=>{if(view==='lab')impactSound(e);}});
const mlLab=new MLLab($('lab'),conn,{toast});
const skySfx=new SkyrollSfx(()=>sound.context,()=>sound.output('effects'),{enabled:effectsOn});
const maze=new MazeRoom($('maze'),conn,{pair,sfx:skySfx,toast,onView:(sub,chapter)=>{if(view==='maze'){music.setScene(sub==='play'?'sky-play':'sky-map',chapter);setRoute();renderNav();}},onWin:()=>{music.sting('sting-win');renderHub();}});
const mapView=new MapView($('minimap'),drawMap),clubPreview=new ClubPreview();
$('round-club').innerHTML='<option value="auto">自动推荐</option>'+CLUBS.map(c=>`<option value="${c.id}">${c.name} · ${c.range} 米</option>`).join('');
function chooseClub(clubId){if(!roundBusy())conn.send({type:'round_club',clubId,stateVersion:state.stateVersion});}
$('round-club').onchange=()=>chooseClub($('round-club').value);
$('club-details').onclick=()=>clubPreview.show(state?.selectedClub?.id||'iron',{choose:chooseClub,canChoose:()=>!roundBusy()});
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),4000);}
function tone(){audioMix.impact(soundScope(),'hit',performance.now());if(!effectsOn()||document.hidden)return;spatialAudio.strike(activeSoundScene()?.lastResult);}
function impactSound(event){
 if(event.type!=='ground')audioMix.impact(soundScope(),event.type,performance.now());
 if(!effectsOn()||document.hidden)return;spatialAudio.impact(event);
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
// ---------- 页面层级：游戏大厅 → 高尔夫（球场 / 球局 / 练习室 / 挥杆识别）| 云端滚球（地图 / 关卡） ----------
const GAME_OF={hub:'hub',lobby:'golf',game:'golf',lab:'golf',maze:'skyroll'};
function musicScene(){return view==='hub'?['hub']:view==='lobby'?['golf-lobby']:view==='game'?['golf-round']:view==='lab'?['golf-practice']:[maze.view==='play'?'sky-play':'sky-map',maze.game.level.chapter];}
function routeOf(){return view==='hub'?'#/':view==='lobby'?'#/golf':view==='game'?'#/golf/round':view==='lab'?(mlLab.tab&&mlLab.tab!=='practice'?'#/golf/lab':'#/golf/practice'):maze.view==='play'?'#/skyroll/play':'#/skyroll';}
function setRoute(){const r=routeOf();if(location.hash!==r)history.replaceState(null,'',r);}
function renderNav(){const game=GAME_OF[view];document.body.dataset.game=game;document.body.dataset.view=view;for(const [id,g] of [['hub-tab','hub'],['golf-tab','golf'],['maze-tab','skyroll']])$(id).classList.toggle('active',g===game);const ml=view==='lab'&&mlLab.tab&&mlLab.tab!=='practice';$('play-tab').classList.toggle('active',view==='lobby'||view==='game');$('lab-tab').classList.toggle('active',view==='lab'&&!ml);$('ml-tab').classList.toggle('active',ml);$('sky-map-tab').classList.toggle('active',view==='maze'&&maze.view==='map');$('play-tab').textContent=state&&state.phase!=='lobby'?'球局中':'球场';document.title=game==='skyroll'?'云端滚球 · 挥杆之间':game==='golf'?'高尔夫 · 挥杆之间':'挥杆之间 · 体感游戏厅';}
function showView(next,{sub}={}){if(next!=='game')scene?.endJourney();audioMix.clear();spatialAudio.clear();view=next;const [ms,chapter]=musicScene();music.setScene(ms,chapter);ambience.setVisible(!document.hidden&&golfView());ambience.setWeather(next==='lab'?0:next==='game'?(state?.hole?.wind?.speed||0):makeHole(selected,0,421).wind.speed);for(const id of ['hub','lobby','game','lab','maze'])$(id).classList.toggle('hidden',id!==next);document.body.classList.toggle('in-round',next==='game');if(next!=='game')scene?.skipIntro?.();maze.show(next==='maze',sub);training.show(next==='lab');mlLab.show(next==='lab');conn.send({type:'round_view',active:next==='game'});conn.send({type:'screen_view',game:GAME_OF[next],view:next});updateController();charging=false;clearInterval(chargeTimer);if(next==='lobby'){scene?.mount($('preview'),true);selectCourse(selected);}else if(next==='game'){scene?.mount($('game-canvas'),false);loadedKey='';renderState();}if(next==='hub')renderHub();const [ms2,ch2]=musicScene();music.setScene(ms2,ch2);setRoute();renderNav();window.scrollTo({top:0});}
function openGolf(){showView(state&&state.phase!=='lobby'?'game':'lobby');}
function openLab(tab){showView('lab');if(tab)mlLab.setTab(tab);else if(mlLab.tab!=='practice')mlLab.setTab('practice');setRoute();renderNav();}
// 地址栏：#/、#/golf、#/golf/round、#/golf/practice、#/golf/lab、#/skyroll、#/skyroll/play；兼容旧的 #maze。
function applyRoute(hash=location.hash){const h=hash.replace(/^#\/?/,'');if(h==='maze'||h.startsWith('skyroll'))showView('maze',{sub:h.endsWith('/play')?'play':'map'});else if(h==='golf/practice')openLab('practice');else if(h==='golf/lab')openLab(mlLab.tab&&mlLab.tab!=='practice'?mlLab.tab:'collect');else if(h.startsWith('golf'))openGolf();else showView('hub');}
window.addEventListener('hashchange',()=>{if(location.hash!==routeOf())applyRoute();});
{const lab=$('lab');if(window.MutationObserver)new MutationObserver(()=>{if(view==='lab'){setRoute();renderNav();}}).observe(lab,{attributes:true,attributeFilter:['data-lab-tab']});}
// 游戏大厅：两张游戏卡显示各自的进度，手机卡显示连接状态。
function renderHub(){const golf=$('hub-golf-status'),sky=$('hub-sky-status');if(state&&state.phase!=='lobby'){const c=COURSES.find(c=>c.id===state.courseId);golf.textContent=`球局进行中 · ${c?.name||''} 第 ${(state.holeIndex??0)+1} 洞`;golf.classList.add('live');}else{golf.textContent='六座球场 · 随时开一局';golf.classList.remove('live');}const records=loadRecords(localStorage),done=SKY_LEVELS.filter(l=>records[l.id]).length;sky.textContent=done?`★ ${totalStars(records)} / 27 · 已完成 ${done} / ${SKY_LEVELS.length} 张`:'9 张地图等你出发';}
try{scene=new PlayerScene($('preview'),phase=>{if(view==='game'){soundPhase('round',phase);if(phase==='flight')tone();if(phase==='holed')music.sting('sting-hole');}renderRoundControls();updateGuide();});scene.onImpact=e=>{if(view==='game')impactSound(e);renderRoundControls();};scene.onIntro=active=>showIntro(active);scene.onFrame=()=>{placeGuideLabel();mapTick();};scene.onViewChange=()=>{scheduleMap();renderRoundControls();};selectCourse(selected);}catch(e){$('preview').innerHTML='<div style="padding:40px">三维球场需要 WebGL。请启用浏览器硬件加速，或使用 Chrome、Edge、Safari 打开挥杆之间。</div>';toast('当前浏览器无法显示三维球场。');console.error(e);}
renderCards();
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=Number(b.dataset.mode);document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('selected',x===b));});
$('start-button').onclick=()=>{if(!wsReady)return toast('正在重新连接本地游戏服务。');if(!scene)return toast('请先启用 WebGL，再开始本局。');const options=multiplayer.options();if(options)conn.send({type:'start_round',courseId:selected,mode,...options});};
$('play-tab').onclick=openGolf;$('golf-tab').onclick=openGolf;$('hub-golf').onclick=openGolf;$('brand').onclick=()=>showView('hub');$('hub-tab').onclick=()=>showView('hub');$('hub-connect').onclick=()=>pair();
$('clubhouse-button').onclick=()=>{if(['animating','transferring'].includes(state?.phase))return toast('请等球停稳或球车到站。');conn.send({type:'lobby'});showView('lobby');};
$('maze-tab').onclick=()=>showView('maze');$('hub-sky').onclick=()=>showView('maze');$('sky-map-tab').onclick=()=>showView('maze',{sub:'map'});$('sky-pad-tab').onclick=()=>{if(view!=='maze')showView('maze');maze.settings(true);};
$('lab-tab').onclick=()=>openLab('practice');$('ml-tab').onclick=()=>openLab(mlLab.tab&&mlLab.tab!=='practice'?mlLab.tab:'collect');$('round-lab').onclick=()=>openLab('practice');$('help-button').onclick=()=>{if(view==='maze'){maze.pause('manual');$('sky-help-dialog').showModal();}else $('help-dialog').showModal();};
document.querySelectorAll('.dialog-close,.dialog-dismiss').forEach(b=>b.onclick=()=>b.closest('dialog').close());document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
async function pair(){if(!conn.config)try{conn.config=await fetch('/api/config').then(r=>r.json());}catch{return toast('请先启动本地游戏服务，再连接手机。');}const c=conn.config;$('pair-eyebrow').textContent=view==='maze'?'连接手机，握住平衡':'连接手机，走进球场';$('pair-title').innerHTML=view==='maze'?'横向端住手机。<br>轻轻倾斜。':'拿起手机。<br>准备挥杆。';$('pair-note').textContent=view==='maze'?'手机只作手柄，观察电脑赛道。无法启用倾斜时可使用虚拟摇杆。':'请握紧手机，确认周围有足够的挥杆空间。';$('qr').innerHTML=c.qr;$('phone-link').href=c.phoneUrl;const ca=`http://${c.addresses[0]||'localhost'}:${c.port}/local-ca.cer`;
 $('https-instructions').innerHTML=c.secure?`<ol><li>在 iPhone 上打开<a href="${ca}" target="_blank" rel="noopener">本地证书下载链接</a>，在“设置 → 通用 → VPN 与设备管理”中安装下载的描述文件。</li><li>在“设置 → 通用 → 关于本机 → 证书信任设置”中启用<b id="ca-name"></b>。</li><li>重新扫码，然后点击“${view==='maze'?'启用倾斜控制':'启用体感'}”。</li></ol><p>两台设备需连接同一无线网络。如果无法打开页面，请允许游戏服务通过家庭网络的防火墙。</p>`:'<p>iPhone 体感需要受信任的 HTTPS 连接。请在电脑上运行<code>npm run setup:https</code>并重启游戏，再打开此面板获取证书和连接二维码。Mac 用户也可双击“配置手机连接.command”。</p>';
 if($('ca-name'))$('ca-name').textContent=c.caName||'挥杆之间 本地证书';$('pair-dialog').showModal();updateController();}
$('connect-button').onclick=pair;$('lab-connect').onclick=pair;
function updateController(){$('game').classList.toggle('has-phone',controller.connected);multiplayer.update(controller.phones);if(state)multiplayer.round(state);$('phone-status').textContent=controller.count>1?`${controller.count} 台手机已连接`:controller.calibrated?'手机已就绪':controller.connected?'等待启用体感':'连接手机';document.querySelector('.connection-dot').classList.toggle('connected',controller.connected);const modelPhone=controller.phones?.some(p=>p.connected&&p.calibrated&&p.calibration?.mode==='model');$('pair-state').innerHTML=`<i></i>${modelPhone?'已连接 · 模式识别，可以挥杆了。':controller.calibrated?'已连接 · 免校准规则，可以挥杆了。':controller.connected?'手机已连接，请在手机上点“启用体感”（无需校准）。':'等待手机连接'}`;if(view==='maze'){$('phone-status').textContent=maze.controller.ready?'滚球手柄已就绪':maze.controller.connected?'等待启用手柄':'连接手机';$('pair-state').innerHTML='<i></i>'+(maze.controller.ready?'滚球手柄已就绪，可以关闭此面板。':maze.controller.connected?'请在手机选择“启用倾斜控制”或“虚拟摇杆”。':'等待手机连接');}if(!controller.calibrated)scene?.motionView.reset();renderHubPhone();renderRoundControls();}
function renderHubPhone(){const n=controller.count||(controller.connected?1:0),card=$('hub-phone');card.classList.toggle('connected',controller.connected);$('hub-phone-title').textContent=controller.connected?(n>1?`${n} 台手机已连接`:'手机已连接'):'还没有连接手机';$('hub-phone-detail').textContent=controller.connected?(maze.controller.ready?'滚球手柄已就绪；进入高尔夫后点“启用体感”就能挥杆。':controller.calibrated?'体感已启用，可以挥杆；进入云端滚球后手机会自动切成手柄。':'在手机上点“启用体感”，或进入云端滚球选择手柄。'):'用 iPhone 相机扫码，手机就成了球杆和手柄。';$('hub-connect').textContent=controller.connected?'再连一台':'连接手机';}

function scoreTotal(){return state?.scores.reduce((s,h)=>s+h.strokes-h.par,0)||0;}
const relativeScore=s=>s===0?'平杆':s>0?'+'+s:String(s);
function renderState(){
 if(!state)return;const transferring=state.phase==='transferring',atClubhouse=state.phase==='finished'&&!!state.returnedToClubhouse;$('game').classList.toggle('at-clubhouse',atClubhouse);$('clubhouse-hud').hidden=!atClubhouse;if(atClubhouse)$('clubhouse-result').textContent=`完成 ${state.mode} 洞 · ${state.players.length} 位球手 · ${COURSES.find(c=>c.id===state.courseId).name}`;$('game').classList.toggle('is-transferring',transferring);$('journey-hud').hidden=!transferring;if(!transferring&&!state.returnedToClubhouse&&scene?.journey){scene.endJourney();loadedKey='';}
const current=multiplayer.round(state);$('round-avatar').disabled=!!current?.deviceId;const h=state.hole,c=COURSES.find(c=>c.id===state.courseId),key=`${state.courseId}-${state.holeIndex}-${state.seed}-${state.activePlayerId}`;
 if(view==='game'&&scene&&loadedKey!==key){scene.setStyle(state.players?.find(p=>p.id===state.activePlayerId)?.style||localStorage.getItem('swinglink-avatar')||'sage');$('round-avatar').value=scene.style;scene.load(h);loadedKey=key;mapBackground=null;mapView.reset();$('round-preview').textContent='看着落点预判调好力度';$('round-power-reference').style.display='none';scene.setBall(state.ball,state.aim);scene.setCamera(true);maybeIntro();}
 if(view==='game'&&scene){scene.setStyle(current?.deviceId?current.style:$('round-avatar').value);scene.setPlayers?.(state.players,state.activePlayerId);}
 if(view==='game'&&!['animating','transferring'].includes(state.phase)){scene?.setClub(state.selectedClub?.id||clubFor(h,state.ball).id);scene?.setHoled(current?.holeDone);scene?.finish(state.ball,state.aim);}
 const d=distance(state.ball,h.pin),club=(state.phase==='animating'&&lastShot?CLUBS.find(c=>c.id===lastShot.clubId):null)||state.selectedClub||clubFor(h,state.ball),lie=surfaceAt(h,state.ball.x,state.ball.z);
 if(view==='game'&&state.returnedToClubhouse&&state.clubhouseVisit)scene?.beginJourney({...state,transfer:state.clubhouseVisit});
 if(view==='game'&&transferring){$('score-dialog').close();scene?.beginJourney(state);$('journey-title').textContent=state.transfer.toIndex===null?`${state.mode} 洞完成，返回会所`:`第 ${state.holeIndex+1} 洞 → 第 ${state.transfer.toIndex+1} 洞`;$('journey-next').textContent=state.transfer.toIndex===null?'本轮计分卡已保存，回到会所查看成绩。':c.holes[state.transfer.toIndex][4].advice;}
 $('course-hole-tip').textContent=`${challengeLabel(h.challenge)} · ${h.advice}`;$('game').classList.toggle('has-roster',!!state.multiplayer);$('game').classList.toggle('is-animating',state.phase==='animating');$('game').classList.toggle('lie-plain',['tee','fairway'].includes(state.terrain?.surface)&&state.phase!=='animating');
 $('game-course').textContent=c.name.toUpperCase();$('hole-number').textContent=String(state.holeIndex+1).padStart(2,'0');$('hole-name').textContent=h.name;$('hole-meta').innerHTML=`标准杆 ${h.par} <span>·</span> ${h.length} 米`;
 $('score-total').textContent=relativeScore(scoreTotal());$('distance').textContent=d<10?d.toFixed(1):Math.round(d);$('club').textContent=club.name;$('club-range').textContent=`参考距离 ${club.range} 米`;$('round-club').value=state.phase==='animating'?club.id:state.clubId||'auto';$('round-club').options[0].textContent=`推荐 · ${state.recommendedClub?.name||club.name}`;$('club-swatch').className='club-swatch swatch-'+club.id;$('stroke').textContent=state.strokes;$('hole-progress').textContent='杆';$('lie').textContent=({tee:'发球台',fairway:'球道',rough:'长草区',green:'果岭',sand:'沙坑'}[lie]||lie.toUpperCase());
 
 if(view==='game')ambience.setWeather(h.wind.speed);$('wind-speed').textContent=h.wind.speed.toFixed(1);const heading=Math.atan2(h.pin.x-state.ball.x,h.pin.z-state.ball.z)+state.aim*Math.PI/180,tail=h.wind.x*Math.sin(heading)+h.wind.z*Math.cos(heading),cross=h.wind.x*Math.cos(heading)-h.wind.z*Math.sin(heading);
 $('wind-arrow').style.transform=`rotate(${Math.atan2(cross,tail)*180/Math.PI}deg)`;document.querySelector('.hud-wind').classList.toggle('calm',h.wind.speed<.3);$('wind-relative').textContent=h.wind.speed<.3?'几乎无风':`${tail>=0?'顺风':'逆风'} ${Math.abs(tail).toFixed(1)} · 侧风 ${cross>=0?'→':'←'} ${Math.abs(cross).toFixed(1)}`;
 $('aim').value=state.aim;syncRange($('aim'));$('aim-value').textContent=state.aim===0?'正前方':`${Math.abs(state.aim)}° ${state.aim<0?'左':'右'}`;if(view==='game'&&state.phase==='playing'&&scene?.phase==='address')scene.setBall(state.ball,state.aim);
 renderRoundControls();
 const elev=heightAt(h,h.pin.x,h.pin.z)-heightAt(h,state.ball.x,state.ball.z);$('elevation-label').textContent=`${elev>=0?'↗':'↘'} ${Math.abs(elev).toFixed(1)} 米高差`;
 if(state.phase==='playing'){$('shot-eyebrow').textContent=lie==='green'?'轻轻一推，留一点耐心':'放松呼吸，找到你的线路';$('shot-heading').textContent=state.strokes===0?'第一杆，由你挥出。':lie==='green'?'让球慢慢滚向洞口。':lastShot?.penalty?'加罚一杆，重新找回节奏。':'准备好，下一杆。';}
 drawMap();renderRoundControls();updateGuide();
 if(['hole_complete','finished'].includes(state.phase)&&view==='game')openScore(true);
}
function drawMap(){if(!state)return;const canvas=$('minimap'),ctx=canvas.getContext('2d'),h=state.hole,c=COURSES.find(c=>c.id===state.courseId),sx=2.2,sz=390/(h.length+35),px=x=>180+x*sx,pz=z=>430-(z+10)*sz;mapDrawnAt=performance.now();
 if(!mapBackground){const bg=document.createElement('canvas');bg.width=360;bg.height=460;const g=bg.getContext('2d');g.fillStyle='#e9efdf';g.beginPath();g.roundRect(0,0,360,460,65);g.fill();g.lineCap='round';g.lineJoin='round';g.strokeStyle=c.fairway;g.lineWidth=h.width*sx*2;g.beginPath();h.route.forEach((p,i)=>i?g.lineTo(px(p.x),pz(p.z)):g.moveTo(px(p.x),pz(p.z)));g.stroke();g.fillStyle=c.green;g.beginPath();g.ellipse(px(0),pz(h.length),h.greenRadius*sx,h.greenRadius*sz,0,0,Math.PI*2);g.fill();for(const p of h.hazards){g.fillStyle=p.type==='water'?c.water:'#e1d5b0';g.beginPath();g.ellipse(px(p.x),pz(p.z),p.rx*sx,p.rz*sz,-p.angle,0,Math.PI*2);g.fill();}g.fillStyle='#b9b8a6';for(const r of h.rocks||[]){g.beginPath();g.ellipse(px(r.x),pz(r.z),Math.max(2,r.sx*1.6*sx*.6),Math.max(2,r.sz*1.6*sz*.6),0,0,Math.PI*2);g.fill();}g.fillStyle=c.trees;for(const t of h.trees){g.beginPath();g.arc(px(t.x),pz(t.z),3.4,0,Math.PI*2);g.fill();}mapBackground=bg;}
 ctx.clearRect(0,0,360,460);ctx.fillStyle='#e9efdf';ctx.fillRect(0,0,360,460);mapView.begin(ctx);ctx.drawImage(mapBackground,0,0);
 // 0.22 动态标线：镜头视野扇形、瞄准线（随方向与力度变化）、无风落点与停球点、风偏落点、朝下风飘动的旗帜。
 const cam=view==='game'&&scene?.mapCamera?.();if(cam&&state.phase!=='lobby'){const r=cam.view==='overview'?70:58,a0=cam.heading-cam.hfov/2,a1=cam.heading+cam.hfov/2,P=(x,z)=>[px(x),pz(z)];ctx.save();ctx.fillStyle='rgba(63,182,255,.16)';ctx.strokeStyle='rgba(28,134,217,.55)';ctx.lineWidth=1.5;const [x0,y0]=P(cam.x,cam.z),d=r/Math.max(sx,sz)*1.8;ctx.beginPath();ctx.moveTo(x0,y0);for(let k=0;k<=12;k++){const a=a0+(a1-a0)*k/12;ctx.lineTo(...P(cam.x+Math.sin(a)*d,cam.z+Math.cos(a)*d));}ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#1c86d9';ctx.beginPath();ctx.arc(x0,y0,4,0,Math.PI*2);ctx.fill();ctx.restore();}
 for(const p of state.players||[]){if(p.id===state.activePlayerId)continue;ctx.beginPath();ctx.arc(px(p.ball.x),pz(p.ball.z),5,0,Math.PI*2);ctx.fillStyle=PLAYER_COLORS[p.style];ctx.fill();ctx.fillText(p.name,px(p.ball.x)+8,pz(p.ball.z));}
 ctx.setLineDash([4,7]);ctx.strokeStyle='#647a5466';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px(state.ball.x),pz(state.ball.z));ctx.lineTo(px(h.pin.x),pz(h.pin.z));ctx.stroke();ctx.setLineDash([]);
 const info=state.phase==='playing'&&scene?.guide?.visible?scene.guide.info:null,b=state.ball;
 if(info){const L=info.putt?info.anchor:info.landing,E=info.end;ctx.lineCap='round';ctx.strokeStyle='#22264a';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(px(b.x),pz(b.z));ctx.lineTo(px(L.x),pz(L.z));ctx.stroke();ctx.strokeStyle='#ffd23f';ctx.lineWidth=3;ctx.stroke();
  if(!info.putt&&Math.hypot(E.x-L.x,E.z-L.z)>1.2){ctx.setLineDash([3,4]);ctx.strokeStyle='#ffffff';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(px(L.x),pz(L.z));ctx.lineTo(px(E.x),pz(E.z));ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#fff';ctx.strokeStyle='#22264a';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(px(E.x),pz(E.z),3.5,0,Math.PI*2);ctx.fill();ctx.stroke();}
  if(!info.putt&&info.drift>.8){const W=info.windLanding;ctx.strokeStyle='#1c86d9';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(px(L.x),pz(L.z));ctx.lineTo(px(W.x),pz(W.z));ctx.stroke();ctx.strokeStyle='#7fd3ff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(px(W.x),pz(W.z),6,0,Math.PI*2);ctx.stroke();}
  ctx.fillStyle='rgba(255,210,63,.45)';ctx.strokeStyle='#22264a';ctx.lineWidth=2;ctx.beginPath();ctx.arc(px(L.x),pz(L.z),8,0,Math.PI*2);ctx.fill();ctx.stroke();}
 // 旗帜朝下风方向。
 const wind=h.wind||{x:0,z:0},wl=Math.hypot(wind.x*sx,wind.z*sz),wx=wl>1e-6?wind.x*sx/wl:1,wy=wl>1e-6?-wind.z*sz/wl:0,fx=px(h.pin.x),fy=pz(h.pin.z),top=fy-22,droop=Math.max(.15,1-h.wind.speed/6);
 ctx.strokeStyle='#a98d62';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(fx,fy);ctx.lineTo(fx,top);ctx.stroke();ctx.fillStyle='#cf9460';ctx.strokeStyle='#22264a';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(fx,top);ctx.lineTo(fx+wx*15,top+wy*15+droop*9);ctx.lineTo(fx,top+11);ctx.closePath();ctx.fill();ctx.stroke();
 ctx.beginPath();ctx.arc(px(b.x),pz(b.z),7,0,Math.PI*2);ctx.fillStyle='#315440';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.stroke();mapView.end(ctx);
}
// 小地图随镜头、方向、力度实时刷新（限频）。
let mapDrawnAt=0,mapQueued=false,mapCamKey='';
function scheduleMap(){if(mapQueued)return;mapQueued=true;requestAnimationFrame(()=>{mapQueued=false;drawMap();});}
function mapTick(){if(view!=='game'||!state||performance.now()-mapDrawnAt<120)return;const c=scene?.mapCamera?.();if(!c)return;const key=[Math.round(c.x),Math.round(c.z),Math.round(c.heading*20),c.view].join(',');if(key!==mapCamKey){mapCamKey=key;drawMap();}}
let aimTimeout,aimInFlight=null,pendingHit=false;function sendAim(v){aimInFlight=v;conn.send({type:'aim',aim:v});}
$('aim').oninput=()=>{syncRange($('aim'));const v=Number($('aim').value);$('aim-value').textContent=v===0?'正前方':`${Math.abs(v)}° ${v<0?'左':'右'}`;scene?.setBall(state.ball,v);updateGuide();scheduleMap();clearTimeout(aimTimeout);aimTimeout=setTimeout(()=>sendAim(v),65);};$('reset-aim').onclick=()=>{$('aim').value=0;$('aim').oninput();};
function setRoundPower(power){const p=clamp(power,0,1);$('round-power-value').textContent=`手机 ${Math.round(p*100)}%`;$('round-power-fill').style.width=p*100+'%';clearTimeout(setRoundPower.timer);setRoundPower.timer=setTimeout(()=>{$('round-power-fill').style.width='0';},1600);}
$('power').oninput=()=>{$('power-value').textContent=$('power').value+'%';syncRange($('power'));updateGuide();scheduleMap();};
function activePhone(){const player=state?.players?.find(p=>p.id===state.activePlayerId);return controller.phones?.find(p=>p.id===player?.deviceId);}
function roundBusy(){return !state||state.phase!=='playing'||!wsReady||roundPending||pendingHit||['transferring','swing','flight','settling','splash','cup','holed','landing','moving','boarding','driving','alighting','rehearsal'].includes(scene?.phase);}
function renderRoundControls(){
 if(!state)return;if(state.phase==='transferring'&&state.transfer){const t=state.transfer,progress=clamp((Date.now()-t.startedAt)/t.duration,0,1);$('journey-progress').value=progress;$('journey-status').textContent=`${scene?.journeyLabel||'球车接驳中'} · 约 ${Math.round(t.meters)} 米 · ${state.players.length} 位球手随行`;$('journey-skip').disabled=!wsReady;}const busy=roundBusy(),armed=!!state.armed,phase=scene?.phase||'address';
 const putting=state.phase==='animating'&&lastShot?lastShot.clubId==='putter':state.terrain?.surface==='green'||state.selectedClub?.id==='putter';$('putting-card').hidden=!putting;$('slope-legend').hidden=!scene?.slopeVisible;
 if(putting){const ball=scene?.flight?scene.ball.position:state.phase==='animating'&&lastShot?lastShot.from:state.ball,r=puttingRead(state.hole,ball,state.aim||0);$('putting-grade').textContent=`脚下坡度 ${r.percent.toFixed(1)}%`;$('putting-pace').textContent=`${r.pace} · ${Math.abs(r.along).toFixed(1)}%`;$('putting-break').textContent=r.break;$('putting-rise').textContent=`洞杯比球位${r.rise>=0?'高':'低'} ${Math.abs(r.rise*100).toFixed(0)} 厘米`;$('putting-speed').textContent=scene?.flight?`当前球速 ${Number(scene.rollSpeed||0).toFixed(2)} 米/秒`:'轻推控制入洞速度，侧坡越明显越要留出借位';}
 const showLanding=['settling','landing','moving','boarding','driving','alighting'].includes(phase),terrain=state.phase==='animating'&&!showLanding&&lastShot?.terrain?lastShot.terrain:state.terrain;if(terrain){$('terrain-condition').textContent=`${showLanding?'落点 · ':''}${terrain.name} · ${terrain.condition}`;$('terrain-speed').textContent=`${showLanding?(state.selectedClub?.name||'')+' · ':''}出球速度 ${terrain.speedPercent}%`;$('terrain-roll').textContent=terrain.roll;$('terrain-tip').textContent=terrain.tip;}
 for(const id of ['hit-button','round-arm','aim','power','reset-aim','round-club'])$(id).disabled=busy;
 // 0.22：电脑端取消试挥，“击球”按当前力度与方向直接计杆；手机挥杆仍是“未准备 = 试挥”，可在电脑或手机上为手机准备击球。
 const phoneReady=state.multiplayer?!!activePhone()?.calibrated:!!controller.calibrated;
 $('hit-button').disabled=busy||!!state.multiplayer;$('round-arm').disabled=busy||!phoneReady;$('round-arm').hidden=!phoneReady&&!state.multiplayer;
 $('hit-button').textContent=state.multiplayer?'使用当前手机挥杆':roundPending||pendingHit?'击球中…':busy?'请稍候…':'击球 →';$('round-arm').textContent=armed?'取消手机准备':'手机准备击球';$('round-mode').textContent=state.phase==='animating'?'击球中 · 观看落点':armed?'手机已准备 · 下一挥计杆':phoneReady?'手机挥杆为试挥 · 电脑击球直接计杆':'按力度条直接击球';
 $('game').classList.toggle('round-armed',armed);$('control-hint').textContent=state.multiplayer?'轮到 '+(state.players.find(p=>p.id===state.activePlayerId)?.name||'')+' · 请使用绑定手机试挥与击球':armed?'手机已准备：挥动手机击球，或在电脑上按“击球”':'空格蓄力、松开击球 · 拖动画面转视角，滚轮缩放';
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
  else $('shot-heading').textContent=armed?'手机已准备，下一挥就出球。':'看准落点，挥出这一杆。';
 }
 $('round-recenter').disabled=['swing','flight','settling','splash','cup','holed','moving','boarding','driving','alighting'].includes(phase);
 const courseView=scene?.view==='overview'&&scene.viewState?.focus!=='cup'&&!scene.slopeVisible;$('camera-label').textContent=courseView?'人物视角':'球道俯视';$('camera-button').classList.toggle('active',courseView);$('cup-button').classList.toggle('active',scene?.view==='overview'&&scene.viewState?.focus==='cup');$('intro-button').disabled=busy||!!scene?.intro;
}
// 电脑击球：方向随击球一起发送；若刚调整的方向还在同步途中，等服务器确认后自动出球。
function hit(){scene?.skipIntro();if(!state||state.multiplayer)return;if(pendingHit)return;clearTimeout(aimTimeout);const aim=Number($('aim').value);
 if(aimInFlight!==null&&state.aim!==aimInFlight){pendingHit=true;clearTimeout(roundTimer);roundTimer=setTimeout(()=>{pendingHit=false;renderRoundControls();},2500);renderRoundControls();return;}
 if(roundBusy())return;aimInFlight=null;seq++;sessionStorage.setItem('swinglink-seq',String(seq));if(conn.send({type:'swing',power:Number($('power').value)/100,dir:0,seq,stateVersion:state.stateVersion,aim})){roundPending=true;clearTimeout(roundTimer);roundTimer=setTimeout(()=>{roundPending=false;renderRoundControls();},4000);renderRoundControls();}}
$('round-arm').onclick=()=>{scene?.skipIntro();if(!roundBusy())conn.send({type:'round_arm',armed:!state.armed});};
$('round-avatar').onchange=()=>{const style=$('round-avatar').value;localStorage.setItem('swinglink-avatar',style);scene?.setStyle(style);training.avatarStyle=style;document.getElementById('avatar-style').value=style;training.scene?.setStyle(style);};
$('round-recenter').onclick=()=>scene?.resetAddress();
setInterval(()=>{if(view!=='game')return;const live=wsReady&&(state?.multiplayer?activePhone()?.calibrated:controller.calibrated)&&performance.now()-lastMotionAt<1800;if(!live){for(const k of ['alpha','beta','gamma'])$('round-'+k).textContent='—';}$('round-motion-status').textContent=live?'体感视角实时连接 · 度/秒':controller.connected?'等待手机体感数据':'连接手机，轻转观察人物视角';renderRoundControls();},250);
$('hit-button').onclick=hit;
document.addEventListener('keydown',e=>{if(view==='game'&&scene?.intro&&!e.repeat&&!document.querySelector('dialog[open]')){scene.skipIntro();if(e.code==='Space')e.preventDefault();return;}if(e.code==='KeyR'&&!e.repeat&&!e.ctrlKey&&!e.metaKey&&(view==='game'||view==='lab')&&!e.target.matches('input,select,textarea')&&!document.querySelector('dialog[open]')){const sc=view==='game'?scene:training.scene;toast(sc?.replaySwing?.(.35)?'慢放上一杆：按手机记录的真实挥杆轨迹':'还没有可以回放的手机挥杆（等球停稳后再按 R）。');return;}if(view==='game'&&e.code==='KeyG'&&!e.target.matches('input,select,textarea')){$('game').classList.toggle('show-sensors');document.querySelector('.round-gyro').hidden=!$('game').classList.contains('show-sensors');return;}if(e.code!=='Space'||view!=='game'||document.querySelector('dialog[open]')||(e.target.matches('input,select,textarea')||(e.target.matches('button')&&!['round-arm','hit-button'].includes(e.target.id)))||e.repeat||roundBusy()||state.multiplayer)return;e.preventDefault();charging=true;chargeStart=performance.now();chargeTimer=setInterval(()=>{const t=(performance.now()-chargeStart)/1500,p=.02+.98*(1-Math.abs((t%2)-1));$('power').value=Math.round(p*100);$('power').oninput();},25);});
document.addEventListener('keyup',e=>{if(e.code==='Space'&&charging){e.preventDefault();charging=false;clearInterval(chargeTimer);hit();}});window.addEventListener('blur',()=>{charging=false;clearInterval(chargeTimer);});
$('cup-button').onclick=()=>scene?.focusCup();
$('overview-button').onclick=()=>{scene?.overview();renderRoundControls();};$('camera-button').onclick=()=>{scene?.overview();renderRoundControls();};$('intro-button').onclick=()=>{if(scene?.startIntro())renderRoundControls();};$('intro-skip').onclick=()=>scene?.skipIntro();$('slope-button').onclick=()=>{$('slope-button').classList.toggle('active',scene?.toggleSlope());if(state){const slope=slopeAt(state.hole,state.hole.pin.x,state.hole.pin.z);toast(`果岭坡度：${(Math.hypot(slope.x,slope.z)*100).toFixed(1)}%。箭头朝向下坡；越暖、流动越快，坡度越大。`);}};
function openScore(completed=false){if(!state)return;const end=state.phase==='finished',last=state.scores.at(-1),names={[-3]:'信天翁！低于标准杆三杆',[-2]:'老鹰球！低于标准杆两杆',[-1]:'小鸟球！低于标准杆一杆',0:'稳稳打出标准杆。',1:'高出一杆，下一洞继续。'};$('score-eyebrow').textContent=end?'一场好球，一段好时光':completed?`第 ${state.holeIndex+1} 洞完成`:'认真打好每一杆';$('score-title').textContent=end?'这一局，打得尽兴。':completed?last?.capped?'下一洞，重新出发。':names[last.strokes-last.par]||'又完成了一洞。':'这一局的成绩。';$('score-description').textContent=`${COURSES.find(c=>c.id===state.courseId).name} · ${state.mode} 洞${last?.capped?' · 已达到 12 杆上限':''}`;
 $('score-rows').innerHTML=Array.from({length:state.mode},(_,i)=>{const s=state.scores.find(x=>x.hole===i+1),data=COURSES.find(c=>c.id===state.courseId).holes[i];const diff=s?s.strokes-s.par:null,cls=!s?'empty':diff<=-2?'eagle':diff<0?'under':diff===0?'par':diff===1?'over':'double';return `<div class="score-row ${!s&&i===state.holeIndex&&!end?'current':''}"><span>${String(i+1).padStart(2,'0')} <small>${data[0]}</small></span><small>标准杆 ${data[1]}</small><span class="score-cell"><b class="score-badge ${cls}">${s?s.strokes+(s.capped?'*':''):'—'}</b></span><span>${s?relativeScore(diff):''}</span></div>`;}).join('');$('score-summary').textContent=relativeScore(scoreTotal());$('score-actions').innerHTML=completed?end?(state.returnedToClubhouse?'<button class="secondary" id="change-course">更换球场</button><button class="primary" id="replay">再来一局 →</button>':'<button class="primary" id="return-clubhouse">乘球车返回会所 →</button><button class="secondary" id="change-course">更换球场</button>'):'<button class="primary" id="next-hole">乘球车前往下一洞 →</button>':'<button class="primary" id="back-game">回到球场 →</button>';
 $('return-clubhouse')?.addEventListener('click',()=>{$('score-dialog').close();conn.send({type:'return_clubhouse'});});
 $('next-hole')?.addEventListener('click',()=>{$('score-dialog').close();lastShot=null;conn.send({type:'next_hole'});});$('replay')?.addEventListener('click',()=>{$('score-dialog').close();conn.send({type:'start_round',courseId:state.courseId,mode:state.mode,multiplayer:state.multiplayer,playerIds:state.players.map(p=>p.deviceId)});});$('change-course')?.addEventListener('click',()=>{$('score-dialog').close();conn.send({type:'lobby'});});$('back-game')?.addEventListener('click',()=>$('score-dialog').close());multiplayer.score(state);if(!$('score-dialog').open)$('score-dialog').showModal();}
function syncRange(input){const min=Number(input.min||0),max=Number(input.max||100),v=(Number(input.value)-min)/((max-min)||1)*100;input.style.setProperty('--v',v+'%');}
document.querySelectorAll('input[type=range]').forEach(syncRange);document.addEventListener('input',e=>{if(e.target.matches?.('input[type=range]'))syncRange(e.target);});
function updateGuide(){if(!scene||view!=='game'||!state)return;const power=Number($('power').value)/100;scene.setGuide(state.phase==='playing'?state.forecast:null,power);const info=scene.guide?.visible?scene.guide.info:null,putt=state.forecast?.clubId==='putter';$('guide-text').textContent=info?(putt?`平地滚动约 ${info.total.toFixed(1)} 米`:`无风落点 ${Math.round(info.carry)} 米 · 停球 ${Math.round(info.total)} 米`):'';$('guide-carry').textContent=info?(putt?info.total.toFixed(1)+' 米':Math.round(info.carry)+' 米'):'';$('guide-total').textContent=info?(putt?'平地滚动':`停球约 ${Math.round(info.total)} 米`):'';}
// 预测落点标签：落点在画面内时贴在落点上方；在画面外（或镜头背后）时钉到屏幕边缘，箭头指向落点方向。
function placeGuideLabel(){const label=$('guide-label');if(view!=='game'||!scene?.guide?.visible||!scene.guide.info?.anchor){if(!label.hidden)label.hidden=true;return;}const info=scene.guide.info,box=$('game-canvas').getBoundingClientRect(),w=box.width,h=box.height,q=scene.projectNDC(info.anchor,1.1);
 // “安全区”：避开顶部提示、底部击球面板 / 镜头工具条和右侧小地图；落点在安全区外（含被面板遮住、镜头背后）就钉在安全区边缘。
 const rel=el=>{const r=el?.getBoundingClientRect();return r&&r.width?{left:r.left-box.left,top:r.top-box.top,right:r.right-box.left,bottom:r.bottom-box.top}:null;},dock=rel(document.querySelector('.shot-dock')),tools=scene.viewToolbar.hidden?null:rel(scene.viewToolbar),side=rel(document.querySelector('.hud-right')),stats=rel(document.querySelector('.hud-stats'));
 const L=70,T=Math.max(120,(stats?.bottom||0)+50),R=Math.min(w-70,(side&&side.left>w*.5?side.left:w)-70),B=Math.min(h-60,(tools?tools.top:dock?dock.top:h)-40);
 let px=(q.x+1)/2*w,py=(1-q.y)/2*h;const inside=!q.behind&&px>=L&&px<=R&&py>=T+30&&py<=B;label.hidden=false;label.classList.toggle('edge',!inside);
 if(inside){label.style.left=px+'px';label.style.top=py+'px';label.style.removeProperty('--arrow');}
 else{const cx=(L+R)/2,cy=(T+B)/2;let dx=px-cx,dy=py-cy;if(q.behind){dx=-dx;dy=-dy;}if(Math.hypot(dx,dy)<1){dx=0;dy=1;}const kx=dx?((dx>0?R:L)-cx)/dx:Infinity,ky=dy?((dy>0?B:T)-cy)/dy:Infinity,k=Math.max(0,Math.min(Math.abs(kx),Math.abs(ky)));label.style.left=cx+dx*k+'px';label.style.top=cy+dy*k+'px';label.style.setProperty('--arrow',Math.atan2(dy,dx)+'rad');}
 const drift=$('guide-drift');if(drift){const show=!info.putt&&info.drift>.8;drift.hidden=!show;if(show){const ball=state.ball,heading=Math.atan2(info.landing.x-ball.x,info.landing.z-ball.z),dx=info.windLanding.x-info.landing.x,dz=info.windLanding.z-info.landing.z,side=dx*Math.cos(heading)-dz*Math.sin(heading),along=dx*Math.sin(heading)+dz*Math.cos(heading),text=`风偏 ${Math.abs(side)>=Math.abs(along)?(side>0?'→ ':'← '):(along>0?'↑ ':'↓ ')}${info.drift.toFixed(info.drift<10?1:0)} 米`;if(drift.textContent!==text)drift.textContent=text;}}
}
function introSeenKey(){return `swinglink-intro-${state.courseId}-${state.holeIndex}-${state.seed}`;}
function maybeIntro(){if(!state||state.phase!=='playing'||view!=='game'||state.strokes!==0||state.ball.x!==0||state.ball.z!==0)return;let seen=false;try{seen=sessionStorage.getItem(introSeenKey())==='1';sessionStorage.setItem(introSeenKey(),'1');}catch{}if(!seen)scene?.startIntro();}
function showIntro(active){$('game').classList.toggle('intro-playing',active);$('intro-card').hidden=!active;if(active&&state){const h=state.hole,c=COURSES.find(c=>c.id===state.courseId);$('intro-course').textContent=c.name;$('intro-title').textContent=`第 ${state.holeIndex+1} 洞 · ${h.name}`;$('intro-meta').textContent=`标准杆 ${h.par} · ${h.length} 米 · 风 ${h.wind.speed.toFixed(1)} 米/秒`;$('intro-advice').textContent=`${challengeLabel(h.challenge)} · ${h.advice}`;}updateGuide();renderRoundControls();}
$('game-canvas').addEventListener('pointerdown',()=>scene?.skipIntro());
$('score-button').onclick=()=>openScore(['hole_complete','finished'].includes(state?.phase));
window.swinglink={get music(){return music.status();},get sound(){return sound;},get training(){return training;},get scene(){return scene;},get state(){return state;},get maze(){return maze;},get skyLevels(){return SKY_LEVELS;},get director(){return music;}};
conn.addEventListener('message',({detail:m})=>{
 if(m.type==='ready'){wsReady=true;$('start-button').disabled=false;conn.send({type:'round_view',active:view==='game'});conn.send({type:'screen_view',game:GAME_OF[view],view});}
 if(m.type==='room_state'){if(state&&m.state.stateVersion<state.stateVersion)return;const previous=state;state=m.state;if(previous?.clubId!==state.clubId&&state.phase==='playing'){$('round-preview').textContent='球杆已更新，预判已刷新';$('round-power-reference').style.display='none';if(scene?.forecast)scene.forecast.visible=false;}if(state.phase==='lobby'){if(view==='game')showView('lobby');}else if(view==='lobby'||(view==='game'&&previous?.phase==='lobby'&&state.phase==='playing'))showView('game');if(previous&&previous.phase!=='finished'&&state.phase==='finished'&&view==='game')music.sting('sting-win');renderState();renderNav();if(view==='hub')renderHub();}
 if(m.type==='room_state'&&pendingHit&&state.phase==='playing'&&(aimInFlight===null||state.aim===aimInFlight)){pendingHit=false;clearTimeout(roundTimer);aimInFlight=null;hit();}
 if(m.type==='round_camera'&&view==='game'&&scene){scene.skipIntro();scene.cameraAction(m.action);renderRoundControls();}
 if(m.type==='controller_status'){controller=m;updateController();}
 if(m.type==='maze_controller'&&view==='maze')updateController();
 if(m.type==='sensor_sample'&&m.scope==='round'&&view==='game'){const t=m.sample;lastMotionAt=performance.now();scene?.sample(t);for(const k of ['alpha','beta','gamma'])$('round-'+k).textContent=Math.round(t[k]);if(t.stage==='ready'&&t.phase==='back'&&Number.isFinite(t.u))setRoundPower(clamp(t.u,0,1));}
 if(m.type==='round_rehearsal'||m.type==='shot_result'){clearTimeout(roundTimer);roundPending=false;const shot=m.shot;setRoundPower(shot.power);$('round-power-reference').style.display='block';$('round-power-reference').style.left=shot.power*100+'%';$('round-power-reference').title=`上次 ${Math.round(shot.power*100)}%`;$('round-preview').textContent=(m.type==='round_rehearsal'?'手机试挥参考 ':'本杆距离 ')+shot.travel.toFixed(1)+' 米';if(view==='game'){if(m.type==='round_rehearsal')scene?.rehearse(shot,m.source);else{lastShot=shot;scene?.playShot(shot,m.source);watchShot('round',shot,m.source);}}renderRoundControls();}
 if(m.type==='error'){roundPending=false;pendingHit=false;aimInFlight=null;clearTimeout(roundTimer);toast(m.message);renderState();}
});conn.addEventListener('offline',()=>{wsReady=false;roundPending=false;lastMotionAt=0;$('start-button').disabled=true;renderState();toast('正在重新连接本地游戏…');});conn.connect();

applyRoute();
