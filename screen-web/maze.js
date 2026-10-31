// 云端滚球（SKYROLL）：地图页（三章九张地图、星级与最佳用时）+ 关卡页（3D 赛道、HUD、暂停 / 过关浮层）。
// 控制方式：电脑键盘、手机倾斜或手机虚拟摇杆；物理在电脑上以 120 Hz 固定步长运行。
import {RollingGame,PHYSICS,vector} from '../shared/maze/physics.js';
import {LEVELS,CHAPTERS,obstaclePose,stars as starCount} from '../shared/maze/levels.js';
import {RollingScene} from './maze-renderer.js';
import {VersusRoom} from './versus.js';
const timeText=s=>`${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}.${Math.floor(s*10%10)}`;
const shortTime=s=>`${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
export const RECORDS_KEY='swinglink-skyroll-records';
const REASONS={manual:'停稳看看前路，再继续出发。',hidden:'游戏离开前台，已暂停运动与计时。',blur:'窗口失去焦点，已自动暂停。',controller_offline:'手机已断开，小球停在原处。',controller_change:'控制方式已更换，准备好后再继续。',stream_gap:'手柄数据中断，请保持手机页面在前台。',phone_hidden:'手机离开前台，已自动暂停。',recenter:'正在设置自然握姿，准备好后继续。',tab:'回到这一关后，可以继续当前进度。'};
const WIN_LINES=['第一段云路，拿下！','节奏，已经在你手中。','选好路，也稳稳走完。','借力成功！','风车也拦不住你。','靠岸、上船、到达！','冰面上也稳稳的。','迷宫走通了！','天空之冠，属于你！'];
// 每张地图出现的机关，用于地图卡片上的小图标。
export function features(level){const out=[];const roads=level.roads;if(level.boosts.length)out.push(['boost','加速带']);if(level.bumpers.length)out.push(['bumper','弹射柱']);if(level.sweepers.length)out.push(['sweeper','风车']);if(level.movers.length)out.push(['mover','浮台']);if(roads.some(r=>r.surface==='ice'))out.push(['ice','冰面']);if(roads.some(r=>r.surface==='fluff')||level.platforms.some(p=>p.surface==='fluff'))out.push(['fluff','云絮']);if(level.obstacles.length)out.push(['block','挡块']);if(roads.some(r=>!r.rails&&r.width<4))out.push(['narrow','窄桥']);if(Object.keys(level.routes).length>1)out.push(['fork','分岔']);if(roads.some(r=>r.a.y!==r.b.y))out.push(['slope','坡道']);return out;}
// 本机纪录：最佳用时、最少坠落、最高星级、挑战次数。
export function loadRecords(storage){try{const r=JSON.parse(storage.getItem(RECORDS_KEY));return r&&typeof r==='object'?r:{};}catch{return {};}}
export function recordResult(records,level,result){const old=records[level.id]||{},stars=starCount(level,result),best=old.best===undefined||result.elapsed<old.best,next={best:best?result.elapsed:old.best,bestFalls:best?result.falls:old.bestFalls,stars:Math.max(old.stars||0,stars),plays:(old.plays||0)+1,completed:(old.completed||0)+1};records[level.id]=next;return {record:next,stars,newBest:best&&old.best!==undefined,first:old.best===undefined};}
export const totalStars=records=>LEVELS.reduce((n,l)=>n+(records[l.id]?.stars||0),0);
const starHTML=(n,size='')=>`<span class="stars ${size}" aria-label="${n} 星">${[0,1,2].map(i=>`<i class="${i<n?'on':''}">★</i>`).join('')}</span>`;
const ICON={boost:'»',bumper:'●',sweeper:'✣',mover:'▭',ice:'❄',fluff:'☁',block:'■',narrow:'═',fork:'⑂',slope:'⟋'};

export class MazeRoom {
 constructor(root,conn,{pair=()=>{},sfx=null,onView=()=>{},onWin=()=>{},onTempo=()=>{},toast=()=>{},storage=globalThis.localStorage}={}){
  this.root=root;this.conn=conn;this.pair=pair;this.sfx=sfx;this.onView=onView;this.onWin=onWin;this.toast=toast;this.storage=storage;this.records=loadRecords(storage);
  this.game=new RollingGame();this.active=false;this.view='map';this.host=true;this.online=false;this.phone={x:0,y:0,at:0};this.source='keyboard';this.sourceChosen=false;this.controller={};this.keys=new Set();this.hint='';this.hintUntil=0;this.hints=new Set();this.lastState=0;this.lastUI=0;this.lastWin=null;
  root.innerHTML=`<section class="sky-map" id="sky-map" aria-label="云端滚球地图">
   <div class="sky-hero"><div class="sky-hero-copy"><span class="toon-badge sky">SKYROLL · 体感冒险</span><h1 class="toon-title">云端滚球</h1><p>端平手机轻轻倾斜，让小球滚过三章九张云上地图。加速带、弹射柱、风车、浮台和冰面，一张比一张有趣。</p>
    <div class="sky-progress"><div class="sky-progress-num"><b id="sky-stars">0</b><small>/ 27 星</small></div><div class="sky-progress-bar"><i id="sky-stars-bar"></i></div><span id="sky-done">0 / 9 张完成</span></div>
    <div class="sky-hero-actions"><button class="btn btn-sky btn-big" id="sky-continue">开始冒险 →</button><button class="btn btn-sun btn-big" id="sky-versus-open">⚔ 多人对战</button><button class="btn btn-ghost" id="sky-pad-open">手柄设置</button></div></div>
    <div class="sky-hero-art" aria-hidden="true"><i class="cloud c1"></i><i class="cloud c2"></i><i class="cloud c3"></i><i class="isle"></i><i class="ball"></i><i class="sparkle s1">✦</i><i class="sparkle s2">✦</i></div></div>
   <button class="sky-versus-banner" id="sky-versus-banner" aria-label="打开多人对战"><span class="vs-banner-balls" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="vs-banner-copy"><span class="toon-chip">新 · 最多 4 人</span><b>多人对战 · 无尽云路</b><small>每人一台手机。身后的赛道一格格崩塌，球会互相碰撞——掉下去就出局，最后留下的人获胜。</small></span><span class="vs-banner-go">进入大厅 →</span></button>
   <div class="sky-chapters">${CHAPTERS.map((c,ci)=>`<section class="sky-chapter" style="--ch:${c.color}"><header><span class="toon-chip">第 ${ci+1} 章</span><h2>${esc(c.name)}</h2><p>${esc(c.subtitle)}</p><span class="sky-chapter-stars" data-chapter-stars="${ci}"></span></header><div class="sky-levels">${c.levels.map(id=>{const i=LEVELS.findIndex(l=>l.id===id),l=LEVELS[i];return `<button class="level-card" data-maze-level="${i}" style="--lv:${l.color}" aria-label="第 ${i+1} 张地图 ${esc(l.name)}"><span class="level-no">${String(i+1).padStart(2,'0')}</span><span class="level-name">${esc(l.name.split(' · ')[0])}<small>${esc(l.name.split(' · ')[1]||'')}</small></span><span class="level-feat">${features(l).slice(0,4).map(([k,n])=>`<i class="feat feat-${k}" title="${n}">${ICON[k]}<em>${n}</em></i>`).join('')}</span><span class="level-foot"><span data-level-stars="${i}"></span><span class="level-best" data-level-best="${i}"></span></span></button>`;}).join('')}</div></section>`).join('')}</div>
  </section>
  <section class="sky-play hidden" id="sky-play" aria-label="云端滚球关卡">
   <div class="roll-stage"><canvas id="maze-canvas" tabindex="0" aria-label="3D悬空滚球赛道，方向键或WASD控制加速度"></canvas>
    <div class="roll-top-hud"><button class="btn btn-ghost btn-small" id="sky-back">← 地图</button><div class="roll-level-badge"><small id="maze-current">第 1 章 · 01</small><strong id="maze-level-name">初航</strong><em id="maze-board-status">准备出发</em></div><div class="roll-stat-row"><div><small>用时</small><strong id="maze-time">00:00.0</strong><em id="maze-par">标准 0:50</em></div><div><small>坠落</small><strong id="maze-falls">0</strong></div><div><small>复活点</small><strong id="maze-checkpoint">起点</strong></div></div></div>
    <div id="maze-overlay" class="maze-overlay"></div><div class="roll-toast" id="maze-hint" role="status"></div>
    <div class="roll-bottom-hud"><div class="roll-input-status"><span id="maze-source-label">键盘控制</span><small id="maze-control-tip">WASD / 方向键 · 反向刹车</small><button id="maze-settings" class="btn btn-ghost btn-small" aria-expanded="false">手柄设置</button></div><div class="roll-speed"><small>速度 <b id="maze-speed">0.0</b><span> 米/秒</span></small><div><i id="maze-speed-fill"></i></div><em id="maze-surface"></em></div><div class="maze-actions"><button id="maze-pause" class="btn btn-sky">暂停</button><button id="maze-retry" class="btn btn-ghost">重新挑战</button></div></div>
   </div><p class="roll-caption"><span id="maze-strategy"></span><small id="maze-timer-note">首次有效操作后计时 · P / Esc 暂停</small></p>
  </section>
  <section class="sky-versus hidden" id="sky-versus"></section>
  <section class="maze-control-card" id="maze-control-panel" aria-label="滚球手柄设置"><div class="roll-settings-head"><b>选择控制方式</b><button id="maze-settings-close" aria-label="关闭手柄设置">×</button></div><div class="maze-input-switch"><button id="maze-keyboard" class="selected">⌨ 键盘</button><button id="maze-use-phone">◉ 手机手柄</button></div><p>手机：横着端平，远端压低前进，近端压低刹车；左右轻倾转向。<br>电脑：WASD / 方向键，反方向就是刹车。</p><div class="maze-tilt-view"><span>前进</span><i id="maze-tilt-dot"></i><small>刹车 / 后退</small></div><label>选择手机<select id="maze-phone"><option value="">等待手机连接</option></select></label><p id="maze-phone-status">扫码连接手机，或直接用键盘开始。</p><button id="maze-connect" class="btn btn-sky">连接手机 ↗</button><button id="maze-zero" class="btn btn-ghost">↺ 重新校准握姿</button></section>`;
  this.$=id=>root.querySelector('#'+id);
  root.querySelectorAll('[data-maze-level]').forEach(button=>button.onclick=()=>this.start(Number(button.dataset.mazeLevel)));
  this.versus=new VersusRoom(this.$('sky-versus'),conn,{sfx,toast,pair,storage,onTempo,onExit:()=>this.openMap(),onWin:r=>onWin({versus:r}),onPhase:(kind,chapter)=>{if(this.view==='versus')this.onView(kind==='lobby'?'versus-lobby':'versus',chapter??0);}});
  this.$('sky-versus-open').onclick=()=>this.openVersus();this.$('sky-versus-banner').onclick=()=>this.openVersus();
  this.$('sky-continue').onclick=()=>this.start(this.nextLevel());this.$('sky-pad-open').onclick=()=>this.settings(true);this.$('sky-back').onclick=()=>this.openMap();
  this.$('maze-keyboard').onclick=()=>this.setSource('keyboard');this.$('maze-use-phone').onclick=()=>{if(!this.controller.ready){this.pause('manual');this.pair();this.showHint('手机启用倾斜控制，或选择虚拟摇杆。',7000);return;}this.setSource('phone');};
  this.$('maze-phone').onchange=()=>conn.send({type:'maze_select',phoneId:this.$('maze-phone').value});this.$('maze-connect').onclick=()=>{this.pause('manual');pair();};
  this.$('maze-zero').onclick=()=>{if(this.controller.connected)conn.send({type:'maze_rezero'});else this.showHint('先连接手机，再设置自然握姿。');};
  this.$('maze-settings').onclick=()=>this.settings(!this.$('maze-control-panel').classList.contains('open'));this.$('maze-settings-close').onclick=()=>this.settings(false);
  this.$('maze-pause').onclick=()=>this.togglePause();this.$('maze-retry').onclick=()=>this.start(this.game.index);
  this.$('maze-overlay').onclick=e=>{const b=e.target.closest('[data-action]');if(b)this.act(b.dataset.action);};
  document.addEventListener('keydown',e=>{if(!this.active||!this.host||this.view!=='play'||e.target.matches('input,select,textarea')||document.querySelector('dialog[open]'))return;const key=e.key.toLowerCase();if(['arrowleft','arrowright','arrowup','arrowdown','w','a','s','d'].includes(key)){e.preventDefault();if(this.source!=='keyboard')this.setSource('keyboard');this.keys.add(key);}if((key==='p'||key==='escape')&&!e.repeat){e.preventDefault();this.togglePause();}if(key==='enter'&&!e.repeat&&this.game.phase==='won'){e.preventDefault();this.act('next');}});
  document.addEventListener('keyup',e=>this.keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{this.keys.clear();if(this.active)this.pause('blur');});document.addEventListener('visibilitychange',()=>{if(document.hidden){this.keys.clear();if(this.active)this.pause('hidden');}});
  conn.addEventListener('message',({detail:m})=>this.message(m));conn.addEventListener('offline',()=>{this.online=false;this.phone={x:0,y:0,at:0};if(this.active&&this.source==='phone')this.pause('controller_offline');});
  this.game.phase='ready';this.last=performance.now();this.renderMap();this.renderUI();
  const frame=now=>{const delta=Math.max(0,(now-this.last)/1000);this.last=now;if(this.active&&this.view==='play'&&this.renderer){if(delta>.35&&this.game.phase==='playing')this.pause('blur');const input=this.input(now),events=this.game.advance(Math.min(delta,.1),input);for(const e of events)this.onEvent(e);this.contextHint(input,now);this.renderer.draw(this.game,input,now/1000);this.$('maze-tilt-dot').style.transform=`translate(${input.x*29}px,${input.y*29}px)`;const speed=Math.hypot(this.game.ball.vx,this.game.ball.vz);this.sfx?.roll(speed,this.game.surface,this.game.phase==='playing');this.$('maze-speed').textContent=speed.toFixed(1);this.$('maze-speed-fill').style.width=Math.min(100,speed/PHYSICS.boostSpeed*100)+'%';this.$('maze-speed-fill').classList.toggle('boost',speed>PHYSICS.maxSpeed+.1);if(now-this.lastUI>100||events.some(e=>e.kind==='win')){this.renderUI();this.lastUI=now;}if(now-this.lastState>250){this.sendState();this.lastState=now;}}else if(this.view!=='versus')this.sfx?.stop();requestAnimationFrame(frame);};requestAnimationFrame(frame);
 }
 onEvent(e){
  this.sfx?.play(e.kind,e.strength);this.renderer?.event(e,this.game);
  if(e.kind==='fall')this.showHint('从最近检查点再来。窄路前先减速，留一点修正余量。',4500);
  if(e.kind==='checkpoint')this.showHint('检查点已保存。掉下去会从这里重来。',3200);
  if(e.kind==='respawn')this.phone={x:0,y:0,at:0};
  if(e.kind==='win'){const level=this.game.level,result=this.game.results[this.game.index];this.lastWin=recordResult(this.records,level,result);try{this.storage.setItem(RECORDS_KEY,JSON.stringify(this.records));}catch{}this.renderMap();this.onWin(this.lastWin);}
 }
 nextLevel(){const i=LEVELS.findIndex(l=>!this.records[l.id]);return i<0?0:i;}
 settings(open){if(open)this.pause('manual');this.$('maze-control-panel').classList.toggle('open',open);this.$('maze-settings').setAttribute('aria-expanded',String(open));}
 // 地图 ↔ 关卡：离开关卡时暂停；回到 SkyRoll 时如果关卡还没完成，直接回到关卡（暂停状态）。
 setView(view){if(view==='play'&&this.game.phase==='ready')view='map';if(this.view===view&&this.viewSent===view)return;if(this.view==='play'&&view!=='play')this.pause('tab');const was=this.view;this.view=view;this.viewSent=view;this.$('sky-map').classList.toggle('hidden',view!=='map');this.$('sky-play').classList.toggle('hidden',view!=='play');this.$('sky-versus').classList.toggle('hidden',view!=='versus');this.root.dataset.view=view;if(view==='play'){this.ensureRenderer();this.$('maze-canvas').focus({preventScroll:true});}else if(view!=='versus')this.sfx?.stop();
  // 多人对战：告诉网关切换模式（所有手机显示“加入对战”）；离开时切回单人手柄。
  if(this.active&&(view==='versus')!==(was==='versus'))this.conn.send({type:'maze_mode',mode:view==='versus'?'versus':'solo'});this.versus.show(this.active&&view==='versus');
  this.renderMap();this.renderUI();if(view==='versus'){const [scene,chapter]=this.versus.music();this.onView(scene==='sky-map'?'versus-lobby':'versus',chapter);}else this.onView(view,this.game.level.chapter);}
 openMap(){this.setView('map');}
 openVersus(){this.settings(false);this.setView('versus');}
 ensureRenderer(){if(!this.renderer&&!this.graphicsError)try{this.renderer=new RollingScene(this.$('maze-canvas'));}catch{this.graphicsError=true;}}
 show(active,view){if(this.active&&!active)this.pause('tab');this.active=active;this.keys.clear();this.conn.send({type:'maze_view',active});if(active){const want=view||(this.view==='versus'?'versus':this.game.started&&!['won','ready'].includes(this.game.phase)?'play':this.view);this.viewSent=null;this.setView(want);this.versus.show(want==='versus');this.last=performance.now();this.renderUI();}else{this.versus.show(false);this.sfx?.stop();}}
 input(now){if(!this.active||!this.host||this.view!=='play')return {x:0,y:0};if(this.source==='phone')return now-this.phone.at<550?vector(this.phone.x,this.phone.y):{x:0,y:0};return vector(Number(this.keys.has('d')||this.keys.has('arrowright'))-Number(this.keys.has('a')||this.keys.has('arrowleft')),Number(this.keys.has('s')||this.keys.has('arrowdown'))-Number(this.keys.has('w')||this.keys.has('arrowup')));}
 setSource(source){if(this.source!==source&&this.game.started)this.pause('controller_change');this.source=source;this.sourceChosen=true;this.keys.clear();this.phone={x:0,y:0,at:0};this.conn.send({type:'maze_input_mode',phone:source==='phone'});this.renderUI();}
 start(index){if(!this.host)return;this.ensureRenderer();if(this.graphicsError){this.toast('云端滚球需要 WebGL：请启用浏览器硬件加速。');return;}this.game.load(index);this.keys.clear();this.hints.clear();this.lastWin=null;this.settings(false);this.phone={x:0,y:0,at:0};this.showHint(LEVELS[index].lesson,4500);if(this.source==='phone'&&!this.controller.ready)this.game.pause('stream_gap');this.viewSent=null;this.setView('play');this.sfx?.play('start');this.renderUI();this.sendState();}
 pause(reason){this.game.pause(reason);this.keys.clear();this.phone={x:0,y:0,at:0};this.renderUI();this.sendState();}
 resume(){if(this.source==='phone'&&!this.controller.ready){this.showHint('保持手机前台，完成归零或使用摇杆，再继续。',6000);return;}this.keys.clear();this.settings(false);this.phone={x:0,y:0,at:0};this.game.resume();this.renderUI();this.sendState();}
 togglePause(){if(this.game.phase==='paused')this.resume();else this.pause('manual');}
 act(action){if(action==='takeover'){this.conn.send({type:'maze_view',active:true,takeover:true});return;}if(action==='start'||action==='retry')this.start(this.game.index);if(action==='resume')this.resume();if(action==='map')this.openMap();if(action==='next'){if(this.game.index<LEVELS.length-1)this.start(this.game.index+1);else this.openMap();}}
 showHint(text,duration=4000){this.hint=text;this.hintUntil=performance.now()+duration;}
 contextHint(input,now){const g=this.game,b=g.ball,speed=Math.hypot(b.vx,b.vz),l=g.level;if(g.phase!=='playing')return;const once=(key,text)=>{if(this.hints.has(key)||now<this.hintUntil)return;this.hints.add(key);this.showHint(text,4500);};const near=(list,d)=>list.some(p=>Math.hypot(b.x-p.x,b.z-p.z)<d);
  if(g.started&&speed>3&&Math.hypot(input.x,input.y)<.03&&g.surface!=='ice')once('inertia','松开仍会滑行。按反方向，可以主动刹车。');
  if(l.obstacles.some(o=>{const p=obstaclePose(l,o,g.clock);return Math.hypot(b.x-p.x,b.z-p.z)<8;})&&speed>2)once('obstacle','前面是移动挡块。先慢下来，看准时机再通过。');
  if(near(l.sweepers,9))once('sweeper','风车横杆会把球推开。等它转过去再走，角落是安全区。');
  if(near(l.bumpers,4))once('bumper','弹射柱一碰就会把你弹开，贴边绕过最稳。');
  if(g.surface==='ice')once('ice','冰面很滑：加速和转向都只有平时的三分之一。');
  if(g.surface==='fluff')once('fluff','云絮路面会把球拖慢，正好用来刹车。');
  if(g.boostTime>0)once('boost','加速带！速度上限暂时提高。');
  if(l.movers.some(m=>Math.hypot(b.x-m.a.x,b.z-m.a.z)<m.hz+3.2||Math.hypot(b.x-m.b.x,b.z-m.b.z)<m.hz+3.2)&&!g.riding)once('mover','等浮台靠岸再上，站到中间不动，它会送你过去。');
  if(Math.hypot(b.x-l.goal.x,b.z-l.goal.z)<7&&speed>PHYSICS.goalSpeed)once('goal','终点到了。反向刹车，稳稳停进绿色区域。');}
 renderMap(){
  const r=this.records,total=totalStars(r),done=LEVELS.filter(l=>r[l.id]).length;this.$('sky-stars').textContent=total;this.$('sky-stars-bar').style.width=total/27*100+'%';this.$('sky-done').textContent=`${done} / ${LEVELS.length} 张完成`;
  const next=this.nextLevel();this.$('sky-continue').textContent=done?(done===LEVELS.length?'再玩一次 →':`继续：${LEVELS[next].name.split(' · ')[0]} →`):'开始冒险 →';
  this.root.querySelectorAll('[data-level-stars]').forEach(el=>{const l=LEVELS[el.dataset.levelStars];el.innerHTML=starHTML(r[l.id]?.stars||0);});
  this.root.querySelectorAll('[data-level-best]').forEach(el=>{const l=LEVELS[el.dataset.levelBest],rec=r[l.id];el.textContent=rec?`最佳 ${shortTime(rec.best)}`:`标准 ${shortTime(l.par)}`;el.classList.toggle('done',!!rec);});
  this.root.querySelectorAll('[data-chapter-stars]').forEach(el=>{const c=CHAPTERS[el.dataset.chapterStars],n=c.levels.reduce((s,id)=>s+(r[id]?.stars||0),0);el.textContent=`★ ${n} / 9`;});
  this.root.querySelectorAll('[data-maze-level]').forEach(b=>{const i=Number(b.dataset.mazeLevel);b.classList.toggle('next',i===next&&!r[LEVELS[i].id]);b.classList.toggle('cleared',!!r[LEVELS[i].id]);});
 }
 renderUI(){
  const g=this.game,phase=g.phase,l=g.level,ch=CHAPTERS[l.chapter];this.root.style.setProperty('--lv',l.color);this.$('maze-current').textContent=`第 ${l.chapter+1} 章 · ${ch.name} · ${String(g.index+1).padStart(2,'0')}`;this.$('maze-level-name').textContent=l.name.split(' · ')[0];this.$('maze-par').textContent=`标准 ${shortTime(l.par)}`;this.$('maze-time').textContent=timeText(g.elapsed);this.$('maze-time').classList.toggle('over',g.elapsed>l.par);this.$('maze-falls').textContent=g.falls;this.$('maze-checkpoint').textContent=g.checkpoint<0?'起点':`C${g.checkpoint+1}`;this.$('maze-timer-note').textContent=g.started?'本次挑战累计用时 · P / Esc 暂停':'首次有效操作后计时 · P / Esc 暂停';this.$('maze-strategy').textContent=l.strategy;this.$('maze-board-status').textContent=({ready:'向云端出发',playing:g.started?'看好前路，保持平衡':'先看前路，再出发',paused:'已暂停',countdown:'握稳，准备出发',falling:'坠落 · 返回检查点',won:'到达终点！'})[phase]||'';
  this.$('maze-surface').textContent=({ice:'❄ 冰面',fluff:'☁ 云絮'})[g.surface]||(g.riding?'▭ 浮台':g.boostTime>0?'» 加速中':'');
  this.$('maze-keyboard').classList.toggle('selected',this.source==='keyboard');this.$('maze-use-phone').classList.toggle('selected',this.source==='phone');this.$('maze-source-label').textContent=this.source==='phone'?'◉ 手机手柄':'⌨ 键盘控制';this.$('maze-control-tip').textContent=this.source==='phone'?'横屏轻倾 · 反向刹车':'WASD / 方向键 · 反向刹车';this.$('maze-pause').textContent=phase==='paused'?'继续 →':'暂停';this.$('maze-pause').disabled=['ready','won'].includes(phase);const hint=performance.now()<this.hintUntil;this.$('maze-hint').textContent=hint?this.hint:'';this.$('maze-hint').classList.toggle('visible',hint);
  let html='';
  if(this.graphicsError)html='<span class="maze-overlay-kicker">需要 3D 画面支持</span><h2>请启用浏览器硬件加速</h2><p>使用支持 WebGL 的 Chrome、Safari 或 Edge 后重新打开。</p><button data-action="map" class="btn btn-ghost">返回地图</button>';
  else if(!this.host)html='<span class="maze-overlay-kicker">已在另一窗口打开</span><h2>请回到正在游戏的窗口</h2><p>原窗口会暂停，关卡进度保留在各自窗口。</p><button data-action="takeover" class="btn btn-sky">使用这个窗口 →</button>';
  else if(phase==='paused')html=`<span class="maze-overlay-kicker">歇一下</span><h2>看看前路，再出发。</h2><p>${REASONS[g.pauseReason]||REASONS.manual}</p><button data-action="resume" class="btn btn-sky btn-big">准备好了，继续 →</button><div class="overlay-links"><button data-action="retry" class="btn btn-ghost btn-small">从起点重来</button><button data-action="map" class="btn btn-ghost btn-small">返回地图</button></div>`;
  else if(phase==='countdown')html=`<span class="maze-overlay-kicker">握稳手机，准备出发</span><h2 class="roll-countdown">${Math.max(1,Math.ceil(g.countdown))}</h2><p>从${g.checkpoint<0?'起点':'最近检查点'}出发 · 速度已清零</p>`;
  else if(phase==='won'){const w=this.lastWin,s=w?.stars??starCount(l,g.results[g.index]),last=g.index>=LEVELS.length-1;html=`<span class="maze-overlay-kicker">${esc(ch.name)} · 第 ${g.index+1} 张</span>${starHTML(s,'big')}<h2>${WIN_LINES[g.index]||'到达终点！'}</h2>${w?.newBest?'<span class="toon-badge gold">新纪录！</span>':w?.first?'<span class="toon-badge sky">首次通关</span>':''}<div class="maze-win-stats"><span>用时<b>${timeText(g.elapsed)}</b><small>标准 ${shortTime(l.par)}</small></span><span>坠落<b>${g.falls} 次</b><small>${g.falls?'3 星要不坠落':'完美'}</small></span><span>最佳<b>${w?timeText(w.record.best):'—'}</b><small>本机纪录</small></span></div><button data-action="next" class="btn btn-sky btn-big">${last?'回到地图 →':'下一张地图 →'}</button><div class="overlay-links"><button data-action="retry" class="btn btn-ghost btn-small">再玩一次</button>${last?'':'<button data-action="map" class="btn btn-ghost btn-small">返回地图</button>'}</div>`;}
  const overlay=this.$('maze-overlay');if(this.overlayHTML!==html){overlay.innerHTML=html;this.overlayHTML=html;}overlay.classList.toggle('visible',!!html);
 }
 sendState(){if(this.active&&this.host&&this.online)this.conn.send({type:'maze_state',phase:this.view==='map'?'ready':this.game.phase,level:this.game.index+1,elapsed:this.game.elapsed,falls:this.game.falls,checkpoint:this.game.checkpoint,checkpointCount:this.game.level.checkpoints.length});}
 message(m){
  if(m.type==='ready'){this.online=true;if(this.active){this.conn.send({type:'maze_view',active:true});}}
  if(m.type==='controller_status'){const select=this.$('maze-phone'),key=JSON.stringify(m.phones?.map(p=>[p.id,p.name,p.connected]));if(this.rosterKey!==key){this.rosterKey=key;select.replaceChildren();for(const p of m.phones||[])if(p.connected){const option=document.createElement('option');option.value=p.id;option.textContent=`手机 ${p.number} · ${p.name}`;select.append(option);}if(!select.options.length){const option=document.createElement('option');option.textContent='等待手机连接';option.value='';select.append(option);}if([...select.options].some(o=>o.value===this.controller.phoneId))select.value=this.controller.phoneId;}}
  if(['ready','maze_host','maze_roster','controller_status'].includes(m.type))this.versus.message(m);
  if(this.view==='versus'&&['maze_input','maze_pause','maze_command'].includes(m.type)){this.versus.message(m);return;}
  if(m.type==='maze_host'){this.host=m.host;if(!m.host)this.pause('controller_change');else{this.conn.send({type:'maze_mode',mode:this.view==='versus'?'versus':'solo'});this.conn.send({type:'maze_input_mode',phone:this.source==='phone'});this.sendState();this.versus.sendState();}}
  if(m.type==='maze_controller'){this.controller=m;const select=this.$('maze-phone');if([...select.options].some(o=>o.value===m.phoneId))select.value=m.phoneId;else select.selectedIndex=0;this.$('maze-phone-status').textContent=!m.connected?'扫码连接手机，或直接用键盘开始。':m.ready?`手柄就绪 · ${m.source==='tilt'?'倾斜控制':'虚拟摇杆'}`:'已连接 · 请在手机启用滚球手柄';if(m.ready&&!this.sourceChosen&&!this.game.started)this.setSource('phone');}
  if(m.type==='maze_input'){this.phone={x:m.x,y:m.y,at:performance.now()};}
  if(m.type==='maze_pause'&&this.source==='phone')this.pause(m.reason);
  if(m.type==='maze_command'){if(m.action==='pause')this.pause('manual');if(m.action==='resume')this.resume();if(m.action==='retry'){if(this.view==='map'||this.game.phase==='ready')this.start(this.nextLevel());else this.start(this.game.index);}if(m.action==='next'&&this.game.phase==='won')this.act('next');}
  if(m.type.startsWith('maze_'))this.renderUI();
 }
}
