// 体感钓鱼 · 电脑端：大厅（6 个位置、练习 / 比赛、每轮时长）→ 倒计时 → 1–6 分屏 → 结算。
// 比赛由网关本地权威模拟，这里只负责画面、声音和电脑上的键盘玩家；电脑不自行决定得分。
import {FISHING,ZONES,FISH,VERSUS_PALETTE,zoneById} from '../shared/fishing/rules.js';
import {LOST_TEXT} from '../shared/fishing/angler.js';
import {FishingScene} from './fishing-renderer.js';
export const FISH_RECORDS_KEY='swinglink-fishing-records';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
const clock=s=>s==null?'—':`${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`;
const SOURCE={motion:'体感',touch:'触控',keyboard:'键盘'};
const PAUSE={manual:'比赛暂停。',tab:'电脑离开了钓鱼页面。',host_offline:'主屏断开了。',controller_offline:'有手机断开了连接。',stream_gap:'有手机的鱼竿数据中断了，请保持手机页面在前台。',phone_hidden:'有手机离开了前台。',recenter:'有手机正在重新归零。',blur:'电脑窗口失去焦点。'};
const ADVICE={break:'鱼冲刺时放低一点，别一直高抬硬拉',unhook:'放竿慢一点，边放边收，别让线松太久',weed:'鲈鱼往水草冲时，往反方向侧拉',abandon:'',timeup:'临近结束时，选近岸小鱼更稳'};
export function loadFishRecords(storage){try{const r=JSON.parse(storage.getItem(FISH_RECORDS_KEY));return r&&typeof r==='object'?r:{};}catch{return {};}}
export function recordFishing(records,state){const top=state.standings[0];records.plays=(records.plays||0)+1;let newBest=false,newFish=false;if(state.mode==='match'&&top&&top.score>(records.best?.score||0)){records.best={score:top.score,name:top.name,date:new Date().toISOString().slice(0,10),players:state.standings.length};newBest=true;}for(const s of state.standings){const b=s.biggest;if(b&&(!records.fish||b.points>records.fish.points||b.points===records.fish.points&&b.size>records.fish.size)){records.fish={name:b.name,size:b.size,points:b.points,by:s.name};newFish=true;}}return {newBest,newFish};}

