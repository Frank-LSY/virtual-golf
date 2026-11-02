import {RodMapper,CastDetector,REJECT_TEXT} from '../shared/fishing/input.js';
import {FISH,VERSUS_PALETTE,PREFER_TIPS,WATERS,waterAt,waterById,inWeeds,polar,castDistance,aimFromRoll,clamp} from '../shared/fishing/rules.js';
// 触控竿姿区：竿的范围、搏鱼时松手回到的位置、松手后放回的速度（°/秒）。
// 竿有“惯性”：抬起最快 60°/秒，放下最快 25°/秒（大约等于收线速度）；手指划得再快，竿也不会一甩就把线放松。
const TOUCH=Object.freeze({min:-3,max:25,fightRest:5,upRate:60,downRate:25,rollRate:80});
import {haptics,hapticsPanelHTML,bindHapticsPanel} from './haptics.js';
// 体感钓鱼 · 手机鱼竿。沿用现有连接与身份，不另开连接。
// 0.29 收线：中鱼后手机变成“转轮”：拇指在圈上转圈收线（越快收得越快），鱼要冲时停手让它跑（溜鱼），
// 鱼往一边钻就往反方向倾（体感：倾手机；触控：按住左右按钮）；圈外一圈是张力，红了就别转。
// 体感：竖握、顶部朝前，静止约 0.6 秒归零；抬放 / 左右倾以约 30 Hz 发给网关；“准备抛竿”后在手机上识别后引 + 前挥并发送一次抛投。
// 触控：拖动竿姿区（上下 = 抬放，左右 = 侧倾）；准备后在竿姿区向上划抛投；咬钩时点“抬竿！”。
// 震动（0.26 起用共用的 phone-web/haptics.js）：倒计时 / 开钓、准备、抛出、落水、试探、咬钩、刺中、冲刺预兆、冲刺、水草、
// 上岸（大鱼和宝箱更隆重）/ 逃鱼、时间到、名次各有节奏；搏鱼时每收回约 1 米有一下“棘轮”轻震，张力越紧“心跳”越急，线松了会轻点提醒。
// iPhone Safari 不支持网页震动，只有点按按钮时的轻触，其余靠画面和声音。
const LOST={break:'它冲的时候还在硬收，线断了。看到“要冲了”就停手。',unhook:'停手太久，线松了，鱼脱钩了。它不冲的时候要一直转。',weed:'鱼钻进障碍物缠住了。它往哪边钻，就往反方向倾。',runaway:'线放光了：冲完要赶紧收回来。',abandon:'剪线了，省下时间钓下一条。',timeup:'时间到，放回湖里。'};
const PAUSE={manual:'比赛暂停。',tab:'电脑离开了钓鱼页面。',host_offline:'电脑断开了。',controller_offline:'有手机断开了。',stream_gap:'有手机的数据中断了。',phone_hidden:'有手机离开了前台。',recenter:'有手机正在重新归零。'};
// 鱼竿事件 → 震动信号名（见 haptics.js）。没列出的事件不震。
const FEEL={armed:'armed',arm_timeout:'nudge',cast:'cast',splash:'splash',empty:'empty',nibble:'nibble',bite:'bite',spook:'spook',miss:'miss',hook:'hook',telegraph:'telegraph',dash:'dash',weed_warn:'weed',snag_warn:'weed',line_warn:'warn',tired:'confirm',disarm:'disarm',round:'count',countdown:'count',go:'go',time_up:'whistle',pause:'pause',resume:'count',resumed:'go'};
export class FishingController {
 constructor(conn,{now=()=>performance.now(),haptics:h=haptics}={}){
  this.conn=conn;this.now=now;this.h=h;this.reelMark=null;this.strainAt=-Infinity;this.active=false;this.online=false;this.sub={joined:false};this.state=null;this.mode=null;this.ready=false;this.mapper=new RodMapper();this.cast=new CastDetector();this.pose={pitch:0,roll:0};this.raw={pitch:0,roll:0};this.seq=0;this.lastSensor=0;this.castId=0;this.confirmAbandon=-Infinity;this.aimRoll=0;this.target=null;
  const root=document.createElement('section');root.id='fish-controller';root.className='hidden';
  root.innerHTML=`<div class="fc-head"><b id="fc-state">等待加入</b></div>
  <div class="fc-card fc-join" id="fc-join-card"><b id="fc-join-title">湖边钓鱼 · 最多 6 人</b><p id="fc-join-text">点“加入钓鱼”，这台手机就是你的鱼竿。</p><button id="fc-join" class="fc-primary">加入钓鱼</button></div>
  <div class="fc-main" id="fc-main">
   <div class="fc-who"><span class="fc-badge" id="fc-badge">1P</span><b id="fc-name">你是 1P</b><span class="fc-score" id="fc-score">0 分</span></div>
   <div class="fc-mode" id="fc-mode"><button id="fc-motion">启用鱼竿（体感）</button><button id="fc-touch-mode">触控操作</button></div>
   <p class="fc-notice" id="fc-notice">竖着握住手机，顶部朝前，像握鱼竿一样。</p>
   <div class="fc-live" id="fc-live"><div class="fc-rod" id="fc-rod" aria-hidden="true"><i id="fc-rod-line"></i><em id="fc-rod-dot"></em></div><div class="fc-meters"><div class="fc-meter" id="fc-tension"><small>张力</small><div><i id="fc-tension-fill"></i></div></div><div class="fc-meter fc-stamina" id="fc-stamina"><small>鱼的体力</small><div><i id="fc-stamina-fill"></i></div></div><p class="fc-tip" id="fc-tip"></p></div></div>
   <div class="fc-reel hidden" id="fc-reel">
    <div class="fc-catch"><b id="fc-catch-name">上钩了</b><span id="fc-catch-info"></span></div>
    <div class="fc-wheel" id="fc-wheel" role="application" aria-label="转轮：拇指在圈上转圈收线"><svg viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="88" class="fc-wheel-track"></circle><circle cx="100" cy="100" r="88" class="fc-wheel-tension" id="fc-wheel-tension"></circle></svg><i class="fc-wheel-knob" id="fc-wheel-knob"></i><div class="fc-wheel-say"><b id="fc-wheel-say">转！</b><small id="fc-wheel-sub">拇指在圈上转圈收线</small></div></div>
    <div class="fc-lean"><button id="fc-lean-left" aria-label="往左倾">◀</button><span id="fc-lean-hint">鱼往哪边钻，就往反方向倾</span><button id="fc-lean-right" aria-label="往右倾">▶</button></div>
    <div class="fc-meter fc-stamina2"><small>鱼的体力</small><div><i id="fc-stamina2"></i></div></div>
   </div>
   <div class="fc-pad hidden" id="fc-pad" role="application" aria-label="触控竿姿区：上下抬放，左右侧倾；准备后向上划抛投"><i class="fc-pad-x"></i><i class="fc-pad-y"></i><b id="fc-knob"></b><span id="fc-pad-label">上推抬竿 · 左右侧倾</span></div>
   <button id="fc-hook" class="fc-big fc-hook hidden">抬竿！</button><button id="fc-arm" class="fc-big">准备抛竿</button>
   <div class="fc-lobby" id="fc-lobby"><button id="fc-start" class="fc-primary">开始 →</button><button id="fc-again" class="fc-primary hidden">再来一局 →</button><button id="fc-leave">退出</button></div>
   <div class="fc-row" id="fc-row"><button id="fc-pause">暂停</button><button id="fc-zero">重新归零</button><button id="fc-abandon">放弃本竿</button></div>
   <details class="fc-more"><summary id="fc-more-title">震动设置</summary><div class="fc-switch-row" id="fc-switch-row"><button id="fc-switch">改用触控操作</button></div>${hapticsPanelHTML('fc')}</details>
  </div>`;
  document.getElementById('phone-main').append(root);this.root=root;this.$=id=>root.querySelector('#'+id);
  this.$('fc-join').onclick=()=>{if(this.online)conn.send({type:'fish_join',join:true});};this.$('fc-leave').onclick=()=>{if(this.online)conn.send({type:'fish_join',join:false});};
  this.$('fc-motion').onclick=()=>this.enableMotion();this.$('fc-touch-mode').onclick=()=>this.useTouch();this.$('fc-zero').onclick=()=>this.rezero();this.$('fc-switch').onclick=()=>this.mode==='touch'?this.enableMotion():this.useTouch();
  this.$('fc-arm').onclick=()=>this.send({type:'fish_arm'});this.$('fc-hook').onclick=()=>this.send({type:'fish_hook'});
  this.$('fc-start').onclick=()=>this.send({type:'fish_command',action:'start'});this.$('fc-again').onclick=()=>this.send({type:'fish_command',action:'rematch'});
  this.$('fc-pause').onclick=()=>this.send({type:'fish_command',action:this.state?.phase==='paused'?'resume':'pause'});
  this.$('fc-abandon').onclick=()=>{const t=this.now();if(t-this.confirmAbandon<2500){this.confirmAbandon=-Infinity;this.send({type:'fish_abandon'});this.$('fc-abandon').textContent='放弃本竿';}else{this.confirmAbandon=t;this.$('fc-abandon').textContent='再点一次确认';}};
  bindHapticsPanel(this.$,'fc',this.h);
  const pad=this.$('fc-pad');pad.addEventListener('pointerdown',e=>{if(this.mode!=='touch'||this.pointer!==undefined)return;e.preventDefault?.();this.pointer=e.pointerId;pad.setPointerCapture?.(e.pointerId);this.padDown(e);});
  pad.addEventListener('pointermove',e=>{if(e.pointerId===this.pointer)this.padMove(e);});
  const up=e=>{if(e.pointerId!==this.pointer)return;this.pointer=undefined;this.padRelease(e);};for(const k of ['pointerup','pointercancel'])pad.addEventListener(k,up);
  window.addEventListener('deviceorientation',e=>{if(this.mode!=='motion'||!this.active||document.hidden)return;this.orientation(e.beta,e.gamma);});
  document.addEventListener('visibilitychange',()=>{if(!this.active)return;if(document.hidden){this.h.stop?.();this.send({type:'fish_pause'});this.sendReady(false);this.wake?.release?.();this.wake=null;}else{this.rezero();this.keepAwake();}});
  conn.addEventListener('message',({detail:m})=>this.message(m));conn.addEventListener('offline',()=>{this.online=false;this.ready=false;this.notice('连接中断，正在重新连接…');this.render();});
  const wheel=this.$('fc-wheel');this.crankLog=[];this.crankTurns=0;this.crankTick=0;this.wheelA=0;this.wheelAngle=null;
  wheel.addEventListener('pointerdown',e=>{if(this.touchPhase!=='fight'||this.wheelPtr!==undefined)return;e.preventDefault?.();this.wheelPtr=e.pointerId;wheel.setPointerCapture?.(e.pointerId);this.wheelAngle=this.wheelAt(e);});
  wheel.addEventListener('pointermove',e=>{if(e.pointerId!==this.wheelPtr)return;const a=this.wheelAt(e);if(a===null||this.wheelAngle===null){this.wheelAngle=a;return;}let d=a-this.wheelAngle;if(d>Math.PI)d-=2*Math.PI;if(d<-Math.PI)d+=2*Math.PI;this.wheelAngle=a;if(Math.abs(d)<1.2)this.addCrank(d);});
  for(const k of ['pointerup','pointercancel'])wheel.addEventListener(k,e=>{if(e.pointerId===this.wheelPtr){this.wheelPtr=undefined;this.wheelAngle=null;}});
  const lean=(dir,on)=>{this.leanHold=on?dir:0;if(this.mode==='touch'&&this.touchPhase==='fight')this.target={pitch:0,roll:on?dir*22:0};this.render();};
  for(const [id,dir] of [['fc-lean-left',-1],['fc-lean-right',1]]){const b=this.$(id);b.addEventListener('pointerdown',e=>{e.preventDefault?.();lean(dir,true);});for(const k of ['pointerup','pointercancel','pointerleave'])b.addEventListener(k,()=>{if(this.leanHold===dir)lean(dir,false);});}
  setInterval(()=>this.tick(),33);
 }
 // ---------- 转轮收线（0.29） ----------
 // 手指在圈上的角度（离圆心太近不算，免得一点点移动就转很多）；每 1/4 圈轻震一下；最近 0.3 秒转了几圈 = 收线速度（圈/秒）。
 wheelAt(e){const b=this.$('fc-wheel').getBoundingClientRect(),x=e.clientX-(b.left+b.width/2),y=e.clientY-(b.top+b.height/2);return Math.hypot(x,y)<b.width*.12?null:Math.atan2(y,x);}
 addCrank(d){const turns=Math.abs(d)/(2*Math.PI);this.wheelA+=d;this.crankTurns+=turns;this.crankLog.push({t:this.now(),turns});const q=Math.floor(this.crankTurns*4);if(q!==this.crankTick){this.crankTick=q;this.h.play('reel');}this.$('fc-wheel-knob').style.transform=`rotate(${Math.round(this.wheelA*180/Math.PI)}deg)`;}
 crankRate(){const now=this.now();this.crankLog=this.crankLog.filter(x=>now-x.t<300);return this.crankLog.reduce((s,x)=>s+x.turns,0)/.3;}
 get joined(){return this.active&&this.sub.joined;}
 send(m){if(this.online&&this.joined)this.conn.send(m);}
 sendReady(ready){if(ready!==this.ready&&this.joined)this.h.play(ready?'ready':'nudge');this.ready=ready;if(this.online&&this.joined)this.conn.send({type:'fish_ready',ready,source:this.mode==='touch'?'touch':'motion'});this.render();}
 notice(t){this.$('fc-notice').textContent=t;}
 async keepAwake(){if(this.wake||document.hidden||!this.active)return;try{this.wake=await navigator.wakeLock?.request('screen');}catch{}}
 // 搏鱼中的持续手感：收线棘轮（每收回约 1 米）、张力“心跳”（0.85 以上，越紧越急）、线松提醒。
 fightFeel(f){
  if(!f)return;if(f.slack>1.5)this.h.play('slack');
 }
 strainFeel(){const T=this.state?.you?.fight?.T;if(!(T>.85))return;const t=this.now(),x=Math.min(1,(T-.85)/.15);if(t-this.strainAt<900-550*x)return;this.strainAt=t;this.h.play('strain',{strength:x});}
 message(m){
  if(m.type==='ready'){this.online=true;this.render();}
  if(m.type==='fish_subscription'){
   const was=this.joined,wasActive=this.active;this.active=m.active===true;this.sub=m;document.body.classList.toggle('fish-phone-active',this.active);this.root.classList.toggle('hidden',!this.active);
   if(this.active&&!wasActive){document.title='体感钓鱼 · 手机鱼竿';this.keepAwake();}if(!this.active&&wasActive){this.wake?.release?.();this.wake=null;this.cast.disarm();}
   if(this.joined&&!was){this.h.play('confirm');if(!this.mode)this.restoreMode();if(this.mode)this.rezero();}this.render();
  }
  if(m.type==='fish_personal'){const prevYp=this.state?.you?.phase;this.state=m.state;this.phaseChanged(prevYp,m.state?.you?.phase);
   // 自己在“等待重新就绪”名单里但本机已就绪（例如网络抖了一下）：再报一次就绪。
   const w=m.state?.waiting;if(m.state?.phase==='paused'&&this.ready&&this.joined&&w?.includes(this.sub.slot)&&this.now()-(this.readyNudge??-1e9)>1500){this.readyNudge=this.now();this.conn.send({type:'fish_ready',ready:true,source:this.mode==='touch'?'touch':'motion'});}for(const e of m.events||[])this.event(e);this.fightFeel(m.state?.you?.fight||null);this.syncCast();this.render();}
 }
 event(e){
  if(FEEL[e.kind])this.h.play(FEEL[e.kind]);
  if(e.kind==='landed')this.h.play(['big','golden','chest'].includes(e.catch?.type)?'trophy':'success');
  if(e.kind==='lost')this.h.play(e.reason==='abandon'||e.reason==='timeup'?'nudge':'fail');
  if(e.kind==='over'){const solo=(this.state?.players||1)<=1;this.h.play(solo?'success':this.state?.you?.rank===1?'win':'whistle');}
  if(e.kind==='armed')this.notice(this.mode==='touch'?'在竿姿区从下往上划：划得越长抛得越远。':'先往后抬竿，再向前挥！');
  if(e.kind==='arm_timeout')this.notice('准备超时，再点一次「准备抛竿」。');
  if(e.kind==='cast')this.notice('抛出去了！');
  if(e.kind==='empty')this.notice('抛进芦苇丛挂住了，点「准备抛竿」收线重抛。');
  if(e.kind==='tip')this.notice(`试试：${PREFER_TIPS[e.type]||'换个节奏'}`);
  if(e.kind==='spook')this.notice(e.early===false?'动作太大，把鱼吓跑了。诱鱼时轻一点、慢一点。':'抬早了，鱼被吓退了。等浮漂明显下沉再抬。');
  if(e.kind==='miss')this.notice('没抬起来，鱼走了。它一会儿还会回来。');
  if(e.kind==='hook')this.notice(`中鱼了！${e.name||'有东西'} 约 ${e.kg??'?'} kg${e.catchKind==='junk'?' · 是杂物，不值钱，可以剪线':e.catchKind==='treasure'?' · 宝箱！很沉，慢慢转':' · 转轮收线，它冲就停手'}`);
  if(e.kind==='telegraph')this.notice('它要冲了——准备停手！');if(e.kind==='dash')this.notice('停！让它跑一会儿，冲完再收。');if(e.kind==='tired')this.notice('鱼累了，快转！');if(e.kind==='line_warn')this.notice('线快放光了！冲完马上收。');if(e.kind==='snag_warn')this.notice(`它往${e.dir>0?'右':'左'}钻${e.name||''}了！${this.mode==='touch'?'按住':'手机'}往${e.dir>0?'左':'右'}倾。`);
    if(e.kind==='landed')this.notice(`上岸！${e.catch.name} ${e.catch.kg} kg +${e.catch.points} 分`);
  if(e.kind==='lost')this.notice(LOST[e.reason]||'鱼跑了。');
 }
  // 收线面板：上钩的是什么、离岸多远；转轮外圈 = 张力；中间告诉你现在该转还是该停；鱼往一边钻时提示往反方向倾。
 renderReel(f){
  const c=FISH[f.type]||{},junk=f.kind==='junk',treasure=f.kind==='treasure',rush=f.behavior==='dash',warn=f.behavior==='telegraph';
  this.$('fc-catch-name').textContent=`${c.name||'有东西'} · 约 ${f.kg} kg`;this.$('fc-catch-info').textContent=`离岸 ${Math.max(0,Math.round(f.D))} 米 · ${f.points} 分`;
  let say='转！',sub='拇指在圈上转圈收线',mood='go';
  if(rush){say='停！让它跑';sub=f.crank>.4?'松开转轮，线要断了！':'冲完再收';mood='stop';}
  else if(warn){say='要冲了…';sub='准备停手';mood='warn';}
  else if(f.slack>1.2){say='接着转！';sub='停太久线会松';mood='go';}
  else if(f.behavior==='tired'){say='累了，快转！';sub='一口气收上来';mood='go';}
  else if(treasure){say='宝箱！慢慢转';sub='很沉，但不挣扎';}
  else if(junk){say='杂物…';sub='不值钱，可以剪线';}
  this.$('fc-wheel-say').textContent=say;this.$('fc-wheel-sub').textContent=sub;this.$('fc-wheel').dataset.mood=mood;
  const ring=this.$('fc-wheel-tension'),T=clamp(f.T,0,1);ring.style.strokeDasharray=`${Math.round(553*T)} 553`;ring.dataset.level=T>=.85?'danger':T>=.6?'warn':'ok';
  const side=Math.abs(f.lat)>f.width*.45?Math.sign(f.lat):0;this.$('fc-lean-hint').textContent=side?`它往${side>0?'右':'左'}钻 → ${this.mode==='touch'?'按住':'手机'}往${side>0?'左':'右'}倾`:'鱼往哪边钻，就往反方向倾';
  this.$('fc-lean-hint').dataset.alert=side?'1':'';this.$('fc-lean-left').classList.toggle('hidden',this.mode!=='touch');this.$('fc-lean-right').classList.toggle('hidden',this.mode!=='touch');
  this.$('fc-lean-left').classList.toggle('now',side>0);this.$('fc-lean-right').classList.toggle('now',side<0);
  this.$('fc-stamina2').style.width=`${Math.round((f.E??1)*100)}%`;
 }
 // 准备抛竿窗口：体感模式下开启本机识别。
 syncCast(){const armed=this.state?.you?.phase==='armed';if(armed&&!this.cast.armed&&this.mode==='motion')this.cast.arm();if(!armed&&this.cast.armed)this.cast.disarm();}
 rezero(){this.mapper.reset();this.pose={pitch:0,roll:0};this.cast.disarm();this.lastSensor=this.now();if(this.mode==='touch'){this.sendReady(!document.hidden);this.notice('左右拖动瞄准，点「准备抛竿」后在竿姿区从下往上划。');}else if(this.mode==='motion'){this.sendReady(false);this.notice('竖握手机、顶部朝前，静止约 0.6 秒归零…');}this.render();}
 saveMode(m){try{globalThis.localStorage?.setItem('swinglink-fish-mode',m);}catch{}}
 restoreMode(){let m=null;try{m=globalThis.localStorage?.getItem('swinglink-fish-mode');}catch{}if(m==='touch')this.mode='touch';else if(m==='motion'&&globalThis.document?.body?.dataset?.motion==='granted')this.mode='motion';}
 useTouch(){this.saveMode('touch');this.mode='touch';this.rezero();this.keepAwake();}
 async enableMotion(){
  if(!window.isSecureContext){this.notice('体感鱼竿需要受信任的 HTTPS（按电脑“连接手机”的说明设置），也可以先用触控操作。');return;}
  if(!window.DeviceOrientationEvent){this.notice('这台手机不支持方向传感器，请用触控操作。');return;}
  try{const req=[window.DeviceOrientationEvent,window.DeviceMotionEvent].filter(Boolean).map(api=>typeof api.requestPermission==='function'?api.requestPermission():Promise.resolve('granted'));const ok=await Promise.all(req.map(p=>Promise.resolve(p).catch(()=>'denied')));if(!ok.some(v=>v==='granted')){this.notice('没有拿到传感器权限。可以在浏览器设置里允许，或者用触控操作。');return;}
   this.mode='motion';this.saveMode('motion');this.rezero();this.keepAwake();}catch{this.notice('无法启用体感，触控操作仍然可以完整游玩。');}
 }
 orientation(beta,gamma){
  const t=this.now(),angle=screen.orientation?.angle??window.orientation??0,r=this.mapper.sample(beta,gamma,t,Number(angle));if(!r)return;this.lastSensor=t;
  if(r.changed&&this.ready)this.sendReady(false);
  if(!r.ready){this.pose={pitch:0,roll:0};if(this.ready)this.sendReady(false);this.notice(`保持握姿静止，正在归零 ${Math.round(r.progress*100)}%`);this.render();return;}
  if(!this.ready){this.sendReady(true);this.notice('鱼竿就绪！左右倾瞄准，点「准备抛竿」。');}
  this.pose={pitch:r.pitch,roll:r.roll};this.raw=r.raw;
  const c=this.state?.phase==='playing'?this.cast.sample(r.raw.pitch,r.raw.roll,t):null;if(c?.power!==undefined){this.send({type:'fish_cast',power:c.power,dir:c.dir,aimRoll:c.aimRoll??undefined,eventId:`${Date.now()}-${++this.castId}`});}else if(c?.reject){this.h.play('nudge');this.notice(REJECT_TEXT[c.reject]||'再挥一次');}
  this.drawRod();
 }
 // ---------- 触控竿姿区（0.28.1 重做） ----------
 // 瞄准：左右拖动，松手后保持（以前一松手就回正，第一轮几乎抛不进开放的钓区）。
 // 抛竿：从这一划的最低点算起，划得越长越远（速度只占三成），拖动时显示“约 N 米 · 落在哪片水域”。
 // 诱鱼 / 搏鱼：按下的位置就是当前竿的位置（不会一按就跳），上推抬竿；松手后竿慢慢放回，放竿就是收线。
 // 竿的范围 -3°～25°（以前下半区是 -25°～0°，一往下拉就松线脱钩）。
 get touchPhase(){return this.state?.you?.phase||'aim';}
 padDown(e){const yp=this.touchPhase;this.swipe={x:e.clientX,y:e.clientY,t:this.now(),lowX:e.clientX,lowY:e.clientY,lowT:this.now(),p0:this.pose.pitch,r0:['aim','armed'].includes(yp)?this.aimRoll:(this.target?.roll??this.pose.roll)};this.swipe.p0=this.target?.pitch??this.pose.pitch;}
 padMove(e){
  const s=this.swipe;if(!s)return;const box=this.$('fc-pad').getBoundingClientRect(),yp=this.touchPhase,dx=(e.clientX-s.x)/(box.width*.42),dy=(e.clientY-s.y)/(box.height*.84);
  if(yp==='armed'){if(e.clientY>=s.lowY){s.lowY=e.clientY;s.lowX=e.clientX;s.lowT=this.now();}this.pose={pitch:clamp((s.lowY-e.clientY)/(box.height*.84)*25,0,25),roll:this.aimRoll};this.preview(e,box);}
  else if(['aim','landed','lost','done'].includes(yp)){this.aimRoll=clamp(s.r0+dx*25,-25,25);this.pose={pitch:0,roll:this.aimRoll};}
  else{this.target={pitch:clamp(s.p0-dy*28,TOUCH.min,TOUCH.max),roll:yp==='fight'?clamp(s.r0+dx*25,-25,25):0};return;}
  this.drawRod();
 }
 swipePower(e,box,s=this.swipe){if(!s)return null;const dy=(s.lowY-e.clientY)/box.height,dt=Math.max(60,this.now()-s.lowT),speed=dy/dt*1000;if(dy<.2||dt>900)return null;return clamp(.7*clamp((dy-.2)/.6,0,1)+.3*clamp((speed-.8)/2.5,0,1),0,1);}
 landing(power,dirDeg){const d=castDistance(power),a=aimFromRoll(this.aimRoll)+dirDeg,p=polar(d,a),weeds=inWeeds(p.x,p.z,-.2);return {d,weeds,water:waterAt(p.x,p.z)};}
 preview(e,box){const p=this.swipePower(e,box);if(p===null){this.$('fc-pad-label').textContent='往上划：划得越长抛得越远';return;}const {d,weeds,water}=this.landing(p,clamp((e.clientX-this.swipe.lowX)/box.width*16,-8,8));this.$('fc-pad-label').textContent=`松手抛出 · 约 ${Math.round(d)} 米 · ${weeds?'芦苇丛（会挂住）':water.name}`;}
 padRelease(e){
  const s=this.swipe,yp=this.touchPhase;this.swipe=null;const box=this.$('fc-pad').getBoundingClientRect();
  if(yp==='armed'&&s){const power=this.swipePower(e,box,s);if(power!==null)this.send({type:'fish_cast',power,dir:clamp((e.clientX-s.lowX)/box.width*16,-8,8),aimRoll:this.aimRoll,eventId:`${Date.now()}-${++this.castId}`});else{this.h.play('nudge');this.notice('从下往上划一下：划得越长抛得越远。');}this.pose={pitch:0,roll:this.aimRoll};}
  else if(['lure','bite','fight','reel'].includes(yp))this.target={pitch:yp==='fight'?TOUCH.fightRest:0,roll:0};
  this.render();this.drawRod();
 }
 // 阶段变化时竿姿归位：抛出后不再带着瞄准的侧倾去诱鱼和搏鱼；回到瞄准时恢复上次的瞄准。
 phaseChanged(prev,next){if(this.mode!=='touch'||prev===next)return;this.swipe=null;this.target=null;this.pose=['aim','armed','landed','lost','done',undefined].includes(next)?{pitch:0,roll:this.aimRoll}:{pitch:0,roll:0};this.drawRod();}
 drawRod(){const p=this.pose;this.$('fc-rod-line').style.transform=`rotate(${-p.pitch*2}deg)`;this.$('fc-rod-dot').style.transform=`translateX(${p.roll*2}px)`;
  if(this.mode==='touch'){const pad=this.$('fc-pad'),w=pad.clientWidth||300,h=pad.clientHeight||180,fight=['lure','bite','fight','reel'].includes(this.touchPhase),y=fight?-(p.pitch-11)/14:-p.pitch/25;this.$('fc-knob').style.transform=`translate(${Math.round(p.roll/25*w*.42)}px,${Math.round(clamp(y,-1,1)*h*.42)}px)`;}}
 tick(){if(this.target&&this.mode==='touch'){const p=this.pose,g=this.target,dt=.033,step=(a,b,up,down)=>b>a?Math.min(b,a+up*dt):Math.max(b,a-down*dt);this.pose={pitch:step(p.pitch,g.pitch,TOUCH.upRate,TOUCH.downRate),roll:step(p.roll,g.roll,TOUCH.rollRate,TOUCH.rollRate)};this.drawRod();}
  if(!this.joined||!this.online||document.hidden||!this.mode)return;if(this.mode==='motion'&&this.now()-this.lastSensor>600){if(this.ready)this.sendReady(false);this.notice('还没有收到传感器数据：保持页面在前台、检查权限，或者改用触控操作。');return;}if(this.ready)this.conn.send({type:'fish_pose',pitch:Math.round(this.pose.pitch*10)/10,roll:Math.round(this.pose.roll*10)/10,crank:Math.round(this.crankRate()*100)/100,seq:++this.seq});this.strainFeel();}
 render(){
  const s=this.sub,st=this.state,you=st?.you,joined=this.joined,show=(id,on)=>this.$(id).classList.toggle('hidden',!on),color=s.slot!=null?VERSUS_PALETTE[s.slot]:null,phase=st?.phase||'lobby',inMatch=!!st&&!!you&&!['over'].includes(phase),over=phase==='over';
  show('fc-join-card',!joined);show('fc-main',joined);
  this.$('fc-join').disabled=!this.online||s.locked||s.full;this.$('fc-join-text').textContent=s.locked?`这一局正在进行（${s.count} 人），下一局再加入。`:s.full?'已经有 6 个人了，下一局再来。':`已有 ${s.count||0} / 6 人加入。点“加入钓鱼”，这台手机就是你的鱼竿。`;
  if(joined){const badge=this.$('fc-badge');badge.textContent=`${s.slot+1}P`;badge.style.background=color?.color||'';this.$('fc-name').textContent=`你是 ${s.slot+1}P · ${color?.name||''}`;this.$('fc-score').textContent=`${you?.score??0} 分${you?.rank?` · 第 ${you.rank} 名`:''}`;}
  show('fc-mode',!inMatch||!this.mode);show('fc-switch-row',inMatch&&!!this.mode);this.$('fc-switch').textContent=this.mode==='touch'?'改用体感鱼竿':'改用触控操作';this.$('fc-more-title').textContent=inMatch&&this.mode?'操作方式与震动':'震动设置';this.$('fc-motion').classList.toggle('selected',this.mode==='motion');this.$('fc-touch-mode').classList.toggle('selected',this.mode==='touch');show('fc-pad',this.mode==='touch'&&you?.phase!=='fight');show('fc-zero',this.mode==='motion');
  const yp=you?.phase,active=inMatch&&['playing','finishing','resuming','countdown'].includes(phase);
  show('fc-arm',inMatch&&['aim','armed','lure','bite','landed','lost'].includes(yp)&&!(this.mode==='touch'&&yp==='bite'));
  this.$('fc-arm').textContent=yp==='armed'?(this.mode==='touch'?'向上划，抛出去！':'挥竿！（后引 → 前挥）'):['lure','bite'].includes(yp)?'收线重抛':'准备抛竿';this.$('fc-arm').classList.toggle('armed',yp==='armed');this.$('fc-arm').classList.toggle('fc-second',['lure','bite'].includes(yp));this.$('fc-arm').disabled=!this.ready||phase!=='playing';
  show('fc-hook',inMatch&&this.mode==='touch'&&['lure','bite'].includes(yp));this.$('fc-hook').classList.toggle('now',yp==='bite');
  show('fc-lobby',!inMatch);show('fc-start',!st);show('fc-again',over);this.$('fc-start').disabled=!this.ready||!s.allReady;this.$('fc-again').disabled=!this.ready;this.$('fc-start').textContent=(s.count||0)<=1?'开始练习 / 挑战 →':'开始 →';
  show('fc-row',inMatch);this.$('fc-pause').textContent=phase==='paused'?'继续':'暂停';this.$('fc-abandon').disabled=!['lure','bite','fight'].includes(yp);
  const f=yp==='fight'?you?.fight:null;show('fc-tension',false);show('fc-stamina',false);show('fc-live',!f);show('fc-reel',!!f);if(f)this.renderReel(f);
  if(this.now()-this.confirmAbandon>2500)this.$('fc-abandon').textContent=yp==='fight'?'剪线':'放弃本竿';
  this.$('fc-tip').textContent='';
  const state=!this.online?'正在恢复连接…':!joined?(s.locked?'观战中':'点“加入钓鱼”'):!this.mode?'选择操作方式':!this.ready?'鱼竿准备中':phase==='paused'?`已暂停 · ${PAUSE[st.pauseReason]||''}`:phase==='countdown'?`准备… ${Math.max(1,Math.ceil(st.countdown||1))}`:phase==='intermission'?'第一轮结束，马上第二轮':phase==='resuming'?'马上继续…':over?((st.players||1)<=1?'挑战结束':!(st.lead?.score>0)?'本局结束 · 都没钓到':you?.rank===1?(st.lead?.n>1?'并列第一！':'你赢了！'):`第 ${you?.rank??'—'} 名`):!st?(s.allReady?'都准备好了，可以开始':'已就绪，等其他人'):({aim:this.mode==='touch'?'左右拖动瞄准':'左右倾瞄准',armed:this.mode==='touch'?'往上划，抛出去！':'挥竿！',flight:'飞出去了…',lure:`诱鱼中${you?.zone?` · ${waterById(you.zone)?.name||''}`:''}`,bite:'咬钩了！抬竿！',fight:'收线中',reel:'收线中',landed:'上岸！',lost:'鱼跑了',done:'这一轮结束了'})[yp]||'';
  this.$('fc-state').textContent=state;if(st&&phase==='paused'&&st.waiting?.length)this.$('fc-tip').textContent=`等待 ${st.waiting.map(n=>`${n+1}P`).join('、')} 重新就绪`;
  if(!(this.swipe&&yp==='armed'))this.$('fc-pad-label').textContent=({armed:'从下往上划：划得越长抛得越远',lure:'轻轻上下拖动诱鱼',bite:'点下面的「抬竿！」',fight:'慢慢上推拉近 · 松手收线 · 左右侧拉',reel:'收线中…'})[yp]||'左右拖动瞄准（松手保持）';
  this.root.classList.toggle('pad-low',['lure','bite','fight','reel'].includes(yp));this.root.classList.toggle('bite',yp==='bite');this.root.classList.toggle('fighting',yp==='fight');
 }
}
