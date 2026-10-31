// 云端滚球 · 多人对战（0.24）：大厅（4 个位置、手机加入与就绪）→ 倒计时 → 分屏对战 → 名次结算。
// 电脑是裁判：物理与淘汰在这里算，状态每 0.25 秒经网关发给每台手机。手机只负责加入、选控制方式、发送倾斜 / 摇杆。
import {VersusGame,ENDLESS,VERSUS_COLORS,STAGES,stageBlend} from '../shared/maze/endless.js';
import {PHYSICS,vector} from '../shared/maze/physics.js';
import {VersusScene} from './versus-renderer.js';
export const ENDLESS_KEY='swinglink-skyroll-endless';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
const clock=s=>`${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`;
const RANK=['','冠军','第 2 名','第 3 名','第 4 名'];
const REASONS={manual:'按“继续”后倒数 2 秒再出发。',blur:'电脑窗口失去焦点，比赛已暂停。',hidden:'电脑页面离开前台，比赛已暂停。',controller_offline:'有手机断开了连接。',stream_gap:'有手机的手柄数据中断了，请保持手机页面在前台。',phone_hidden:'有手机离开了前台。',recenter:'有手机正在重新校准握姿。'};
export function loadEndless(storage){try{const r=JSON.parse(storage.getItem(ENDLESS_KEY));return r&&typeof r==='object'?r:{};}catch{return {};}}
// 纪录：最远距离（单人或对战都算）、对战场数。
export function recordEndless(records,game){const best=[...game.players].sort((a,b)=>b.best-a.best)[0],distance=Math.round(best?.best||0),old=records.best?.distance??0,newBest=distance>old;records.plays=(records.plays||0)+1;if(!game.solo)records.matches=(records.matches||0)+1;if(newBest)records.best={distance,name:best.name,date:new Date().toISOString().slice(0,10),players:game.players.length};return {newBest,distance,record:records.best};}