export class FishingRoom {
 constructor(root,conn,{sfx=null,toast=()=>{},pair=()=>{},onPhase=()=>{},onWin=()=>{},storage=globalThis.localStorage}={}){
  Object.assign(this,{root,conn,sfx,toast,pair,onPhase,onWin,storage});this.records=loadFishRecords(storage);this.active=false;this.host=true;this.online=false;this.roster=Array(6).fill(null);this.allReady=false;this.setup={mode:'match',roundSeconds:90};this.state=null;this.keys=new Set();this.kb={pitch:0,roll:0,charge:null};this.notes=new Map();this.lastHUD=0;this.lastPose=0;this.lastPhase=null;this.recorded=null;
  root.innerHTML=`<section class="fs-lobby" id="fs-lobby" aria-label="体感钓鱼大厅">
   <div class="fs-hero"><div class="fs-hero-copy"><span class="toon-badge fish">FISHING · 手机就是鱼竿</span><h1 class="toon-title">湖畔钓鱼</h1><p>竖着握住手机，像握鱼竿一样：左右倾瞄准，<b>后引再前挥</b>把浮漂抛进钓区；浮漂明显下沉时<b>抬竿刺鱼</b>；之后<b>抬竿拉近、放竿收线</b>，鱼冲刺时放低一点。最多 6 人同时钓，各自一块分屏。</p>
    <ul class="fs-zones">${ZONES.map(z=>`<li style="--zc:${z.color}"><b>${z.name}</b><span>${FISH[z.fish].name} · ${FISH[z.fish].points} 分</span><small>${z.id==='shallow'?'近岸 6–12 米，最好上手':z.id==='reeds'?'12–20 米，两侧有水草':'22–30 米，第二轮开放'}</small></li>`).join('')}</ul></div>
    <div class="fs-record" id="fs-record"></div></div>
   <div class="fs-setup"><div class="fs-seg" id="fs-mode"><button data-mode="match">比赛 · 两轮</button><button data-mode="practice">练习 · 不限时</button></div><label class="fs-len" id="fs-len-wrap">每轮<select id="fs-len">${FISHING.match.choices.map(s=>`<option value="${s}">${s} 秒</option>`).join('')}</select></label><span class="fs-setup-note" id="fs-setup-note"></span></div>
   <div class="fs-slots" id="fs-slots"></div>
   <div class="fs-actions"><button id="fs-start" class="btn btn-sky btn-big" disabled>开始 →</button><button id="fs-pair" class="btn btn-ghost">连接手机 ↗</button><button id="fs-keyboard" class="btn btn-ghost">＋ 键盘玩家</button></div>
   <p class="fs-note" id="fs-note"></p>
  </section>
  <section class="fs-stage hidden" id="fs-stage" aria-label="钓鱼分屏"><canvas id="fs-canvas" tabindex="0" aria-label="湖面分屏画面"></canvas><div class="fs-views" id="fs-views"></div>
   <div class="fs-top"><span class="fs-chip" id="fs-round-chip"><small id="fs-round">第 1 轮</small><b id="fs-time">01:30</b></span><button id="fs-pause" class="btn btn-sky btn-small">暂停</button><button id="fs-end" class="btn btn-ghost btn-small">结束</button></div>
   <div class="roll-toast fs-toast" id="fs-toast" role="status"></div><div class="maze-overlay fs-overlay" id="fs-overlay"></div></section>`;
  this.$=id=>root.querySelector('#'+id);
  this.$('fs-mode').onclick=e=>{const b=e.target.closest('[data-mode]');if(b)this.sendSetup({mode:b.dataset.mode});};this.$('fs-len').onchange=()=>this.sendSetup({roundSeconds:Number(this.$('fs-len').value)});
  this.$('fs-start').onclick=()=>this.command('start');this.$('fs-pair').onclick=()=>this.pair();this.$('fs-keyboard').onclick=()=>conn.send({type:'fish_keyboard',join:!this.roster.some(s=>s?.kind==='keyboard')});
  this.$('fs-slots').onclick=e=>{const b=e.target.closest('[data-kick]');if(b)conn.send({type:'fish_kick',slot:Number(b.dataset.kick)});};
  this.$('fs-pause').onclick=()=>this.command(this.state?.phase==='paused'?'resume':'pause');this.$('fs-end').onclick=()=>{const t=performance.now();if(this.state?.mode==='practice'||t-(this.endAt||0)<2500){this.endAt=0;this.command('lobby');}else{this.endAt=t;this.$('fs-end').textContent='再点一次结束';}};
  this.$('fs-overlay').onclick=e=>{const b=e.target.closest('[data-action]');if(b)this.command(b.dataset.action);};
  document.addEventListener('keydown',e=>this.key(e,true));document.addEventListener('keyup',e=>this.key(e,false));
  window.addEventListener('blur',()=>{this.keys.clear();if(this.active&&this.inMatch())this.command('pause');});
  conn.addEventListener('message',({detail:m})=>this.message(m));
  this.renderLobby();this.last=performance.now();
  const frame=now=>{if(this.active&&this.state&&this.scene){this.scene.draw(this.state,now/1000);this.keyboard(now);if(now-this.lastHUD>100){this.renderHUD();this.lastHUD=now;}}requestAnimationFrame(frame);};requestAnimationFrame(frame);
 }
 inMatch(){return !!this.state&&['countdown','playing','finishing','resuming','intermission'].includes(this.state.phase);}
 command(action){this.conn.send({type:'fish_command',action});}
 sendSetup(patch){this.conn.send({type:'fish_setup',...this.setup,...patch});}
 show(active){this.active=active;this.keys.clear();this.conn.send({type:'fish_view',active});if(active){this.renderLobby();this.renderStage();}}
 ensureScene(){if(!this.scene&&!this.graphicsError)try{this.scene=new FishingScene(this.$('fs-canvas'));}catch{this.graphicsError=true;}return !!this.scene;}
 // 配乐：大厅、练习和结算用《湖畔船歌》，比赛中用《湖畔对决》。
 music(){return this.state&&this.state.mode==='match'&&this.state.phase!=='over'?'fish-play':'fish-lobby';}
 // ---------- 键盘玩家（电脑上测试或凑人数）----------
 key(e,down){
  if(!this.active||e.target.matches?.('input,select,textarea')||document.querySelector('dialog[open]'))return;const k=e.key.toLowerCase(),kb=this.roster.some(s=>s?.kind==='keyboard');
  if(down&&(k==='p'||k==='escape')&&!e.repeat&&this.state){e.preventDefault();this.command(this.state.phase==='paused'?'resume':'pause');return;}
  if(!kb||!this.state)return;if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' ','r','backspace'].includes(k))e.preventDefault();
  const me=this.state.anglers.find(a=>a.id==='keyboard');if(!me)return;
  if(down){if(e.repeat)return;this.keys.add(k);
   if(k===' '){if(me.phase==='aim')this.input({kind:'arm'});else if(me.phase==='armed')this.kb.charge=performance.now();else if(['lure','bite'].includes(me.phase))this.input({kind:'hook'});}
   if(k==='r')this.input({kind:me.phase==='aim'?'arm':'reel'});if(k==='backspace')this.input({kind:'abandon'});}
  else{this.keys.delete(k);if(k===' '&&this.kb.charge!==null){const power=Math.min(1,(performance.now()-this.kb.charge)/1200);this.kb.charge=null;this.input({kind:'cast',power,dir:0,aimRoll:this.kb.roll,eventId:`kb-${Date.now()}`});}}
 }
 keyboard(now){
  if(!this.roster.some(s=>s?.kind==='keyboard')||!this.inMatch())return;const dt=Math.min(.1,(now-(this.kbAt||now))/1000);this.kbAt=now;const has=k=>this.keys.has(k);
  const up=has('w')||has('arrowup'),down=has('s')||has('arrowdown'),left=has('a')||has('arrowleft'),right=has('d')||has('arrowright');
  const me=this.state.anglers.find(a=>a.id==='keyboard'),aiming=['aim','armed'].includes(me?.phase);
  const pt=up?22:down?-14:0,rt=right?22:left?-22:0,rate=(target,cur,speed)=>cur+Math.sign(target-cur)*Math.min(Math.abs(target-cur),speed*dt);this.kb.pitch=rate(pt,this.kb.pitch,up||down?28:24);
  // 瞄准时 A / D 调整并保持方向；搏鱼时是侧拉，松开回正。
  this.kb.roll=aiming?Math.max(-25,Math.min(25,this.kb.roll+(Number(right)-Number(left))*20*dt)):rate(rt,this.kb.roll,40);
  if(now-this.lastPose>33){this.lastPose=now;this.input({kind:'pose',pitch:Math.round(this.kb.pitch*10)/10,roll:Math.round(this.kb.roll*10)/10});}
 }
 input(m){this.conn.send({type:'fish_input',...m});}
 // ---------- 消息 ----------
 message(m){
  if(m.type==='ready'){this.online=true;if(this.active)this.conn.send({type:'fish_view',active:true});}
  if(m.type==='fish_host'){this.host=m.host;this.renderLobby();this.renderStage();}
  if(m.type==='fish_roster'){this.roster=Array.from({length:6},(_,i)=>m.slots?.[i]||null);this.allReady=!!m.allReady;this.setup=m.setup||this.setup;this.renderLobby();}
  if(m.type==='fish_state'){
   const was=this.state;this.state=m.state;if(!m.state){this.renderStage();this.onPhase('lobby');return;}
   if(!was||was.matchId!==m.state.matchId){this.ensureScene();this.scene?.reset();this.notes.clear();this.recorded=null;this.views();this.onPhase('play');}
   for(const e of m.events||[])this.event(e);
   if(m.state.phase==='over'&&this.recorded!==m.state.matchId){this.recorded=m.state.matchId;this.result=recordFishing(this.records,m.state);try{this.storage.setItem(FISH_RECORDS_KEY,JSON.stringify(this.records));}catch{}this.onWin(this.result);this.onPhase('lobby');}
   if(this.lastPhase!==m.state.phase){this.lastPhase=m.state.phase;this.renderStage();}
  }
 }
 note(id,text,kind='info',ms=2600){this.notes.set(id,{text,kind,until:performance.now()+ms});}
 event(e){
  const sfx=this.sfx,name=id=>{const a=this.state?.anglers.find(a=>a.id===id);return a?`${a.slot+1}P ${a.name}`:'';};
  if(['cast','splash','nibble','bite','hook','dash','telegraph','landed','countdown','go'].includes(e.kind))sfx?.play(e.kind);
  if(e.kind==='lost')sfx?.play('lost',e.reason==='break'?1:.3);if(e.kind==='weed_warn')sfx?.play('weed');if(e.kind==='time_up')sfx?.play('timeup');
  if(e.kind==='empty')this.note(e.id,e.reason==='weeds'?'挂在水草里了 · 收线重抛':e.reason==='closed'?'这一轮还没开放':'附近没有鱼影，换个位置试试','warn',3200);
  if(e.kind==='tip')this.note(e.id,`试试：${({small:'慢慢抬、慢慢放（缓拖）',perch:'短促地轻抽',big:'缓拖一下再停住'})[e.type]}`,'info',3400);
  if(e.kind==='spook')this.note(e.id,'抬早了，鱼被吓退了','warn');if(e.kind==='miss')this.note(e.id,'没抬起来，鱼走了','warn');
  if(e.kind==='hook')this.note(e.id,'中鱼了！','good',1500);if(e.kind==='telegraph')this.note(e.id,'它要冲了——放低一点！','warn',1400);if(e.kind==='weed_warn')this.note(e.id,'快进水草了！反方向侧拉','warn',1600);
  if(e.kind==='landed'){this.note(e.id,`+${e.catch.points} · ${e.catch.name} ${e.catch.size} 厘米`,'catch',2400);if(e.catch.points>=400)this.flash(`${name(e.id)} 钓到一条 ${e.catch.name}！`);}
  if(e.kind==='lost')this.note(e.id,LOST_TEXT[e.reason]||'鱼跑了','bad',2400);
  if(e.kind==='go')this.flash(this.state?.mode==='practice'?'开钓！不限时，慢慢练。':`第 ${e.round} 轮开始！`);if(e.kind==='time_up')this.flash(e.finishing?.length?'时间到！已经中鱼的人还有 10 秒收尾':'时间到！');
  if(e.kind==='round')this.flash('第 2 轮：深水开放了！');
  this.scene?.event(e,this.state);
 }
 flash(text,ms=2800){this.toastText=text;this.toastUntil=performance.now()+ms;}
 // ---------- 大厅 ----------
 renderLobby(){
  const s=this.setup,n=this.roster.filter(Boolean).length;this.root.querySelectorAll('#fs-mode [data-mode]').forEach(b=>b.classList.toggle('selected',b.dataset.mode===s.mode));this.$('fs-len').value=String(s.roundSeconds);this.$('fs-len-wrap').classList.toggle('hidden',s.mode==='practice');
  this.$('fs-setup-note').textContent=s.mode==='practice'?'不计时、所有钓区开放、咬钩窗口更长，适合第一次玩。':`两轮，每轮 ${s.roundSeconds} 秒，所有人同时钓；第一轮浅湾 + 芦苇口，第二轮深水也开放。总分 = 上岸鱼的分值之和。`;
  this.$('fs-slots').innerHTML=this.roster.map((r,i)=>{const c=VERSUS_PALETTE[i];if(!r)return `<div class="fs-slot empty" style="--pc:${c.color}"><span class="fs-no">${i+1}P</span><b>空位</b><small>在手机上点「加入钓鱼」</small></div>`;const status=r.kind==='keyboard'?'键盘 · WASD + 空格':!r.connected?'已断开':r.ready?`已就绪 · ${SOURCE[r.source]||'体感'}`:'准备中 · 选择体感或触控';return `<div class="fs-slot ${r.ready&&r.connected?'ready':''} ${r.connected?'':'offline'}" style="--pc:${c.color}"><span class="fs-no">${i+1}P</span><span class="fs-rod" aria-hidden="true"></span><b>${esc(r.name)}</b><small>${r.number?`手机 ${String(r.number).padStart(2,'0')} · `:''}${status}</small>${this.inMatch()?'':`<button class="fs-kick" data-kick="${i}" aria-label="移出 ${i+1}P">×</button>`}</div>`;}).join('');
  const start=this.$('fs-start');start.disabled=!this.host||!n||!this.allReady||this.inMatch();start.textContent=s.mode==='practice'?`开始练习${n?`（${n} 人）`:''} →`:n<=1?'单人挑战 →':`开始比赛（${n} 人）→`;
  const kb=this.roster.some(r=>r?.kind==='keyboard');this.$('fs-keyboard').textContent=kb?'－ 移除键盘玩家':'＋ 键盘玩家';this.$('fs-keyboard').disabled=!kb&&n>=6;
  this.$('fs-note').textContent=!this.host?'钓鱼已在另一个电脑窗口打开。':!n?'每台手机点「加入钓鱼」，选“启用鱼竿（体感）”或“触控操作”。所有人就绪后，电脑或任意一台手机都可以开始。':this.allReady?'都准备好了！按“开始”或在手机上点“开始”。':'等所有手机准备好鱼竿。';
  const r=this.records;this.$('fs-record').innerHTML=`<small>本机纪录</small><b>${r.best?`${r.best.score} 分`:'—'}</b><span>${r.best?`${esc(r.best.name)} · ${r.best.date}`:'比赛最高分'}</span><em>${r.fish?`最大鱼：${esc(r.fish.name)} ${r.fish.size} 厘米 · ${esc(r.fish.by)}`:'还没有鱼获纪录'}</em><em>已玩 ${r.plays||0} 场</em>`;
 }
 renderStage(){const live=!!this.state;this.$('fs-lobby').classList.toggle('hidden',live);this.$('fs-stage').classList.toggle('hidden',!live);if(live){this.ensureScene();if(!this.$('fs-views').children.length)this.views();this.renderHUD();}else this.renderLobby();}
 views(){const n=this.state?.anglers.length||0,box=this.$('fs-views');box.className=`fs-views n${n}`;box.innerHTML=(this.state?.anglers||[]).map(a=>`<div class="fv" data-id="${esc(a.id)}" style="--pc:${a.color}"><div class="fv-tag"><b>${a.slot+1}P</b><span>${esc(a.name)}</span><em class="fv-score">0</em></div><div class="fv-src"></div><div class="fv-meters"><div class="fv-meter fv-t"><small>张力</small><div><i></i></div></div><div class="fv-meter fv-e"><small>鱼的体力</small><div><i></i></div></div><span class="fv-d"></span></div><div class="fv-hint"></div><div class="fv-note"></div></div>`).join('')+(n===3||n===5?'<div class="fv fv-board"><div class="fv-tag"><b>榜</b><span>实时排行</span></div><ol class="fv-rank"></ol></div>':'');}
 hint(a,keyboard){
  const touch=a.source==='touch',z=a.zone&&zoneById(a.zone),f=a.fight;
  switch(a.phase){
   case 'aim':return keyboard?'A / D 瞄准 · 空格准备抛竿':'左右倾瞄准 · 点手机「准备抛竿」';
   case 'armed':return keyboard?'按住空格蓄力，松开抛出':touch?'在手机上向上划，抛出去！':'挥竿！后引 → 前挥';
   case 'flight':return '';case 'reel':return '收线中…';
   case 'lure':return z?(a.fish?(a.fish.A>.55?'有动静了…等浮漂明显下沉':`诱鱼中 · ${z.name}`):`等鱼过来 · ${z.name}`):'附近没有鱼影 · 收线重抛换个位置';
   case 'bite':return keyboard?'咬钩了！按空格抬竿！':touch?'咬钩了！点「抬竿！」':'咬钩了！抬竿！';
   case 'fight':return !f?'':f.behavior==='telegraph'?'它要冲了，放低一点':f.T>.85?'太紧了！放低竿':f.S>.6||f.T<.15?'线松了：慢慢抬竿收紧':f.weed>.4?'往反方向侧拉，别进水草':f.E<.2&&f.D<3?'快上岸了，稳住':keyboard?'W 抬竿拉近 · 松开收线':'抬竿拉近 · 放竿收线';
   case 'done':return '这一轮结束了';default:return '';
  }
 }
 renderHUD(){
  const st=this.state;if(!st)return;const kbId='keyboard',now=performance.now();
  this.$('fs-round').textContent=st.mode==='practice'?'练习 · 不限时':st.phase==='intermission'?'第 1 轮结束':`第 ${st.round} / ${st.rounds} 轮`;this.$('fs-time').textContent=st.mode==='practice'?'∞':st.phase==='finishing'?`收尾 ${Math.ceil(st.finishLeft||0)}`:clock(st.timeLeft);this.$('fs-round-chip').classList.toggle('hot',st.phase==='finishing'||st.timeLeft!=null&&st.timeLeft<=10&&st.phase==='playing');
  this.$('fs-pause').textContent=st.phase==='paused'?'继续 →':'暂停';this.$('fs-pause').disabled=st.phase==='over';if(now-(this.endAt||0)>2500)this.$('fs-end').textContent=st.mode==='practice'?'结束练习':'结束';
  for(const el of this.root.querySelectorAll('.fv[data-id]')){const a=st.anglers.find(a=>a.id===el.dataset.id);if(!a)continue;const s=st.standings.find(s=>s.id===a.id),f=a.fight;
   el.querySelector('.fv-score').textContent=`${a.score} 分`;el.querySelector('.fv-src').textContent=a.source!=='motion'?SOURCE[a.source]:'';
   el.classList.toggle('fighting',a.phase==='fight');el.classList.toggle('biting',a.phase==='bite');el.classList.toggle('lead',!!s&&s.rank===1&&a.score>0&&st.anglers.length>1);
   el.querySelector('.fv-meters').classList.toggle('hidden',!f);if(f){const ti=el.querySelector('.fv-t i');ti.style.width=`${Math.round(f.T*100)}%`;ti.dataset.level=f.T>.9?'danger':f.T>.7?'warn':f.T<.12?'slack':f.T<.25?'low':'ok';el.querySelector('.fv-e i').style.width=`${Math.round(f.E*100)}%`;el.querySelector('.fv-d').textContent=`${f.D.toFixed(1)} 米`;}
   const hint=this.hint(a,a.id===kbId),h=el.querySelector('.fv-hint');if(h.textContent!==hint)h.textContent=hint;h.dataset.phase=a.phase;
   const n=this.notes.get(a.id),note=el.querySelector('.fv-note'),show=n&&n.until>now;note.textContent=show?n.text:'';note.dataset.kind=show?n.kind:'';note.classList.toggle('visible',!!show);}
  const board=this.root.querySelector('.fv-rank');if(board)board.innerHTML=st.standings.map(s=>`<li style="--pc:${s.color}"><b>${s.rank}</b><span>${s.slot+1}P ${esc(s.name)}</span><em>${s.score}</em></li>`).join('');
  const hintOn=now<(this.toastUntil||0);this.$('fs-toast').textContent=hintOn?this.toastText:'';this.$('fs-toast').classList.toggle('visible',hintOn);
  let html='';
  if(!this.host)html='<span class="maze-overlay-kicker">已在另一窗口打开</span><h2>请回到正在钓鱼的窗口</h2>';
  else if(st.phase==='countdown')html=`<span class="maze-overlay-kicker">${st.mode==='practice'?'练习':`第 ${st.round} 轮`} · 握好鱼竿</span><h2 class="roll-countdown">${Math.max(1,Math.ceil(st.countdown||1))}</h2><p>${st.round===2?'深水开放了：大鱼 400 分，但更耗时间':'左右倾瞄准，点手机「准备抛竿」，后引再前挥'}</p>`;
  else if(st.phase==='resuming')html=`<span class="maze-overlay-kicker">马上继续</span><h2 class="roll-countdown">${Math.max(1,Math.ceil(st.countdown||1))}</h2>`;
  else if(st.phase==='paused')html=`<span class="maze-overlay-kicker">暂停</span><h2>歇一下，鱼不会跑。</h2><p>${PAUSE[st.pauseReason]||PAUSE.manual}${st.waiting?.length?`<br>等待 ${st.waiting.map(s=>`${s+1}P`).join('、')} 重新就绪。`:''}</p><button data-action="resume" class="btn btn-sky btn-big" ${st.waiting?.length?'disabled':''}>继续 →</button><div class="overlay-links"><button data-action="lobby" class="btn btn-ghost btn-small">结束，回到大厅</button></div>`;
  else if(st.phase==='intermission')html=`<span class="maze-overlay-kicker">第 1 轮结束</span><h2>第 2 轮马上开始</h2>${this.table(st,false)}<p>第 2 轮深水开放：大鱼 400 分。</p>`;
  else if(st.phase==='over')html=this.results(st);
  const o=this.$('fs-overlay');if(this.overlayHTML!==html){o.innerHTML=html;this.overlayHTML=html;}o.classList.toggle('visible',!!html);o.classList.toggle('results',st.phase==='over'||st.phase==='intermission');this.$('fs-stage').classList.toggle('overlay',!!html);
 }
 table(st,full){return `<ol class="fs-results">${st.standings.map(s=>`<li style="--pc:${s.color}"><b>${st.mode==='practice'?'':`第 ${s.rank} 名`}</b><span>${s.slot+1}P ${esc(s.name)}${s.source&&s.source!=='motion'?`<i>${SOURCE[s.source]}</i>`:''}</span><em>${s.score} 分</em><small>${s.count} 条${full&&s.biggest?` · 最大 ${esc(s.biggest.name)} ${s.biggest.size} 厘米`:''}</small>${full?`<p>${(s.catches||[]).map(c=>`<span class="fs-fish ${c.type}">${esc(c.name)} +${c.points}</span>`).join('')||'没有鱼获'}${this.advice(s)}</p>`:''}</li>`).join('')}</ol>`;}
 advice(s){const counts={};for(const r of s.losses||[])counts[r]=(counts[r]||0)+1;const top=Object.entries(counts).filter(([r])=>ADVICE[r]).sort((a,b)=>b[1]-a[1])[0];return top?`<em class="fs-advice">${({break:'断线',unhook:'脱钩',weed:'挂草',timeup:'超时'})[top[0]]} ${top[1]} 次：${ADVICE[top[0]]}</em>`:'';}
 results(st){const top=st.standings[0],mixed=new Set(st.standings.map(s=>s.source)).size>1,r=this.result||{};return `<span class="maze-overlay-kicker">${st.mode==='practice'?'练习结束':`比赛结束 · ${st.standings.length} 人`}${mixed?' · 混合操作':''}</span><h2>${st.mode==='practice'?'今天的鱼获':st.standings.length>1?`${esc(`${top.slot+1}P ${top.name}`)} 获胜！`:`${top.score} 分！`}</h2>${r.newBest?'<span class="toon-badge gold">新纪录！</span>':''}${this.table(st,true)}<button data-action="rematch" class="btn btn-sky btn-big">同一赛题再战 →</button><div class="overlay-links"><button data-action="start" class="btn btn-ghost btn-small">换一个赛题</button><button data-action="lobby" class="btn btn-ghost btn-small">回到大厅</button></div>`;}
}
