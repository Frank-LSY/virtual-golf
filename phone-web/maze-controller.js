import {LEVELS} from '../shared/maze/levels.js';
import {TiltMapper,orientationGravity} from '../shared/maze/tilt.js';
import {vector} from '../shared/maze/physics.js';
const stamp=s=>`${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`;
// Uses the existing phone connection and identity; never opens a second socket.
export class MazeController {
 constructor(conn){
  this.conn=conn;this.active=false;this.online=false;this.mode=null;this.ready=false;this.mapper=new TiltMapper();this.value={x:0,y:0};this.seq=0;this.lastSensor=0;this.lastOrientation=-Infinity;this.game={phase:'ready',level:1,elapsed:0,falls:0};
  const root=document.createElement('section');root.id='maze-controller';root.className='hidden';root.innerHTML=`<div class="mc-heading"><span>云端滚球 · 手机手柄</span><b id="mc-state">等待选择控制方式</b></div><div class="mc-layout"><div class="mc-pad-side"><div class="mc-pad" id="mc-pad" role="application" aria-label="拖动虚拟摇杆，控制滚球加速度"><i class="mc-axis mc-axis-x"></i><i class="mc-axis mc-axis-y"></i><div class="mc-knob" id="mc-knob">◉</div><em class="mc-forward">↑ 前进</em><span id="mc-pad-label">横向端住 · 向下刹车</span></div><p id="mc-notice" role="status">横屏端住手机。向前轻倾加速，反向倾斜刹车。</p></div><div class="mc-panel"><div class="mc-stats"><span>地图 <b id="mc-level">01</b></span><span id="mc-time">00:00</span><span>坠落 <b id="mc-falls">0</b> 次</span><span id="mc-checkpoint">起点</span></div><div class="mc-mode"><button id="mc-tilt">启用倾斜控制</button><button id="mc-stick">虚拟摇杆</button></div><button id="mc-zero" class="mc-zero">↺ 重新校准握姿</button><div class="mc-actions"><button id="mc-pause">暂停</button><button id="mc-retry">重新挑战</button><button id="mc-next" class="hidden">下一关 →</button></div><p class="mc-footnote">轻倾精调 · 反向刹车<br>看电脑上的球，手机只作手柄。<br>横屏体验更好，竖屏也可使用。</p></div></div>`;
  document.getElementById('phone-main').append(root);this.root=root;this.$=id=>root.querySelector('#'+id);
  this.$('mc-tilt').onclick=()=>this.enableTilt();this.$('mc-stick').onclick=()=>this.useJoystick();this.$('mc-zero').onclick=()=>this.rezero();
  this.$('mc-pause').onclick=()=>this.command(this.game.phase==='paused'?'resume':this.game.phase==='ready'?'retry':'pause');this.$('mc-retry').onclick=()=>this.command('retry');this.$('mc-next').onclick=()=>this.command('next');
  const pad=this.$('mc-pad');pad.addEventListener('pointerdown',e=>{if(this.mode!=='joystick'||!this.active||this.pointer!==undefined)return;e.preventDefault();this.pointer=e.pointerId;pad.setPointerCapture(e.pointerId);this.move(e);});pad.addEventListener('pointermove',e=>{if(e.pointerId===this.pointer)this.move(e);});
  const release=e=>{if(e.pointerId!==this.pointer)return;this.pointer=undefined;this.value={x:0,y:0};this.drawValue();};for(const type of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(type,release);
  window.addEventListener('deviceorientation',e=>{if(!this.sensing()||![e.beta,e.gamma].every(Number.isFinite))return;this.lastOrientation=performance.now();this.sensor(orientationGravity(e.beta,e.gamma));});
  window.addEventListener('devicemotion',e=>{if(!this.sensing()||performance.now()-this.lastOrientation<200)return;const g=e.accelerationIncludingGravity;if(g)this.sensor({x:g.x,y:g.y,z:g.z});});
  document.addEventListener('visibilitychange',()=>{if(!this.active)return;if(document.hidden)this.suspend();else{this.rezero();this.keepAwake();}});window.addEventListener('pagehide',()=>{if(this.active)this.suspend();});
  conn.addEventListener('message',({detail:m})=>this.message(m));conn.addEventListener('offline',()=>{this.online=false;this.reconnectPending=true;this.ready=false;this.value={x:0,y:0};this.notice('连接中断，电脑上的小球已暂停。正在重新连接…');this.render();});
  setInterval(()=>this.tick(),33);
 }
 sensing(){return this.active&&this.mode==='tilt'&&this.permission&&!document.hidden;}
 message(m){
  if(m.type==='ready'){this.online=true;this.render();}
  if(m.type==='maze_subscription'){
   if(m.game)this.game=m.game;const changed=this.active!==m.active;this.active=m.active===true;document.title=this.active?'云端滚球 · 手机手柄':'挥杆之间 · 手机球杆';this.root.classList.toggle('hidden',!this.active);document.body.classList.toggle('maze-phone-active',this.active);
   if(changed||this.active&&this.reconnectPending){this.reconnectPending=false;if(this.active){this.rezero();this.keepAwake();}else{this.ready=false;this.value={x:0,y:0};this.pointer=undefined;this.wake?.release();this.wake=null;}}this.render();
  }
  if(m.type==='maze_rezero')this.rezero();
  if(m.type==='maze_game_state'){this.game=m;this.render();}
 }
 command(action){if(this.active&&this.online)this.conn.send({type:'maze_command',action});}
 async keepAwake(){if(this.wake||document.hidden||!this.active)return;try{this.wake=await navigator.wakeLock?.request('screen');this.wake?.addEventListener('release',()=>{this.wake=null;});}catch{}}
 notice(text){this.$('mc-notice').textContent=text;}
 sendReady(ready){const changed=this.ready!==ready;this.ready=ready;if(this.active&&this.online)this.conn.send({type:'maze_ready',ready,source:this.mode||'joystick'});if(changed)this.render();}
 rezero(){this.mapper.reset();this.value={x:0,y:0};this.pointer=undefined;this.lastSensor=performance.now();this.lastOrientation=-Infinity;this.drawValue();if(this.mode==='joystick'){this.sendReady(!document.hidden);this.notice('向上推前进，向下推刹车或后退。拖得越远，加速越强；松手回正。');}else if(this.mode==='tilt'){this.sendReady(false);this.notice('保持自然握姿静止约 0.6 秒，正在归零…');}else this.ready=false;this.render();}
 suspend(){this.value={x:0,y:0};this.pointer=undefined;this.sendReady(false);this.conn.send({type:'maze_pause'});this.wake?.release();this.wake=null;this.drawValue();}
 useJoystick(){this.mode='joystick';this.rezero();this.keepAwake();}
 async enableTilt(){
  if(!window.isSecureContext){this.notice('倾斜控制需要受信任的 HTTPS。请按电脑“连接手机”的说明设置，或直接使用虚拟摇杆。');return;}
  if(!window.DeviceOrientationEvent&&!window.DeviceMotionEvent){this.notice('当前设备不支持运动传感器，请使用虚拟摇杆。');return;}
  try{
   // Start both permission requests during the same user gesture (iOS).
   const requests=[window.DeviceOrientationEvent,window.DeviceMotionEvent].filter(Boolean).map(api=>typeof api.requestPermission==='function'?api.requestPermission():Promise.resolve('granted'));
   const allowed=await Promise.all(requests.map(p=>Promise.resolve(p).catch(()=>'denied')));if(!allowed.some(v=>v==='granted')){this.notice('未获得传感器权限，请在浏览器设置中允许，或使用虚拟摇杆。');return;}
   this.permission=true;this.mode='tilt';this.rezero();this.keepAwake();
  }catch{this.notice('无法启用倾斜控制。虚拟摇杆仍可正常游玩。');}
 }
 sensor(gravity){
  const now=performance.now(),angle=screen.orientation?.angle??window.orientation??0,result=this.mapper.sample(gravity,now,Number(angle));if(!result)return;this.lastSensor=now;
  if(result.changed&&this.ready)this.sendReady(false);
  this.value={x:result.x,y:result.y};
  if(!result.ready){this.notice(`保持自然握姿静止，正在归零 ${Math.round(result.progress*100)}%`);if(this.ready)this.sendReady(false);}
  else if(!this.ready){this.sendReady(true);this.notice('手柄已就绪。左右、前后轻倾，回正后仍有惯性；反向倾斜可以刹车。');}
  this.drawValue();
 }
 move(e){const box=this.$('mc-pad').getBoundingClientRect(),radius=box.width*.34;this.value=vector((e.clientX-box.left-box.width/2)/radius,(e.clientY-box.top-box.height/2)/radius);this.drawValue();}
 drawValue(){const radius=this.$('mc-pad').clientWidth*.29;this.$('mc-knob').style.transform=`translate(${this.value.x*radius}px,${this.value.y*radius}px)`;}
 tick(){
  if(!this.active||!this.online||document.hidden)return;
  if(this.mode==='tilt'&&performance.now()-this.lastSensor>600){if(this.ready)this.sendReady(false);this.value={x:0,y:0};this.notice('尚未收到传感器数据。请保持页面前台、检查权限，或切换虚拟摇杆。');this.drawValue();}
  if(this.ready)this.conn.send({type:'maze_input',...this.value,seq:++this.seq});
 }
 render(){
  const g=this.game,phase=g.phase;{const l=LEVELS[(g.level||1)-1];this.$('mc-level').textContent=l?`${String(g.level).padStart(2,'0')} ${l.name.split(' · ')[0]}`:g.level;}this.$('mc-time').textContent=stamp(g.elapsed);this.$('mc-falls').textContent=g.falls;this.$('mc-checkpoint').textContent=(g.checkpoint??-1)<0?'起点':`复活点 C${g.checkpoint+1}`;
  this.$('mc-state').textContent=!this.online?'正在恢复连接…':!this.mode?'选择控制方式':!this.ready?'手柄准备中':({ready:'先观察，准备开始',playing:'轻轻倾斜 · 提前刹车',paused:'已暂停 · 握稳后继续',countdown:'准备中 · 握稳手机',falling:'坠落 · 返回检查点',won:'本关完成！',complete:'查看挑战记录'})[phase]||'手柄已就绪';
  this.$('mc-tilt').classList.toggle('selected',this.mode==='tilt');this.$('mc-stick').classList.toggle('selected',this.mode==='joystick');this.$('mc-pad').classList.toggle('joystick',this.mode==='joystick');this.$('mc-pad-label').textContent=this.mode==='joystick'?'拖动摇杆 · 松手回正':'横向端住 · 向下刹车';this.$('mc-zero').disabled=this.mode!=='tilt';
  this.$('mc-pause').textContent=phase==='paused'?'准备好了，继续 →':phase==='ready'?'开始游戏 →':'暂停 / 观察';this.$('mc-pause').disabled=!this.ready||['won','complete','falling','countdown'].includes(phase);this.$('mc-next').classList.toggle('hidden',phase!=='won');this.$('mc-next').textContent=g.level===3?'查看全部结果 →':'下一关 →';
 }
}