export class VersusRoom {
 constructor(root,conn,{sfx=null,toast=()=>{},pair=()=>{},onExit=()=>{},onWin=()=>{},onPhase=()=>{},onTempo=()=>{},storage=globalThis.localStorage}={}){
  this.root=root;this.conn=conn;this.sfx=sfx;this.toast=toast;this.pair=pair;this.onExit=onExit;this.onWin=onWin;this.onPhase=onPhase;this.onTempo=onTempo;this.tempo=1;this.storage=storage;this.records=loadEndless(storage);
  this.active=false;this.host=true;this.online=false;this.roster=[null,null,null,null];this.allReady=false;this.game=null;this.inputs=new Map();this.keys=new Set();this.round=0;this.lastState=0;this.lastUI=0;this.toastUntil=0;this.result=null;
  root.innerHTML=`<section class="vs-lobby" id="vs-lobby" aria-label="多人对战大厅">
   <div class="vs-hero"><div class="vs-hero-copy"><span class="toon-badge sky">SKYROLL · 多人对战</span><h1 class="toon-title">无尽云路</h1><p>最多 4 人，每人一台手机当手柄。身后的赛道会一格格塌下去，而且越塌越快；球会互相碰撞，可以把对手撞下去。<b>掉下去就出局，最后留在赛道上的人获胜。</b></p>
    <ul class="vs-rules"><li><i>⇣</i><span>身后赛道崩塌<small>开跑 3 秒后开始，停着不动一定会掉</small></span></li><li><i>✺</i><span>球会互相碰撞<small>撞人也会被弹开，小心别把自己撞下去</small></span></li><li><i>♛</i><span>最后留下的人获胜<small>一个人玩就比谁跑得远</small></span></li></ul></div>
    <div class="vs-record" id="vs-record"></div></div>
   <div class="vs-slots" id="vs-slots"></div>
   <div class="vs-actions"><button id="vs-start" class="btn btn-sky btn-big" disabled>开始对战 →</button><button id="vs-pair" class="btn btn-ghost">连接手机 ↗</button><button id="vs-keyboard" class="btn btn-ghost">＋ 键盘玩家</button><button id="vs-back" class="btn btn-ghost">← 返回地图</button></div>
   <p class="vs-note" id="vs-note">在手机上点「加入对战」，再选择倾斜控制或虚拟摇杆。所有人就绪后，电脑或任意一台手机都可以开始。</p>
  </section>
  <section class="vs-stage hidden" id="vs-stage" aria-label="多人对战赛场"><canvas id="vs-canvas" tabindex="0" aria-label="无尽云路分屏画面"></canvas><div class="vs-views" id="vs-views"></div>
   <div class="vs-top"><span class="vs-chip"><small>用时</small><b id="vs-time">00:00</b></span><span class="vs-chip"><small>存活</small><b id="vs-alive">0 / 0</b></span><span class="vs-chip" id="vs-speed-chip"><small>崩塌速度</small><b id="vs-speed">—</b></span><span class="vs-chip vs-stage-chip"><small>赛段</small><b id="vs-stage-name">晨光云海</b></span><button id="vs-pause" class="btn btn-sky btn-small">暂停</button></div>
   <div class="vs-toast roll-toast" id="vs-toast" role="status"></div><div class="vs-overlay maze-overlay" id="vs-overlay"></div></section>`;
  this.$=id=>root.querySelector('#'+id);
  this.$('vs-start').onclick=()=>this.start();this.$('vs-pair').onclick=()=>this.pair();this.$('vs-back').onclick=()=>this.onExit();
  this.$('vs-keyboard').onclick=()=>conn.send({type:'maze_versus_keyboard',join:!this.roster.some(s=>s?.kind==='keyboard')});
  this.$('vs-slots').onclick=e=>{const b=e.target.closest('[data-kick]');if(b)conn.send({type:'maze_versus_kick',slot:Number(b.dataset.kick)});};
  this.$('vs-pause').onclick=()=>this.togglePause();this.$('vs-overlay').onclick=e=>{const b=e.target.closest('[data-action]');if(b)this.act(b.dataset.action);};
  document.addEventListener('keydown',e=>{if(!this.active||!this.host||e.target.matches('input,select,textarea')||document.querySelector('dialog[open]'))return;const key=e.key.toLowerCase();if(this.game&&['arrowleft','arrowright','arrowup','arrowdown','w','a','s','d'].includes(key)){e.preventDefault();this.keys.add(key);}if((key==='p'||key==='escape')&&!e.repeat&&this.game){e.preventDefault();this.togglePause();}if(key==='enter'&&!e.repeat){if(!this.game&&this.canStart())this.start();else if(this.game?.phase==='over')this.act('rematch');}});
  document.addEventListener('keyup',e=>this.keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{this.keys.clear();if(this.active)this.pause('blur');});document.addEventListener('visibilitychange',()=>{if(document.hidden){this.keys.clear();if(this.active)this.pause('hidden');}});
  this.renderLobby();this.last=performance.now();
  const frame=now=>{const dt=Math.max(0,(now-this.last)/1000);this.last=now;if(this.active&&this.game&&this.scene){if(dt>.35&&this.game.phase==='playing')this.pause('blur');const events=this.game.advance(Math.min(dt,.1),this.inputMap(now));for(const e of events)this.onEvent(e);this.scene.draw(this.game,now/1000);this.sound();if(now-this.lastUI>100||events.length){this.renderHUD();this.lastUI=now;}if(now-this.lastState>250||events.some(e=>['go','over','fall','resume'].includes(e.kind))){this.sendState();this.lastState=now;}}requestAnimationFrame(frame);};requestAnimationFrame(frame);
 }
 get players(){return this.roster.filter(Boolean);}
 canStart(){return this.host&&this.players.length>0&&this.allReady&&(!this.game||this.game.phase==='over');}
 show(active){this.active=active;this.keys.clear();if(!active){if(this.game&&!['over'].includes(this.game.phase))this.pause('hidden');this.sfx?.stop();this.setTempo(1);}else{this.renderLobby();this.renderHUD();this.sendState();if(this.game)this.$('vs-canvas').focus({preventScroll:true});}}
 ensureScene(){if(!this.scene&&!this.graphicsError)try{this.scene=new VersusScene(this.$('vs-canvas'));}catch{this.graphicsError=true;}return !!this.scene;}
 // ---------- 流程 ----------
 start(){
  if(!this.canStart())return;if(!this.ensureScene()){this.toast('多人对战需要 WebGL：请启用浏览器硬件加速。');return;}
  const list=this.players.map(s=>({id:s.id,slot:s.slot,name:s.name,color:VERSUS_COLORS[s.slot].color,kind:s.kind}));this.round++;this.result=null;
  this.game=new VersusGame(list,{seed:(Date.now()^Math.floor(Math.random()*1e9))>>>0});this.kinds=new Map(list.map(p=>[p.id,p.kind]));this.inputs.clear();this.keys.clear();this.outShown=new Set();
  this.views();this.$('vs-lobby').classList.add('hidden');this.$('vs-stage').classList.remove('hidden');this.$('vs-canvas').focus({preventScroll:true});this.sfx?.play('countdown');this.setTempo(1);this.onPhase('play',STAGES[0].chapter);this.renderHUD();this.sendState();
 }
 lobby(){this.game=null;this.result=null;this.$('vs-stage').classList.add('hidden');this.$('vs-lobby').classList.remove('hidden');this.sfx?.stop();this.setTempo(1);this.onPhase('lobby',0);this.renderLobby();this.sendState();}
 // 配乐：大厅用地图曲，比赛中按赛段换章节曲（启程群岛 → 机关云港 → 极光高空），加时赛再加快。
 music(){return this.game?['sky-play',STAGES[this.game.stage]?.chapter??0]:['sky-map',0];}
 setTempo(rate){if(Math.abs(rate-this.tempo)<.004)return;this.tempo=rate;this.onTempo(rate);}
 pause(reason='manual'){if(!this.game||!['playing','countdown'].includes(this.game.phase))return;this.game.pause(reason);this.inputs.clear();this.renderHUD();this.sendState();}
 waiting(){if(!this.game)return [];return this.game.players.filter(p=>p.phase==='playing'&&this.kinds.get(p.id)==='phone').map(p=>this.roster.find(s=>s?.id===p.id)).filter(s=>!s||!s.connected||!s.ready);}
 resume(){if(this.game?.phase!=='paused')return;const wait=this.waiting();if(wait.length){this.flash(`等待 ${wait.map(s=>s?`${s.slot+1}P`:'手机').join('、')} 重新就绪（保持手机前台，完成归零或使用摇杆）。`,5000);this.renderHUD();return;}this.keys.clear();this.inputs.clear();this.game.resume();this.renderHUD();this.sendState();}
 togglePause(){if(!this.game)return;if(this.game.phase==='paused')this.resume();else this.pause('manual');}
 act(action){if(action==='resume')this.resume();if(action==='rematch'){if(this.allReady&&this.players.length){this.game=null;this.start();}else{this.lobby();this.flash('有人还没就绪，回到大厅等一下。',4000);}}if(action==='lobby')this.lobby();if(action==='map'){this.lobby();this.onExit();}}
 inputMap(now){const out=new Map();if(!this.game)return out;for(const p of this.game.players){if(this.kinds.get(p.id)==='keyboard'){out.set(p.id,vector(Number(this.keys.has('d')||this.keys.has('arrowright'))-Number(this.keys.has('a')||this.keys.has('arrowleft')),Number(this.keys.has('s')||this.keys.has('arrowdown'))-Number(this.keys.has('w')||this.keys.has('arrowup'))));continue;}const v=this.inputs.get(p.id);out.set(p.id,v&&now-v.at<550?v:{x:0,y:0});}return out;}
 onEvent(e){
  const g=this.game,name=id=>{const p=g.players.find(p=>p.id===id);return p?`${p.slot+1}P ${p.name}`:'';};
  if(['wall','bump','sweep','boost'].includes(e.kind))this.sfx?.play(e.kind,e.strength);
  if(e.kind==='clash')this.sfx?.play('wall',Math.min(1,e.strength*1.4));
  if(e.kind==='countdown')this.sfx?.play('countdown');
  if(e.kind==='go'){this.sfx?.play('start');this.flash(g.solo?'出发！跑得越远越好。':'出发！最后留在赛道上的人获胜。',2600);}
  if(e.kind==='collapse')this.flash('身后的赛道开始崩塌！',2600);
  if(e.kind==='fall'){this.sfx?.play('fall');const p=g.players.find(p=>p.id===e.id);if(!g.solo&&p)this.flash(`${name(e.id)} 掉下去了${p.rank?` · ${RANK[p.rank]}`:''}`,3000);}
  if(e.kind==='win'&&!g.solo){this.flash(`${name(e.id)} 获胜！`,3000);}
  if(e.kind==='stage'){const st=STAGES[e.index];this.sfx?.play('checkpoint');this.flash(e.index===STAGES.length-1?`加时赛 · ${st.name}：崩塌会越来越快！`:`第 ${e.index+1} 段 · ${st.name}`,3200);this.onPhase('play',st.chapter);}
  if(e.kind==='over'){this.setTempo(1);this.result=recordEndless(this.records,g);try{this.storage.setItem(ENDLESS_KEY,JSON.stringify(this.records));}catch{}this.onWin(this.result);this.renderLobby();}
  this.scene?.event(e,g);
 }
 sound(){const g=this.game,alive=g.players.filter(p=>p.phase==='playing');let fast=null,speed=0;for(const p of alive){const v=Math.hypot(p.ball.vx,p.ball.vz);if(v>speed){speed=v;fast=p;}}this.sfx?.roll(speed,fast?.surface||'normal',g.phase==='playing'&&!!fast);}
 flash(text,ms=3000){this.toastText=text;this.toastUntil=performance.now()+ms;this.renderHUD();}
 sendState(){
  if(!this.active||!this.host||!this.online)return;const g=this.game;
  if(!g){this.conn.send({type:'maze_versus_state',phase:'lobby',elapsed:0,speed:0,players:[],winner:null,round:this.round,record:this.records.best?.distance??null});return;}
  const s=g.summary();this.conn.send({type:'maze_versus_state',...s,countdown:g.phase==='countdown'?g.countdown:null,round:this.round,record:this.records.best?.distance??null});
 }
 // ---------- 画面 ----------
 renderLobby(){
  const slots=this.$('vs-slots');slots.innerHTML=this.roster.map((s,i)=>{const c=VERSUS_COLORS[i];if(!s)return `<div class="vs-slot empty" style="--pc:${c.color}"><span class="vs-slot-no">${i+1}P</span><b>空位</b><small>在手机上点「加入对战」</small></div>`;
   const status=s.kind==='keyboard'?'键盘 · WASD / 方向键':!s.connected?'已断开 · 等它重新连接':s.ready?`已就绪 · ${s.source==='tilt'?'倾斜控制':'虚拟摇杆'}`:'准备中 · 在手机上选控制方式';
   return `<div class="vs-slot ${s.ready&&s.connected?'ready':''} ${s.connected?'':'offline'}" style="--pc:${c.color}"><span class="vs-slot-no">${i+1}P</span><span class="vs-slot-ball" aria-hidden="true"></span><b>${esc(s.name)}</b><small>${s.kind==='phone'&&s.number?`手机 ${String(s.number).padStart(2,'0')} · `:''}${status}</small>${this.game&&this.game.phase!=='over'?'':`<button class="vs-kick" data-kick="${i}" aria-label="移出 ${i+1}P">×</button>`}</div>`;}).join('');
  const n=this.players.length,start=this.$('vs-start');start.disabled=!this.canStart();start.textContent=n<=1?'单人挑战 →':`开始对战（${n} 人）→`;
  this.$('vs-keyboard').textContent=this.roster.some(s=>s?.kind==='keyboard')?'－ 移除键盘玩家':'＋ 键盘玩家';this.$('vs-keyboard').disabled=!this.roster.some(s=>s?.kind==='keyboard')&&n>=ENDLESS.maxPlayers;
  this.$('vs-note').textContent=!this.host?'对战已在另一个电脑窗口打开。':!n?'在手机上点「加入对战」，再选择倾斜控制或虚拟摇杆。所有人就绪后，电脑或任意一台手机都可以开始。':this.allReady?'都准备好了！按“开始”或在手机上点“开始对战”。':'等所有手机选好控制方式（倾斜控制或虚拟摇杆）。';
  const r=this.records.best;this.$('vs-record').innerHTML=`<small>本机最远纪录</small><b>${r?`${r.distance} 米`:'—'}</b><span>${r?`${esc(r.name)} · ${r.date}`:'还没有纪录，跑一局试试'}</span><em>已玩 ${this.records.plays||0} 局</em>`;
 }
 views(){const n=this.game.players.length,box=this.$('vs-views');box.className=`vs-views n${n}`;box.innerHTML=this.game.players.map(p=>`<div class="vs-view" data-slot="${p.slot}" style="--pc:${p.color}"><div class="vs-tag"><b>${p.slot+1}P</b><span>${esc(p.name)}</span></div><div class="vs-meter"><b class="vs-dist">0 米</b><span class="vs-gap"><i></i><em>崩塌还没开始</em></span></div><div class="vs-state"></div></div>`).join('')+(n===3?'<div class="vs-view vs-overview"><div class="vs-tag"><b>全场</b><span>俯瞰</span></div></div>':'');}
 renderHUD(){
  const g=this.game;this.$('vs-pause').disabled=!g||['over'].includes(g?.phase);if(!g){this.$('vs-overlay').classList.remove('visible');return;}
  const alive=g.players.filter(p=>p.phase==='playing').length;this.$('vs-time').textContent=clock(g.elapsed);this.$('vs-alive').textContent=g.solo?(alive?'在跑':'出局'):`${alive} / ${g.players.length}`;this.$('vs-speed').textContent=g.collapsing?`${g.speed.toFixed(1)} 米/秒`:'即将开始';this.$('vs-speed-chip').classList.toggle('hot',g.speed>ENDLESS.collapse.max+.05);this.$('vs-pause').textContent=g.phase==='paused'?'继续 →':'暂停';
  // 赛段主题色：顶栏赛段名、赛场描边随进程过渡；加时赛里崩塌越快，配乐越快。
  const sb=stageBlend(g.progress||0),accent=this.mixColor(STAGES[sb.index].accent,STAGES[sb.next].accent,sb.blend);this.$('vs-stage').style.setProperty('--vs-theme',accent);this.$('vs-stage-name').textContent=STAGES[g.stage].name;
  this.setTempo(g.phase==='playing'&&g.stage===STAGES.length-1?1.03+Math.max(0,Math.min(.07,(g.speed-ENDLESS.collapse.max)*.04)):1);
  for(const el of this.root.querySelectorAll('.vs-view[data-slot]')){const p=g.players.find(p=>p.slot===Number(el.dataset.slot));if(!p)continue;const gap=p.s-g.front,danger=g.collapsing&&p.phase==='playing'&&gap<ENDLESS.warn+1;el.querySelector('.vs-dist').textContent=`${Math.round(p.best)} 米`;el.querySelector('.vs-gap em').textContent=p.phase!=='playing'?'—':g.collapsing?`崩塌在身后 ${Math.max(0,gap).toFixed(0)} 米`:'崩塌还没开始';el.querySelector('.vs-gap i').style.width=`${g.collapsing&&p.phase==='playing'?Math.max(0,Math.min(100,gap/30*100)):100}%`;el.classList.toggle('danger',danger);el.classList.toggle('out',p.phase!=='playing');el.classList.toggle('winner',g.winner===p&&g.phase!=='countdown');
   const st=el.querySelector('.vs-state'),text=g.winner===p&&!g.solo?'<b>胜利！</b>':p.phase==='falling'?'<b>掉下去了！</b>':p.phase==='out'?`<b>${g.solo?'出局':`出局 · ${RANK[p.rank]||''}`}</b><small>${g.solo?'':'正在观战领先的人'}</small>`:'';if(st.innerHTML!==text)st.innerHTML=text;}
  const hint=performance.now()<this.toastUntil;this.$('vs-toast').textContent=hint?this.toastText:'';this.$('vs-toast').classList.toggle('visible',hint);
  let html='';
  if(!this.host)html='<span class="maze-overlay-kicker">已在另一窗口打开</span><h2>请回到正在比赛的窗口</h2><button data-action="lobby" class="btn btn-ghost">回到大厅</button>';
  else if(g.phase==='countdown')html=`<span class="maze-overlay-kicker">${g.started?'握稳手机，马上继续':'握稳手机，准备出发'}</span><h2 class="roll-countdown">${Math.max(1,Math.ceil(g.countdown))}</h2><p>${g.started?'所有球的速度已清零':g.solo?'跑得越远越好 · 掉下去就结束':'掉下去就出局 · 最后留下的人获胜'}</p>`;
  else if(g.phase==='paused'){const wait=this.waiting();html=`<span class="maze-overlay-kicker">比赛暂停</span><h2>歇一下，马上回来。</h2><p>${REASONS[g.pauseReason]||REASONS.manual}${wait.length?`<br>等待 ${wait.map(s=>s?`${s.slot+1}P`:'手机').join('、')} 重新就绪。`:''}</p><button data-action="resume" class="btn btn-sky btn-big" ${wait.length?'disabled':''}>继续 →</button><div class="overlay-links"><button data-action="lobby" class="btn btn-ghost btn-small">结束本局，回到大厅</button></div>`;}
  else if(g.phase==='over'){const list=g.standings(),r=this.result;html=`<span class="maze-overlay-kicker">${g.solo?'单人挑战 · 无尽云路':`多人对战 · ${g.players.length} 人`}</span><h2>${g.solo?`跑了 ${Math.round(list[0].best)} 米！`:`${esc(`${g.winner.slot+1}P ${g.winner.name}`)} 获胜！`}</h2>${r?.newBest?'<span class="toon-badge gold">新纪录！</span>':''}<ol class="vs-results">${list.map(p=>`<li style="--pc:${p.color}" class="${p===g.winner?'win':''}"><b>${g.solo?'':RANK[p.rank]||''}</b><span>${p.slot+1}P ${esc(p.name)}</span><em>${Math.round(p.best)} 米</em><small>${p.fellAt!==null?`坚持 ${clock(p.fellAt)}`:'没有掉下去'}</small></li>`).join('')}</ol><p class="vs-record-line">本机最远纪录：${r?.record?`${r.record.distance} 米 · ${esc(r.record.name)}`:'—'}</p><button data-action="rematch" class="btn btn-sky btn-big">再来一局 →</button><div class="overlay-links"><button data-action="lobby" class="btn btn-ghost btn-small">回到大厅</button><button data-action="map" class="btn btn-ghost btn-small">返回地图</button></div>`;}
  const overlay=this.$('vs-overlay');if(this.overlayHTML!==html){overlay.innerHTML=html;this.overlayHTML=html;}overlay.classList.toggle('visible',!!html);overlay.classList.toggle('results',g.phase==='over');this.$('vs-stage').classList.toggle('overlay',!!html);
 }
 mixColor(a,b,t){const p=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)),x=p(a),y=p(b);return '#'+x.map((v,i)=>Math.round(v+(y[i]-v)*t).toString(16).padStart(2,'0')).join('');}
 message(m){
  if(m.type==='ready')this.online=true;
  if(m.type==='maze_host'){this.host=m.host;if(!m.host)this.pause('blur');this.renderLobby();this.renderHUD();}
  if(m.type==='maze_roster'){this.roster=Array.from({length:ENDLESS.maxPlayers},(_,i)=>m.slots?.[i]||null);this.allReady=!!m.allReady;this.renderLobby();this.renderHUD();}
  if(m.type==='maze_input'&&m.phoneId){this.inputs.set(m.phoneId,{x:m.x,y:m.y,at:performance.now()});}
  if(m.type==='maze_pause'&&this.game){const p=this.game.players.find(p=>p.id===m.phoneId);if(!m.phoneId||p?.phase==='playing')this.pause(m.reason);}
  if(m.type==='maze_command'){if(m.action==='start'&&!this.game)this.start();if(m.action==='rematch'&&this.game?.phase==='over')this.act('rematch');if(m.action==='rematch'&&!this.game)this.start();if(m.action==='pause')this.pause('manual');if(m.action==='resume')this.resume();if(m.action==='lobby'&&this.game?.phase==='over')this.lobby();}
 }
}
