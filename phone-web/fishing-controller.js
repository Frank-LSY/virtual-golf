import {RodMapper,CastDetector,REJECT_TEXT} from '../shared/fishing/input.js';
import {FISH,VERSUS_PALETTE,PREFER_TIPS} from '../shared/fishing/rules.js';
import {haptics,hapticsPanelHTML,bindHapticsPanel} from './haptics.js';
// 体感钓鱼 · 手机鱼竿。沿用现有连接与身份，不另开连接。
// 体感：竖握、顶部朝前，静止约 0.6 秒归零；抬放 / 左右倾以约 30 Hz 发给网关；“准备抛竿”后在手机上识别后引 + 前挥并发送一次抛投。
// 触控：拖动竿姿区（上下 = 抬放，左右 = 侧倾）；准备后在竿姿区向上划抛投；咬钩时点“抬竿！”。
// 震动（0.26 起用共用的 phone-web/haptics.js）：倒计时 / 开钓、准备、抛出、落水、试探、咬钩、刺中、冲刺预兆、冲刺、水草、
// 上岸（深水大鱼更隆重）/ 逃鱼、时间到、名次各有节奏；搏鱼时每收回约 1 米有一下“棘轮”轻震，张力越紧“心跳”越急，线松了会轻点提醒。
// iPhone Safari 不支持网页震动，只有点按按钮时的轻触，其余靠画面和声音。
const LOST={break:'一直硬拉，线断了。鱼冲的时候放低一点。',unhook:'线松太久，鱼脱钩了。放竿要慢，边放边收。',weed:'鱼钻进水草了。往反方向侧拉。',abandon:'放弃了这一竿。',timeup:'时间到，鱼放回湖里。'};
const PAUSE={manual:'比赛暂停。',tab:'电脑离开了钓鱼页面。',host_offline:'电脑断开了。',controller_offline:'有手机断开了。',stream_gap:'有手机的数据中断了。',phone_hidden:'有手机离开了前台。',recenter:'有手机正在重新归零。'};
// 鱼竿事件 → 震动信号名（见 haptics.js）。没列出的事件不震。
const FEEL={armed:'armed',arm_timeout:'nudge',cast:'cast',splash:'splash',empty:'empty',nibble:'nibble',bite:'bite',spook:'spook',miss:'miss',hook:'hook',telegraph:'telegraph',dash:'dash',weed_warn:'weed',disarm:'disarm',round:'count',countdown:'count',go:'go',time_up:'whistle',pause:'pause',resume:'count',resumed:'go'};
export class FishingController {
 constructor(conn,{now=()=>performance.now(),haptics:h=haptics}={}){
  this.conn=conn;this.now=now;this.h=h;this.reelMark=null;this.strainAt=-Infinity;this.active=false;this.online=false;this.sub={joined:false};this.state=null;this.mode=null;this.ready=false;this.mapper=new RodMapper();this.cast=new CastDetector();this.pose={pitch:0,roll:0};this.raw={pitch:0,roll:0};this.seq=0;this.lastSensor=0;this.castId=0;this.confirmAbandon=-Infinity;
  const root=document.createElement('section');root.id='fish-controller';root.className='hidden';
  root.innerHTML=`<div class="fc-head"><span>体感钓鱼 · 鱼竿</span><b id="fc-state">等待加入</b></div>
  <div class="fc-card fc-join" id="fc-join-card"><b id="fc-join-title">湖边钓鱼 · 最多 6 人</b><p id="fc-join-text">点“加入钓鱼”，这台手机就是你的鱼竿。</p><button id="fc-join" class="fc-primary">加入钓鱼</button></div>
  <div class="fc-main" id="fc-main">
   <div class="fc-who"><span class="fc-badge" id="fc-badge">1P</span><b id="fc-name">你是 1P</b><span class="fc-score" id="fc-score">0 分</span></div>
   <div class="fc-mode" id="fc-mode"><button id="fc-motion">启用鱼竿（体感）</button><button id="fc-touch-mode">触控操作</button></div>
   <p class="fc-notice" id="fc-notice">竖着握住手机，顶部朝前，像握鱼竿一样。</p>
   <div class="fc-live"><div class="fc-rod" id="fc-rod" aria-hidden="true"><i id="fc-rod-line"></i><em id="fc-rod-dot"></em></div><div class="fc-meters"><div class="fc-meter" id="fc-tension"><small>张力</small><div><i id="fc-tension-fill"></i></div></div><div class="fc-meter fc-stamina" id="fc-stamina"><small>鱼的体力</small><div><i id="fc-stamina-fill"></i></div></div><p class="fc-tip" id="fc-tip"></p></div></div>
   <div class="fc-pad hidden" id="fc-pad" role="application" aria-label="触控竿姿区：上下抬放，左右侧倾；准备后向上划抛投"><i class="fc-pad-x"></i><i class="fc-pad-y"></i><b id="fc-knob"></b><span id="fc-pad-label">上推抬竿 · 左右侧倾</span></div>
   <button id="fc-arm" class="fc-big">准备抛竿</button><button id="fc-hook" class="fc-big fc-hook hidden">抬竿！</button>
   <div class="fc-lobby" id="fc-lobby"><button id="fc-start" class="fc-primary">开始 →</button><button id="fc-again" class="fc-primary hidden">再来一局 →</button><button id="fc-leave">退出</button></div>
   <div class="fc-row" id="fc-row"><button id="fc-pause">暂停</button><button id="fc-zero">重新归零</button><button id="fc-abandon">放弃本竿</button></div>
   <details class="fc-more"><summary>震动设置</summary>${hapticsPanelHTML('fc')}</details>
  </div>`;
  document.getElementById('phone-main').append(root);this.root=root;this.$=id=>root.querySelector('#'+id);
  this.$('fc-join').onclick=()=>{if(this.online)conn.send({type:'fish_join',join:true});};this.$('fc-leave').onclick=()=>{if(this.online)conn.send({type:'fish_join',join:false});};
  this.$('fc-motion').onclick=()=>this.enableMotion();this.$('fc-touch-mode').onclick=()=>this.useTouch();this.$('fc-zero').onclick=()=>this.rezero();
  this.$('fc-arm').onclick=()=>this.send({type:'fish_arm'});this.$('fc-hook').onclick=()=>this.send({type:'fish_hook'});
  this.$('fc-start').onclick=()=>this.send({type:'fish_command',action:'start'});this.$('fc-again').onclick=()=>this.send({type:'fish_command',action:'rematch'});
  this.$('fc-pause').onclick=()=>this.send({type:'fish_command',action:this.state?.phase==='paused'?'resume':'pause'});
  this.$('fc-abandon').onclick=()=>{const t=this.now();if(t-this.confirmAbandon<2500){this.confirmAbandon=-Infinity;this.send({type:'fish_abandon'});this.$('fc-abandon').textContent='放弃本竿';}else{this.confirmAbandon=t;this.$('fc-abandon').textContent='再点一次确认';}};
  bindHapticsPanel(this.$,'fc',this.h);
  const pad=this.$('fc-pad');pad.addEventListener('pointerdown',e=>{if(this.mode!=='touch'||this.pointer!==undefined)return;e.preventDefault?.();this.pointer=e.pointerId;pad.setPointerCapture?.(e.pointerId);this.swipe={x:e.clientX,y:e.clientY,t:this.now()};this.padMove(e);});
  pad.addEventListener('pointermove',e=>{if(e.pointerId===this.pointer)this.padMove(e);});
  const up=e=>{if(e.pointerId!==this.pointer)return;this.pointer=undefined;this.padRelease(e);};for(const k of ['pointerup','pointercancel'])pad.addEventListener(k,up);
  window.addEventListener('deviceorientation',e=>{if(this.mode!=='motion'||!this.active||document.hidden)return;this.orientation(e.beta,e.gamma);});
  document.addEventListener('visibilitychange',()=>{if(!this.active)return;if(document.hidden){this.h.stop?.();this.sendReady(false);this.send({type:'fish_pause'});this.wake?.release?.();this.wake=null;}else{this.rezero();this.keepAwake();}});
  conn.addEventListener('message',({detail:m})=>this.message(m));conn.addEventListener('offline',()=>{this.online=false;this.ready=false;this.notice('连接中断，正在重新连接…');this.render();});
  setInterval(()=>this.tick(),33);
 }
 get joined(){return this.active&&this.sub.joined;}
 send(m){if(this.online&&this.joined)this.conn.send(m);}
 sendReady(ready){if(ready!==this.ready&&this.joined)this.h.play(ready?'ready':'nudge');this.ready=ready;if(this.online&&this.joined)this.conn.send({type:'fish_ready',ready,source:this.mode==='touch'?'touch':'motion'});this.render();}
 notice(t){this.$('fc-notice').textContent=t;}
 async keepAwake(){if(this.wake||document.hidden||!this.active)return;try{this.wake=await navigator.wakeLock?.request('screen');}catch{}}
 // 搏鱼中的持续手感：收线棘轮（每收回约 1 米）、张力“心跳”（0.85 以上，越紧越急）、线松提醒。
 fightFeel(f){
  if(!f){this.reelMark=null;return;}if(this.reelMark===null||f.D>this.reelMark)this.reelMark=f.D;else if(this.reelMark-f.D>=1){this.reelMark=f.D;this.h.play('reel');}
  if(f.S>.6||f.T<.15)this.h.play('slack');
 }
 strainFeel(){const T=this.state?.you?.fight?.T;if(!(T>.85))return;const t=this.now(),x=Math.min(1,(T-.85)/.15);if(t-this.strainAt<900-550*x)return;this.strainAt=t;this.h.play('strain',{strength:x});}
 message(m){
  if(m.type==='ready'){this.online=true;this.render();}
  if(m.type==='fish_subscription'){
   const was=this.joined,wasActive=this.active;this.active=m.active===true;this.sub=m;document.body.classList.toggle('fish-phone-active',this.active);this.root.classList.toggle('hidden',!this.active);
   if(this.active&&!wasActive){document.title='体感钓鱼 · 手机鱼竿';this.keepAwake();}if(!this.active&&wasActive){this.wake?.release?.();this.wake=null;this.cast.disarm();}
   if(this.joined&&!was){this.h.play('confirm');if(this.mode)this.rezero();}this.render();
  }
  if(m.type==='fish_personal'){this.state=m.state;for(const e of m.events||[])this.event(e);this.fightFeel(m.state?.you?.fight||null);this.syncCast();this.render();}
 }
 event(e){
  if(FEEL[e.kind])this.h.play(FEEL[e.kind]);
  if(e.kind==='landed')this.h.play(e.catch?.type==='big'?'trophy':'success');
  if(e.kind==='lost')this.h.play(e.reason==='abandon'||e.reason==='timeup'?'nudge':'fail');
  if(e.kind==='over'){const solo=(this.state?.players||1)<=1;this.h.play(solo?'success':this.state?.you?.rank===1?'win':'whistle');}
  if(e.kind==='armed')this.notice(this.mode==='touch'?'在竿姿区向上划，抛出去！':'先往后抬竿，再向前挥！');
  if(e.kind==='arm_timeout')this.notice('准备超时，再点一次「准备抛竿」。');
  if(e.kind==='cast')this.notice('抛出去了！');
  if(e.kind==='empty')this.notice(e.reason==='weeds'?'挂在水草里了，点「准备抛竿」收线重抛。':e.reason==='closed'?'这一轮还没开放这个钓区。':'附近没有鱼影，换个位置试试。');
  if(e.kind==='tip')this.notice(`试试：${PREFER_TIPS[e.type]||'换个节奏'}`);
  if(e.kind==='spook')this.notice('抬早了，鱼被吓退了。等浮漂明显下沉再抬。');
  if(e.kind==='miss')this.notice('没抬起来，鱼走了。它一会儿还会回来。');
  if(e.kind==='hook')this.notice('中鱼了！抬竿拉近，放竿收线。');
  if(e.kind==='telegraph')this.notice('它要冲了——放低一点！');
  if(e.kind==='weed_warn')this.notice('快进水草了！往反方向侧拉。');
  if(e.kind==='landed')this.notice(`上岸！${e.catch.name} +${e.catch.points} 分`);
  if(e.kind==='lost')this.notice(LOST[e.reason]||'鱼跑了。');
 }
 // 准备抛竿窗口：体感模式下开启本机识别。
 syncCast(){const armed=this.state?.you?.phase==='armed';if(armed&&!this.cast.armed&&this.mode==='motion')this.cast.arm();if(!armed&&this.cast.armed)this.cast.disarm();}
 rezero(){this.mapper.reset();this.pose={pitch:0,roll:0};this.cast.disarm();this.lastSensor=this.now();if(this.mode==='touch'){this.sendReady(!document.hidden);this.notice('拖动竿姿区：上推抬竿、下拉放竿、左右侧倾。');}else if(this.mode==='motion'){this.sendReady(false);this.notice('竖握手机、顶部朝前，静止约 0.6 秒归零…');}this.render();}
 useTouch(){this.mode='touch';this.rezero();this.keepAwake();}
 async enableMotion(){
  if(!window.isSecureContext){this.notice('体感鱼竿需要受信任的 HTTPS（按电脑“连接手机”的说明设置），也可以先用触控操作。');return;}
  if(!window.DeviceOrientationEvent){this.notice('这台手机不支持方向传感器，请用触控操作。');return;}
  try{const req=[window.DeviceOrientationEvent,window.DeviceMotionEvent].filter(Boolean).map(api=>typeof api.requestPermission==='function'?api.requestPermission():Promise.resolve('granted'));const ok=await Promise.all(req.map(p=>Promise.resolve(p).catch(()=>'denied')));if(!ok.some(v=>v==='granted')){this.notice('没有拿到传感器权限。可以在浏览器设置里允许，或者用触控操作。');return;}
   this.mode='motion';this.rezero();this.keepAwake();}catch{this.notice('无法启用体感，触控操作仍然可以完整游玩。');}
 }
 orientation(beta,gamma){
  const t=this.now(),angle=screen.orientation?.angle??window.orientation??0,r=this.mapper.sample(beta,gamma,t,Number(angle));if(!r)return;this.lastSensor=t;
  if(r.changed&&this.ready)this.sendReady(false);
  if(!r.ready){this.pose={pitch:0,roll:0};if(this.ready)this.sendReady(false);this.notice(`保持握姿静止，正在归零 ${Math.round(r.progress*100)}%`);this.render();return;}
  if(!this.ready){this.sendReady(true);this.notice('鱼竿就绪！左右倾瞄准，点「准备抛竿」。');}
  this.pose={pitch:r.pitch,roll:r.roll};this.raw=r.raw;
  const c=this.cast.sample(r.raw.pitch,r.raw.roll,t);if(c?.power!==undefined){this.send({type:'fish_cast',power:c.power,dir:c.dir,aimRoll:c.aimRoll??undefined,eventId:`${Date.now()}-${++this.castId}`});}else if(c?.reject){this.h.play('nudge');this.notice(REJECT_TEXT[c.reject]||'再挥一次');}
  this.drawRod();
 }
 padMove(e){const box=this.$('fc-pad').getBoundingClientRect(),nx=Math.max(-1,Math.min(1,(e.clientX-box.left-box.width/2)/(box.width*.42))),ny=Math.max(-1,Math.min(1,(e.clientY-box.top-box.height/2)/(box.height*.42)));this.pose={pitch:-ny*25,roll:nx*25};this.drawRod();}
 padRelease(e){
  const armed=this.state?.you?.phase==='armed',s=this.swipe;this.swipe=null;
  if(armed&&s){const box=this.$('fc-pad').getBoundingClientRect(),dy=(s.y-e.clientY)/box.height,dt=Math.max(80,this.now()-s.t),speed=dy/dt*1000;if(dy>.25&&dt<900){const power=Math.max(0,Math.min(1,.4*Math.min(1,(dy-.25)/.6)+.6*Math.min(1,Math.max(0,(speed-.6)/2.4))));this.send({type:'fish_cast',power,dir:Math.max(-8,Math.min(8,(e.clientX-s.x)/box.width*16)),aimRoll:this.pose.roll,eventId:`${Date.now()}-${++this.castId}`});}else{this.h.play('nudge');this.notice('向上划得更长、更快一点。');}}
  this.pose={pitch:0,roll:armed?this.pose.roll:0};this.drawRod();
 }
 drawRod(){const p=this.pose;this.$('fc-rod-line').style.transform=`rotate(${-p.pitch*2}deg)`;this.$('fc-rod-dot').style.transform=`translateX(${p.roll*2}px)`;if(this.mode==='touch')this.$('fc-knob').style.transform=`translate(${p.roll/25*42}%,${-p.pitch/25*42}%)`;}
 tick(){if(!this.joined||!this.online||document.hidden||!this.mode)return;if(this.mode==='motion'&&this.now()-this.lastSensor>600){if(this.ready)this.sendReady(false);this.notice('还没有收到传感器数据：保持页面在前台、检查权限，或者改用触控操作。');return;}if(this.ready)this.conn.send({type:'fish_pose',pitch:Math.round(this.pose.pitch*10)/10,roll:Math.round(this.pose.roll*10)/10,seq:++this.seq});this.strainFeel();}
 render(){
  const s=this.sub,st=this.state,you=st?.you,joined=this.joined,show=(id,on)=>this.$(id).classList.toggle('hidden',!on),color=s.slot!=null?VERSUS_PALETTE[s.slot]:null,phase=st?.phase||'lobby',inMatch=!!st&&!!you&&!['over'].includes(phase),over=phase==='over';
  show('fc-join-card',!joined);show('fc-main',joined);
  this.$('fc-join').disabled=!this.online||s.locked||s.full;this.$('fc-join-text').textContent=s.locked?`这一局正在进行（${s.count} 人），下一局再加入。`:s.full?'已经有 6 个人了，下一局再来。':`已有 ${s.count||0} / 6 人加入。点“加入钓鱼”，这台手机就是你的鱼竿。`;
  if(joined){const badge=this.$('fc-badge');badge.textContent=`${s.slot+1}P`;badge.style.background=color?.color||'';this.$('fc-name').textContent=`你是 ${s.slot+1}P · ${color?.name||''}`;this.$('fc-score').textContent=`${you?.score??0} 分${you?.rank?` · 第 ${you.rank} 名`:''}`;}
  this.$('fc-motion').classList.toggle('selected',this.mode==='motion');this.$('fc-touch-mode').classList.toggle('selected',this.mode==='touch');show('fc-pad',this.mode==='touch');this.$('fc-zero').disabled=this.mode!=='motion';
  const yp=you?.phase,active=inMatch&&['playing','finishing','resuming','countdown'].includes(phase);
  show('fc-arm',inMatch&&['aim','armed','lure','bite','landed','lost'].includes(yp)&&!(this.mode==='touch'&&yp==='bite'));
  this.$('fc-arm').textContent=yp==='armed'?(this.mode==='touch'?'向上划，抛出去！':'挥竿！（后引 → 前挥）'):['lure','bite'].includes(yp)?'收线重抛':'准备抛竿';this.$('fc-arm').classList.toggle('armed',yp==='armed');this.$('fc-arm').disabled=!this.ready||phase!=='playing';
  show('fc-hook',inMatch&&this.mode==='touch'&&['lure','bite'].includes(yp));this.$('fc-hook').classList.toggle('now',yp==='bite');
  show('fc-lobby',!inMatch);show('fc-start',!st);show('fc-again',over);this.$('fc-start').disabled=!this.ready||!s.allReady;this.$('fc-again').disabled=!this.ready;this.$('fc-start').textContent=(s.count||0)<=1?'开始练习 / 挑战 →':'开始 →';
  show('fc-row',inMatch);this.$('fc-pause').textContent=phase==='paused'?'继续':'暂停';this.$('fc-abandon').disabled=!['lure','bite','fight'].includes(yp);
  const f=you?.fight;show('fc-tension',!!f);show('fc-stamina',!!f);
  if(f){const tf=this.$('fc-tension-fill');tf.style.width=`${Math.round(f.T*100)}%`;tf.dataset.level=f.T>.9?'danger':f.T>.7?'warn':f.T<.12?'slack':f.T<.25?'low':'ok';this.$('fc-stamina-fill').style.width=`${Math.round(f.E*100)}%`;}
  this.$('fc-tip').textContent=f?(f.behavior==='telegraph'?'它要冲了，放低一点':f.T>.85?'太紧了！放低竿':f.S>.6||f.T<.15?'线松了：慢慢抬竿收紧':f.weed>.4?'往反方向侧拉，别进水草':f.E<.2&&f.D<3?'快上岸了，保持住':'抬竿拉近 · 放竿收线'):'';
  const state=!this.online?'正在恢复连接…':!joined?(s.locked?'观战中':'点“加入钓鱼”'):!this.mode?'选择操作方式':!this.ready?'鱼竿准备中':phase==='paused'?`已暂停 · ${PAUSE[st.pauseReason]||''}`:phase==='countdown'?`准备… ${Math.max(1,Math.ceil(st.countdown||1))}`:phase==='intermission'?'第一轮结束，马上第二轮':over?(you?.rank===1?'你赢了！':`第 ${you?.rank??'—'} 名`):!st?(s.allReady?'都准备好了，可以开始':'已就绪，等其他人'):({aim:'左右倾瞄准',armed:'挥竿！',flight:'飞出去了…',lure:'诱鱼中',bite:'咬钩了！抬竿！',fight:'搏鱼中',reel:'收线中',landed:'上岸！',lost:'鱼跑了',done:'这一轮结束了'})[yp]||'';
  this.$('fc-state').textContent=state;if(st&&phase==='paused'&&st.waiting?.length)this.$('fc-tip').textContent=`等待 ${st.waiting.map(n=>`${n+1}P`).join('、')} 重新就绪`;
  this.root.classList.toggle('bite',yp==='bite');this.root.classList.toggle('fighting',yp==='fight');
 }
}
