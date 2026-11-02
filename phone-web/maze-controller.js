import {LEVELS} from '../shared/maze/levels.js';
import {TiltMapper,orientationGravity} from '../shared/maze/tilt.js';
import {vector} from '../shared/maze/physics.js';
import {VERSUS_COLORS,STAGES} from '../shared/maze/endless.js';
import {haptics,hapticsPanelHTML,bindHapticsPanel} from './haptics.js';
const stamp=s=>`${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`;
// Uses the existing phone connection and identity; never opens a second socket.
// 0.24：电脑打开多人对战时，每台手机都显示“加入对战”；加入后选倾斜或摇杆，就绪后可以开始。比赛中显示自己的距离、
// 离崩塌还有多远、是否出局与名次。
// 0.26 震动：电脑把撞墙 / 弹板 / 扫杆 / 碰球 / 坠落 / 检查点等物理事件转发给对应手机（maze_feel），力度随碰撞强弱；
// 倒计时、出发、新赛段、崩塌逼近（越近越急）、出局、名次由手机按状态变化自己判断；摇杆推到边会轻震一下。
// 0.26 倾斜控制只用横屏：竖着拿时不接受倾斜输入，整屏提示“把手机横过来”（虚拟摇杆横竖屏都能用）；
// 安卓上点“启用倾斜控制”会尝试全屏并锁定横屏，iPhone 不支持锁定，靠提示。
export class MazeController {
 constructor(conn,{haptics:h=haptics}={}){
  this.conn=conn;this.h=h;this.feel={phase:null,count:null,stage:0,alive:null,others:null,joined:false,edge:false,danger:-Infinity,checkpoint:-1};this.active=false;this.online=false;this.mode=null;this.ready=false;this.mapper=new TiltMapper();this.value={x:0,y:0};this.seq=0;this.lastSensor=0;this.lastOrientation=-Infinity;this.game={phase:'ready',level:1,elapsed:0,falls:0};this.kind='solo';this.vs={joined:false,slot:null,count:0,full:false,locked:false,allReady:false,state:null};
  const root=document.createElement('section');root.id='maze-controller';root.className='hidden';root.innerHTML=`<div class="mc-heading"><b id="mc-state">等待选择控制方式</b></div><div class="mc-layout"><div class="mc-pad-side"><div class="mc-pad" id="mc-pad" role="application" aria-label="拖动虚拟摇杆，控制滚球加速度"><i class="mc-axis mc-axis-x"></i><i class="mc-axis mc-axis-y"></i><div class="mc-knob" id="mc-knob">◉</div><em class="mc-forward">↑ 前进</em><span id="mc-pad-label">横握 · 前倾加速 · 后仰刹车</span></div><p id="mc-notice" role="status">倾斜控制：手机横过来，两手横握。向前轻倾加速，反向倾斜刹车。</p></div><div class="mc-panel"><div class="mc-versus" id="mc-versus"><div class="mc-vs-head"><span class="mc-vs-badge" id="mc-vs-badge">对战</span><b id="mc-vs-title">多人对战 · 无尽云路</b></div><p class="mc-vs-text" id="mc-vs-text">掉下去就出局，最后留在赛道上的人获胜。</p><div class="mc-vs-actions"><button id="mc-join" class="mc-primary">加入对战</button><button id="mc-vs-start" class="mc-primary">开始对战 →</button><button id="mc-vs-again" class="mc-primary">再来一局 →</button><button id="mc-leave">退出对战</button></div></div><div class="mc-stats"><span>地图 <b id="mc-level">01</b></span><span id="mc-time">00:00</span><span>坠落 <b id="mc-falls">0</b> 次</span><span id="mc-checkpoint">起点</span></div><div class="mc-mode"><button id="mc-tilt">启用倾斜控制</button><button id="mc-stick">虚拟摇杆</button></div><button id="mc-zero" class="mc-zero">↺ 重新校准握姿</button><div class="mc-actions"><button id="mc-pause">暂停</button><button id="mc-retry">重新挑战</button><button id="mc-next" class="hidden">下一关 →</button></div><p class="mc-footnote" id="mc-footnote">看电脑上的球，手机只作手柄。</p><details class="mc-more"><summary>震动设置</summary>${hapticsPanelHTML('mc')}</details></div></div><div class="mc-rotate hidden" id="mc-rotate" role="alertdialog" aria-label="请把手机横过来"><i class="mc-rotate-phone" aria-hidden="true"></i><b>把手机横过来</b><p>倾斜控制要横屏：两手横握，像拿游戏手柄。<br>转过来后保持不动约半秒，自动归零。</p><button id="mc-rotate-stick">改用虚拟摇杆</button></div>`;
  document.getElementById('phone-main').append(root);this.root=root;this.$=id=>root.querySelector('#'+id);bindHapticsPanel(this.$,'mc',this.h);
  this.$('mc-tilt').onclick=()=>this.enableTilt();this.$('mc-stick').onclick=()=>this.useJoystick();this.$('mc-rotate-stick').onclick=()=>this.useJoystick();
  const turned=()=>{if(!this.active)return;const land=this.landscape;if(land===this.wasLandscape)return;this.wasLandscape=land;if(this.mode==='tilt')this.rezero();else this.render();};screen.orientation?.addEventListener?.('change',turned);window.addEventListener('resize',turned);this.$('mc-zero').onclick=()=>this.rezero();
  this.$('mc-pause').onclick=()=>{if(this.kind==='versus'){this.command(this.vs.state?.phase==='paused'?'resume':'pause');return;}this.command(this.game.phase==='paused'?'resume':this.game.phase==='ready'?'retry':'pause');};this.$('mc-retry').onclick=()=>this.command('retry');this.$('mc-next').onclick=()=>this.command('next');
  this.$('mc-join').onclick=()=>{if(this.online)this.conn.send({type:'maze_join',join:true});};this.$('mc-leave').onclick=()=>{if(this.online)this.conn.send({type:'maze_join',join:false});};this.$('mc-vs-start').onclick=()=>this.command('start');this.$('mc-vs-again').onclick=()=>this.command('rematch');
  const pad=this.$('mc-pad');pad.addEventListener('pointerdown',e=>{if(this.mode!=='joystick'||!this.active||this.pointer!==undefined)return;e.preventDefault();this.pointer=e.pointerId;pad.setPointerCapture(e.pointerId);this.move(e);});pad.addEventListener('pointermove',e=>{if(e.pointerId===this.pointer)this.move(e);});
  const release=e=>{if(e.pointerId!==this.pointer)return;this.pointer=undefined;this.value={x:0,y:0};this.drawValue();};for(const type of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(type,release);
  window.addEventListener('deviceorientation',e=>{if(!this.sensing()||![e.beta,e.gamma].every(Number.isFinite))return;this.lastOrientation=performance.now();this.sensor(orientationGravity(e.beta,e.gamma));});
  window.addEventListener('devicemotion',e=>{if(!this.sensing()||performance.now()-this.lastOrientation<200)return;const g=e.accelerationIncludingGravity;if(g)this.sensor({x:g.x,y:g.y,z:g.z});});
  document.addEventListener('visibilitychange',()=>{if(!this.active)return;if(document.hidden)this.suspend();else{this.rezero();this.keepAwake();}});window.addEventListener('pagehide',()=>{if(this.active)this.suspend();});
  conn.addEventListener('message',({detail:m})=>this.message(m));conn.addEventListener('offline',()=>{this.online=false;this.reconnectPending=true;this.ready=false;this.value={x:0,y:0};this.notice('连接中断，电脑上的小球已暂停。正在重新连接…');this.render();});
  setInterval(()=>this.tick(),33);
 }
 sensing(){return this.active&&this.mode==='tilt'&&this.permission&&!document.hidden;}
 // 横屏：优先看屏幕方向类型，其次旋转角度，最后看窗口宽高。
 get landscape(){const o=screen.orientation;if(typeof o?.type==='string')return o.type.startsWith('landscape');const a=Number(o?.angle??window.orientation);if(Number.isFinite(a))return Math.abs(a)%180===90;return (window.innerWidth||0)>(window.innerHeight||0);}
 // 安卓 Chrome：全屏后才能锁定横屏；失败（例如 iPhone）就只靠提示。
 async lockLandscape(){try{if(!document.fullscreenElement&&document.documentElement?.requestFullscreen){await document.documentElement.requestFullscreen({navigationUI:'hide'});this.fullscreen=true;}await screen.orientation?.lock?.('landscape');}catch{}}
 unlockLandscape(){try{screen.orientation?.unlock?.();}catch{}if(this.fullscreen&&document.fullscreenElement){try{document.exitFullscreen?.();}catch{}}this.fullscreen=false;}
 // 是否在当手柄：单人模式下是被选中的手机；对战模式下是已加入的手机。
 get controlling(){return this.active&&(this.kind!=='versus'||this.vs.joined);}
 message(m){
  if(m.type==='ready'){this.online=true;this.render();}
  if(m.type==='maze_subscription'){
   if(m.game)this.game=m.game;const kind=m.mode==='versus'?'versus':'solo',wasJoined=this.kind==='versus'&&this.vs.joined,joined=kind==='versus'&&m.joined===true;
   if(joined&&!wasJoined)this.h.play('confirm');
   if(kind==='versus')this.vs={joined,slot:m.slot??null,count:m.count||0,full:!!m.full,locked:!!m.locked,allReady:!!m.allReady,state:m.versus??this.vs.state};
   const changed=this.active!==m.active||this.kind!==kind||wasJoined!==joined;this.kind=kind;this.active=m.active===true;document.title=this.active?'云端滚球 · 手机手柄':'体感派对 · 手机控制器';this.root.classList.toggle('hidden',!this.active);document.body.classList.toggle('maze-phone-active',this.active);
   if(changed||this.active&&this.reconnectPending){this.reconnectPending=false;if(this.active){if(!this.mode)this.restoreMode();this.rezero();this.keepAwake();}else{this.ready=false;this.value={x:0,y:0};this.pointer=undefined;this.wake?.release();this.wake=null;this.unlockLandscape();}}this.render();
  }
  if(m.type==='maze_rezero')this.rezero();
  if(m.type==='maze_game_state'){this.soloFeel(this.game,m);this.game=m;this.render();}
  if(m.type==='maze_versus_state'){this.versusFeel(m);this.vs.state=m;this.render();}
  if(m.type==='maze_feel'&&this.controlling)this.physical(m);
 }
 command(action){if(this.controlling&&this.online)this.conn.send({type:'maze_command',action});}
 async keepAwake(){if(this.wake||document.hidden||!this.active)return;try{this.wake=await navigator.wakeLock?.request('screen');this.wake?.addEventListener('release',()=>{this.wake=null;});}catch{}}
 notice(text){this.$('mc-notice').textContent=text;}
 sendReady(ready){const changed=this.ready!==ready;this.ready=ready;if(changed&&this.active)this.h.play(ready?'ready':'nudge');if(this.controlling&&this.online)this.conn.send({type:'maze_ready',ready,source:this.mode||'joystick'});if(changed)this.render();}
 rezero(){this.mapper.reset();this.value={x:0,y:0};this.pointer=undefined;this.lastSensor=performance.now();this.lastOrientation=-Infinity;this.drawValue();if(this.mode==='joystick'){this.sendReady(!document.hidden);this.notice('向上推前进，向下推刹车或后退。拖得越远，加速越强；松手回正。');}else if(this.mode==='tilt'){this.sendReady(false);this.notice(this.landscape?'横握手机静止约 0.6 秒，正在归零…':'倾斜控制要横屏：先把手机横过来。');}else this.ready=false;this.render();}
 suspend(){this.value={x:0,y:0};this.pointer=undefined;this.sendReady(false);if(this.controlling)this.conn.send({type:'maze_pause'});this.wake?.release();this.wake=null;this.drawValue();}
 saveMode(m){try{globalThis.localStorage?.setItem('swinglink-maze-mode',m);}catch{}}
 restoreMode(){let m=null;try{m=globalThis.localStorage?.getItem('swinglink-maze-mode');}catch{}if(m==='joystick')this.mode='joystick';else if(m==='tilt'&&(this.permission||globalThis.document?.body?.dataset?.motion==='granted')){this.permission=true;this.mode='tilt';this.wasLandscape=this.landscape;}}
 useJoystick(){this.saveMode('joystick');this.mode='joystick';this.unlockLandscape();this.rezero();this.keepAwake();}
 async enableTilt(){
  if(!window.isSecureContext){this.notice('倾斜控制需要受信任的 HTTPS。请按电脑“连接手机”的说明设置，或直接使用虚拟摇杆。');return;}
  if(!window.DeviceOrientationEvent&&!window.DeviceMotionEvent){this.notice('当前设备不支持运动传感器，请使用虚拟摇杆。');return;}
  try{
   // Start both permission requests during the same user gesture (iOS).
   const requests=[window.DeviceOrientationEvent,window.DeviceMotionEvent].filter(Boolean).map(api=>typeof api.requestPermission==='function'?api.requestPermission():Promise.resolve('granted'));
   const allowed=await Promise.all(requests.map(p=>Promise.resolve(p).catch(()=>'denied')));if(!allowed.some(v=>v==='granted')){this.notice('未获得传感器权限，请在浏览器设置中允许，或使用虚拟摇杆。');return;}
   this.permission=true;this.mode='tilt';this.saveMode('tilt');this.lockLandscape();this.wasLandscape=this.landscape;this.rezero();this.keepAwake();
  }catch{this.notice('无法启用倾斜控制。虚拟摇杆仍可正常游玩。');}
 }
 sensor(gravity){
  const now=performance.now(),angle=screen.orientation?.angle??window.orientation??0;
  if(!this.landscape){this.lastSensor=now;this.mapper.reset();this.value={x:0,y:0};if(this.ready)this.sendReady(false);this.notice('倾斜控制要横屏：先把手机横过来。');this.drawValue();this.renderRotate();return;}
  const result=this.mapper.sample(gravity,now,Number(angle));if(!result)return;this.lastSensor=now;
  if(result.changed&&this.ready)this.sendReady(false);
  this.value={x:result.x,y:result.y};
  if(!result.ready){this.notice(`保持自然握姿静止，正在归零 ${Math.round(result.progress*100)}%`);if(this.ready)this.sendReady(false);}
  else if(!this.ready){this.sendReady(true);this.notice('手柄已就绪。横握手机，左右、前后轻倾；回正后仍有惯性，反向倾斜可以刹车。');}
  this.drawValue();
 }
 move(e){const box=this.$('mc-pad').getBoundingClientRect(),radius=box.width*.34;this.value=vector((e.clientX-box.left-box.width/2)/radius,(e.clientY-box.top-box.height/2)/radius);const mag=Math.hypot(this.value.x,this.value.y);if(mag>=.98&&!this.feel.edge){this.feel.edge=true;this.h.play('limit');}else if(mag<.85)this.feel.edge=false;this.drawValue();}
 drawValue(){const radius=this.$('mc-pad').clientWidth*.29;this.$('mc-knob').style.transform=`translate(${this.value.x*radius}px,${this.value.y*radius}px)`;}
 tick(){
  if(!this.active||!this.online||document.hidden)return;
  if(this.mode==='tilt'&&!this.landscape){if(this.ready)this.sendReady(false);this.lastSensor=performance.now();this.notice('倾斜控制要横屏：先把手机横过来。');this.renderRotate();return;}
  if(this.mode==='tilt'&&performance.now()-this.lastSensor>600){if(this.ready)this.sendReady(false);this.value={x:0,y:0};this.notice('尚未收到传感器数据。请保持页面前台、检查权限，或切换虚拟摇杆。');this.drawValue();}
  if(this.ready&&this.controlling)this.conn.send({type:'maze_input',...this.value,seq:++this.seq});
  this.dangerFeel();
 }
 // ---------- 震动 ----------
 // 电脑转发的物理事件：力度 0–1。对战里掉下去就是出局。
 physical(m){const k=m.kind,s=Number.isFinite(m.strength)?m.strength:1;if(['wall','bump','sweep','clash','board','boost','checkpoint'].includes(k))this.h.play(k,{strength:s});else if(k==='fall')this.h.play(this.kind==='versus'?'out':'fall');}
 soloFeel(prev,next){if(this.kind==='versus'||!this.controlling)return;const a=prev?.phase,b=next.phase;if(a===b)return;if(b==='playing'&&a==='countdown')this.h.play('go');else if(b==='paused')this.h.play('pause');else if(b==='won')this.h.play('success');else if(b==='complete')this.h.play('win');else if(b==='countdown')this.h.play('count');}
 versusFeel(s){
  const f=this.feel,v=this.vs;if(!v.joined){f.phase=s.phase;return;}const you=s.players?.find(p=>p.slot===v.slot),others=(s.players||[]).filter(p=>p.slot!==v.slot&&p.alive).length,count=s.phase==='countdown'?Math.max(1,Math.ceil(s.countdown??1)):null;
  if(s.phase==='countdown'&&count!==f.count)this.h.play('count');
  if(f.phase==='countdown'&&s.phase==='playing')this.h.play('go');
  if(s.phase==='paused'&&f.phase!=='paused')this.h.play('pause');
  if(s.phase==='playing'&&(s.stage||0)>f.stage)this.h.play('stage');
  if(['playing','paused'].includes(s.phase)&&f.alive===true&&you&&!you.alive)this.h.play('out');
  else if(s.phase==='playing'&&f.others!==null&&others<f.others&&you?.alive)this.h.play('rival');
  if(s.phase==='over'&&f.phase!=='over')this.h.play(s.solo?'success':you?.rank===1?'win':'whistle');
  f.phase=s.phase;f.count=count;f.stage=['playing','paused'].includes(s.phase)?Math.max(f.stage,s.stage||0):0;f.alive=you?you.alive:null;f.others=['playing','paused'].includes(s.phase)?others:null;
 }
 // 崩塌逼近：离崩塌 7 米以内开始“心跳”，越近越重、越急（约 1.1 秒 → 0.4 秒一次）。
 dangerFeel(){const s=this.vs.state;if(this.kind!=='versus'||!this.vs.joined||s?.phase!=='playing')return;const you=s.players?.find(p=>p.slot===this.vs.slot);if(!you?.alive||you.gap===null||you.gap===undefined||you.gap>=7)return;const t=performance.now(),x=Math.max(0,Math.min(1,1-you.gap/7));if(t-this.feel.danger<400+700*(1-x))return;this.feel.danger=t;this.h.play('danger',{strength:x});}
 renderRotate(){const show=this.controlling&&this.mode==='tilt'&&!this.landscape;this.$('mc-rotate').classList.toggle('hidden',!show);this.root.classList.toggle('need-rotate',show);}
 render(){
  this.renderRotate();this.root.classList.toggle('versus',this.kind==='versus');this.root.classList.toggle('vs-joined',this.kind==='versus'&&this.vs.joined);
  if(this.kind==='versus'){this.renderVersus();return;}
  const g=this.game,phase=g.phase;this.$('mc-pause').classList.toggle('hidden',false);this.$('mc-retry').classList.toggle('hidden',phase==='ready');{const l=LEVELS[(g.level||1)-1];this.$('mc-level').textContent=l?`${String(g.level).padStart(2,'0')} ${l.name.split(' · ')[0]}`:g.level;}this.$('mc-time').textContent=stamp(g.elapsed);this.$('mc-falls').textContent=g.falls;this.$('mc-checkpoint').textContent=(g.checkpoint??-1)<0?'起点':`复活点 C${g.checkpoint+1}`;
  this.$('mc-state').textContent=!this.online?'正在恢复连接…':!this.mode?'选择控制方式':!this.ready?'手柄准备中':({ready:'先观察，准备开始',playing:'轻轻倾斜 · 提前刹车',paused:'已暂停 · 握稳后继续',countdown:'准备中 · 握稳手机',falling:'坠落 · 返回检查点',won:'本关完成！',complete:'查看挑战记录'})[phase]||'手柄已就绪';
  this.$('mc-tilt').classList.toggle('selected',this.mode==='tilt');this.$('mc-stick').classList.toggle('selected',this.mode==='joystick');this.$('mc-pad').classList.toggle('joystick',this.mode==='joystick');this.$('mc-pad-label').textContent=this.mode==='joystick'?'拖动摇杆 · 松手回正':'横握 · 前倾加速 · 后仰刹车';this.$('mc-zero').classList.toggle('hidden',this.mode!=='tilt');this.$('mc-footnote').textContent=this.mode==='tilt'?'轻倾精调 · 反向刹车 · 看电脑上的球':this.mode==='joystick'?'拖得越远加速越强 · 松手回正 · 看电脑上的球':'倾斜控制要横屏；虚拟摇杆横竖屏都能用。';
  this.$('mc-pause').textContent=phase==='paused'?'准备好了，继续 →':phase==='ready'?'开始游戏 →':'暂停 / 观察';this.$('mc-pause').disabled=!this.ready||['won','complete','falling','countdown'].includes(phase);this.$('mc-next').classList.toggle('hidden',phase!=='won');this.$('mc-next').textContent=g.level===3?'查看全部结果 →':'下一关 →';
 }
 renderControls(){this.$('mc-tilt').classList.toggle('selected',this.mode==='tilt');this.$('mc-stick').classList.toggle('selected',this.mode==='joystick');this.$('mc-pad').classList.toggle('joystick',this.mode==='joystick');this.$('mc-pad-label').textContent=this.mode==='joystick'?'拖动摇杆 · 松手回正':'横握 · 前倾加速 · 后仰刹车';this.$('mc-zero').classList.toggle('hidden',this.mode!=='tilt');this.$('mc-footnote').textContent=this.mode==='tilt'?'轻倾精调 · 反向刹车 · 看电脑上的球':this.mode==='joystick'?'拖得越远加速越强 · 松手回正 · 看电脑上的球':'倾斜控制要横屏；虚拟摇杆横竖屏都能用。';}
 // 多人对战界面：加入 → 选控制方式 → 就绪 / 开始 → 比赛中（距离、离崩塌多远）→ 出局或名次 → 再来一局。
 renderVersus(){
  this.renderControls();const v=this.vs,s=v.state||{phase:'lobby',players:[]},phase=s.phase,slot=v.slot,color=slot!==null?VERSUS_COLORS[slot]:null,you=s.players?.find(p=>p.slot===slot),show=(id,on)=>this.$(id).classList.toggle('hidden',!on);
  const badge=this.$('mc-vs-badge');badge.textContent=v.joined?`${slot+1}P`:'对战';badge.style.background=color?.color||'';
  this.$('mc-vs-title').textContent=v.joined?`你是 ${slot+1}P · ${color.name}`:'多人对战 · 无尽云路';
  let text='',state='';const playing=['countdown','playing','paused'].includes(phase);
  if(!this.online){text='连接中断，正在重新连接…';state='正在恢复连接…';}
  else if(!v.joined){text=v.locked?`这一局正在进行（${v.count} 人），下一局再加入。`:v.full?'已经有 4 个人了，等下一局再来。':`已有 ${v.count} / 4 人加入。身后的赛道会崩塌，球会互相碰撞——掉下去就出局，最后留在赛道上的人获胜。`;state=v.locked?'观战中':'点“加入对战”';}
  else if(phase==='countdown'){text=`准备… ${Math.max(1,Math.ceil(s.countdown??1))}　握稳手机！`;state='马上出发';}
  else if(phase==='playing'||phase==='paused'){if(you?.alive){text=`已跑 ${you.distance} 米 · ${you.gap===null||you.gap===undefined?'崩塌还没开始':`崩塌在身后 ${Math.round(you.gap)} 米`} · ${STAGES[s.stage||0]?.name||''}`;state=phase==='paused'?'已暂停 · 握稳后继续':you.gap!==null&&you.gap<7?'快跑！赛道在塌':'轻轻倾斜 · 别掉下去';}else{text=`你掉下去了${you?.rank?` · 第 ${you.rank} 名`:''} · 跑了 ${you?.distance??0} 米。看电脑观战。`;state='已出局 · 观战中';}}
  else if(phase==='over'){const r=you?.rank;text=s.solo?`跑了 ${you?.distance??0} 米！${s.record&&you?.distance>=s.record?'新纪录！':''}`:r===1?`冠军！你是最后留在赛道上的人（${you.distance} 米）。`:`第 ${r||'—'} 名 · 跑了 ${you?.distance??0} 米。`;state=s.solo?'挑战结束':r===1?'你赢了！':'本局结束';}
  else{text=!this.mode?'先选择下面的「启用倾斜控制」或「虚拟摇杆」。':!this.ready?'手柄准备中：保持自然握姿静止一下。':v.allReady?'大家都准备好了，可以开始！':'你已就绪，等其他人选好控制方式。';state=this.ready?'已就绪':'选择控制方式';}
  this.$('mc-vs-text').textContent=text;this.$('mc-state').textContent=state;this.$('mc-versus').style.borderColor=playing?STAGES[s.stage||0]?.accent||'':'';this.$('mc-vs-text').classList.toggle('danger',!!(you?.alive&&you.gap!==null&&you.gap<7&&phase==='playing'));
  show('mc-join',!v.joined);this.$('mc-join').disabled=!this.online||v.locked||v.full;
  show('mc-vs-start',v.joined&&!playing&&phase!=='over');this.$('mc-vs-start').disabled=!this.ready||!v.allReady;this.$('mc-vs-start').textContent=v.count<=1?'单人挑战 →':'开始对战 →';
  show('mc-vs-again',v.joined&&phase==='over');this.$('mc-vs-again').disabled=!this.ready;
  show('mc-leave',v.joined&&!playing);
  show('mc-pause',v.joined&&(phase==='playing'||phase==='paused')&&!!you?.alive);this.$('mc-pause').textContent=phase==='paused'?'准备好了，继续 →':'暂停';this.$('mc-pause').disabled=!this.ready&&phase!=='paused';
  show('mc-retry',false);show('mc-next',false);
 }
}
