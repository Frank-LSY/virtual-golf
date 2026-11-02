// 体感钓鱼 · 网关通道（本地权威）。比赛在这里按 60 Hz 固定步长模拟，电脑只负责画面，手机只负责动作：
//  · 电脑打开“体感钓鱼”后成为主屏；所有手机显示“加入钓鱼”。最多 6 个位置（含一个可选的键盘玩家）。
//  · 手机发送竿姿（约 30 Hz）、准备抛竿、抛投（力量与方向修正，带事件编号去重）、显式抬竿（触控）、收线、放弃本竿。
//  · 网关校验后交给 FishingMatch；每 50 毫秒把完整快照发给主屏，每 150 毫秒把“自己的状态”发给每台手机，事件立即转发。
//  · 正在比赛的手机断线、切后台、重新归零或超过 0.5 秒没有竿姿 → 全场暂停，不判逃鱼；所有人重新就绪后才能继续。
import {FISHING,VERSUS_PALETTE} from '../shared/fishing/rules.js';
import {FishingMatch} from '../shared/fishing/match.js';
const STALE_MS=500,HOST_MS=50,PHONE_MS=150;
const PHONE_EVENTS=new Set(['armed','arm_timeout','cast','splash','empty','fish_near','nibble','bite','miss','spook','tip','hook','telegraph','dash','weed_warn','landed','lost','reel','disarm']);
const COMMANDS=new Set(['start','rematch','pause','resume','lobby','end','skip']);
export class FishingChannel {
 constructor(clients,send,{now=()=>Date.now(),players=null,timers=globalThis,autoTick=true}={}){
  Object.assign(this,{clients,send,now,players,timers,autoTick});this.host=null;this.benched=new Set();this.slots=Array(FISHING.maxPlayers).fill(null);this.setup={mode:'match',roundSeconds:FISHING.match.roundSeconds};this.match=null;this.seed=null;this.timer=null;this.acc=0;this.lastHost=0;this.lastPhone=0;this.pending=[];this.round=0;
 }
 phones(){return [...this.clients].filter(c=>c.role==='phone');}
 socket(id){return this.phones().find(c=>c.clientId===id)||null;}
 active(){return !!this.host&&this.clients.has(this.host)&&this.host.fishView;}
 controls(ws){return this.active()&&ws.role==='phone';}
 slotOf(id){return this.slots.findIndex(s=>s?.id===id);}
 get phase(){return !this.match?'lobby':this.match.phase==='over'?'over':'match';}
 locked(){return this.phase==='match';}
 roster(){return this.slots.map((s,slot)=>{if(!s)return null;const color=VERSUS_PALETTE[slot].color;if(s.kind==='keyboard')return {slot,id:s.id,kind:'keyboard',name:'键盘玩家',number:null,connected:true,ready:true,source:'keyboard',color};const ws=this.socket(s.id),p=this.players?.profiles?.get(s.id);return {slot,id:s.id,kind:'phone',name:p?.name||'手机玩家',number:p?.number??null,connected:!!ws,ready:!!ws?.fishReady&&!ws?.fishStale,source:ws?.fishSource||null,color};});}
 allReady(){const list=this.roster().filter(Boolean);return list.length>0&&list.every(p=>p.connected&&p.ready);}
 sendHost(data){if(this.active())this.send(this.host,data);}
 publish(){
  const roster=this.roster(),count=roster.filter(Boolean).length,full=count>=FISHING.maxPlayers,allReady=this.allReady(),active=this.active();
  this.sendHost({type:'fish_roster',slots:roster,allReady,setup:this.setup,phase:this.phase,phones:this.phones().length});
  for(const p of this.phones()){const slot=this.slotOf(p.clientId);this.send(p,{type:'fish_subscription',active,joined:slot>=0,slot:slot>=0?slot:null,color:slot>=0?VERSUS_PALETTE[slot].color:null,count,full,locked:this.locked(),allReady,setup:this.setup,phase:this.phase});}
 }
 release(slot){const s=this.slots[slot];if(!s)return;this.slots[slot]=null;const ws=s.kind==='phone'&&this.socket(s.id);if(ws){ws.fishReady=false;ws.fishPoseAt=0;}}
 connected(ws){if(ws.role==='phone'){ws.fishReady=false;this.publish();}}
 disconnected(ws){
  if(ws===this.host){this.host=null;this.pause('host_offline');this.publish();}
  if(ws.role!=='phone')return;const slot=this.slotOf(ws.clientId);if(slot<0)return;
  if(this.locked()){if(this.inMatch(ws.clientId))this.pause('controller_offline',slot);}else this.release(slot);this.publish();
 }
 inMatch(id){return !!this.match?.angler(id)&&!this.benched.has(id);}
 pause(reason,slot=null){if(!this.match||!['countdown','playing','finishing','resuming'].includes(this.match.phase))return;if(this.match.phase==='resuming')this.match.phase=this.match.resumeTo||'playing';this.match.pause(reason);this.pauseSlot=slot;this.flush(true);}
 waiting(){if(!this.match)return [];return this.match.anglers.map(a=>({a,slot:this.slotOf(a.id),r:this.roster()[this.slotOf(a.id)]})).filter(x=>x.r&&x.r.kind==='phone'&&!this.benched.has(x.a.id)&&(!x.r.connected||!x.r.ready)).map(x=>x.slot);}
 // ---------- 比赛 ----------
 start(sameSeed=false){
  if(!this.active())throw Error('请先在电脑上打开体感钓鱼。');if(!this.allReady())throw Error('还有人没准备好。');
  this.benched.clear();const list=this.roster().filter(Boolean);if(!sameSeed||!this.seed)this.seed=(Math.floor(Math.random()*4294967296)^this.now())>>>0;
  this.match=new FishingMatch({players:list.map(p=>({id:p.id,slot:p.slot,name:p.name,color:p.color,source:p.source==='keyboard'?'keyboard':p.source==='touch'?'touch':'motion'})),mode:this.setup.mode,roundSeconds:this.setup.roundSeconds,seed:this.seed});
  this.round++;this.acc=0;this.lastTick=this.now();this.pauseSlot=null;for(const p of list){const ws=this.socket(p.id);if(ws)ws.fishPoseAt=this.now();}
  this.startTimer();this.publish();this.flush(true);
 }
 lobby(){this.match=null;this.stopTimer();for(const [i,s] of this.slots.entries())if(s?.kind==='phone'&&!this.socket(s.id))this.release(i);this.publish();this.sendHost({type:'fish_state',state:null});for(const p of this.phones())this.send(p,{type:'fish_personal',state:null});}
 resume(){
  if(this.match?.phase!=='paused')return;if(!this.active())throw Error('请先回到电脑上的体感钓鱼页面。');
  const wait=this.waiting();if(wait.length)throw Error(`等待 ${wait.map(s=>`${s+1}P`).join('、')} 重新就绪。`);
  const now=this.now();for(const a of this.match.anglers){const ws=this.socket(a.id);if(ws)ws.fishPoseAt=now;}this.lastTick=now;this.acc=0;this.match.resume();this.flush(true);
 }
 startTimer(){if(this.timer||!this.autoTick)return;this.timer=this.timers.setInterval(()=>this.tick(),1000/60);}
 stopTimer(){if(this.timer){this.timers.clearInterval(this.timer);this.timer=null;}}
 tick(now=this.now()){
  if(!this.match)return;const m=this.match,dt=Math.min(.1,Math.max(0,(now-(this.lastTick??now))/1000));this.lastTick=now;
  // 断流：正在比赛的手机超过 0.5 秒没有竿姿 → 暂停。
  if(['countdown','playing','finishing','resuming'].includes(m.phase))for(const a of m.anglers){const slot=this.slotOf(a.id),s=this.slots[slot];if(s?.kind!=='phone'||this.benched.has(a.id))continue;const ws=this.socket(a.id);if(ws?.fishReady&&!ws.fishStale&&now-(ws.fishPoseAt||0)>STALE_MS){ws.fishStale=true;this.publish();this.pause('stream_gap',slot);break;}}
  this.acc+=dt;const step=FISHING.step;let n=0;while(this.acc+1e-9>=step&&n<8){m.tick(step);this.acc-=step;n++;}if(n>=8)this.acc=0;
  if(m.phase==='countdown'&&m.round>1){const w=this.waiting();if(w.length){const r=this.roster()[w[0]];this.pause(r?.connected?'recenter':'controller_offline',w[0]);}}
  for(const e of m.events.splice(0))this.pending.push(e);
  if(this.pending.length||now-this.lastHost>=HOST_MS)this.flush(now-this.lastHost>=HOST_MS);
  if(m.phase==='over'&&this.timer){this.stopTimer();this.flush(true);this.publish();}
 }
 // 发送：主屏收完整快照 + 事件；每台手机收自己的状态与事件。
 flush(full=true){
  const m=this.match;if(!m)return;const events=this.pending.splice(0),now=this.now(),standings=m.standings(),snap=m.snapshot();
  if(full||events.length){this.lastHost=now;this.sendHost({type:'fish_state',state:{...snap,standings:standings.map(s=>({id:s.id,slot:s.slot,name:s.name,color:s.color,score:s.score,count:s.count,rank:s.rank,source:s.source,biggest:s.biggest,catches:m.phase==='over'?s.catches:undefined,losses:m.phase==='over'?s.losses.map(l=>l.reason):undefined})),matchId:this.round,pauseSlot:m.phase==='paused'?this.pauseSlot:null,waiting:m.phase==='paused'?this.waiting():[]},events});}
  const sendPhones=now-this.lastPhone>=PHONE_MS||events.length;if(!sendPhones)return;if(now-this.lastPhone>=PHONE_MS)this.lastPhone=now;
  for(const ws of this.phones()){
   const a=m.angler(ws.clientId),mine=a?events.filter(e=>e.id===a.id&&PHONE_EVENTS.has(e.kind)):[],global=events.filter(e=>!e.id&&['countdown','go','time_up','round','round_end','over','pause','resume','resumed'].includes(e.kind));
   const st=a?standings.find(s=>s.id===a.id):null,f=a?.fight;
   this.send(ws,{type:'fish_personal',state:{phase:m.phase,mode:m.mode,round:m.round,rounds:snap.rounds,timeLeft:snap.timeLeft,finishLeft:snap.finishLeft,countdown:snap.countdown,pauseReason:snap.pauseReason,waiting:m.phase==='paused'?this.waiting():[],players:m.anglers.length,lead:{n:standings.filter(s=>s.rank===1).length,score:standings[0]?.score??0},
    you:a?{slot:a.slot,phase:a.phase,armed:a.phase==='armed'?+a.armedLeft.toFixed(1):null,bite:a.phase==='bite'?+a.timer.toFixed(2):null,zone:a.zone,aim:+a.aim.toFixed(1),score:a.score,count:a.catches.length,rank:st?.rank??null,fight:f?{T:+f.T.toFixed(3),E:+f.E.toFixed(3),D:+f.D.toFixed(1),S:+f.S.toFixed(2),behavior:f.behavior,type:f.type,weed:+f.weed.toFixed(2)}:null,fish:a.fish?{type:a.fish.type,A:a.fish.A!==undefined?+a.fish.A.toFixed(2):1,rhythm:a.fish.rhythm||null}:null,last:a.lastCatch,lost:a.phase==='lost'?a.lostReason:null}:null},events:[...mine,...global]});
  }
 }
 // ---------- 消息 ----------
 handle(ws,m){
  if(!m.type?.startsWith?.('fish_'))return false;
  if(m.type==='fish_view'&&ws.role==='screen'){
   if(m.active===true){if(this.active()&&this.host!==ws){if(m.takeover!==true){this.send(ws,{type:'fish_host',host:false});return true;}const previous=this.host;previous.fishView=false;this.send(previous,{type:'fish_host',host:false});}this.host=ws;ws.fishView=true;this.send(ws,{type:'fish_host',host:true});this.flush(true);}
   else if(ws===this.host){ws.fishView=false;this.pause('tab');}
   this.publish();return true;
  }
  if(ws.role==='screen'){
   if(!this.active()||ws!==this.host)throw Error('请先在当前窗口打开体感钓鱼。');
   if(m.type==='fish_setup'){if(this.locked())throw Error('比赛进行中，结束后再调整。');this.setup={mode:m.mode==='practice'?'practice':'match',roundSeconds:FISHING.match.choices.includes(m.roundSeconds)?m.roundSeconds:this.setup.roundSeconds};this.publish();return true;}
   if(m.type==='fish_keyboard'){if(this.locked())throw Error('比赛进行中，结束后再调整人数。');const slot=this.slotOf('keyboard');if(m.join===true&&slot<0){const free=this.slots.indexOf(null);if(free<0)throw Error('人数已满（最多 6 人）。');this.slots[free]={id:'keyboard',kind:'keyboard'};}if(m.join!==true&&slot>=0)this.release(slot);this.publish();return true;}
   if(m.type==='fish_kick'){if(this.locked())throw Error('比赛进行中，不能移出钓手。');if(!Number.isInteger(m.slot)||m.slot<0||m.slot>=FISHING.maxPlayers)throw Error('位置无效。');this.release(m.slot);this.publish();return true;}
   if(m.type==='fish_command')return this.command(m.action,null);
   if(m.type==='fish_input'){const slot=this.slotOf('keyboard');if(slot<0||!this.match)return true;this.apply('keyboard',m,'keyboard');return true;}
  }
  if(ws.role==='phone'){
   const slot=this.slotOf(ws.clientId);
   if(m.type==='fish_join'){
    if(!this.active())throw Error('电脑还没有打开体感钓鱼。');
    if(m.join===false){if(slot<0)return true;if(this.locked()&&this.inMatch(ws.clientId))throw Error('比赛中不能退出，等这一局结束。');this.release(slot);this.publish();return true;}
    if(slot>=0){this.publish();return true;}if(this.locked())throw Error('本局进行中，下一局再加入。');
    const free=this.slots.indexOf(null);if(free<0)throw Error('人数已满（最多 6 人）。');this.slots[free]={id:ws.clientId,kind:'phone'};ws.fishReady=false;ws.fishPoseAt=0;this.publish();return true;
   }
   if(slot<0){if(['fish_pose','fish_pause','fish_ready'].includes(m.type))return true;throw Error('请先在手机上点“加入钓鱼”。');}
   if(m.type==='fish_ready'){ws.fishReady=m.ready===true;ws.fishStale=false;ws.fishSource=m.source==='touch'?'touch':'motion';if(ws.fishReady&&this.benched.delete(ws.clientId)){const a=this.match?.angler(ws.clientId);if(a&&a.phase==='done'&&this.match.phase==='playing')a.reset('aim');}ws.fishPoseAt=this.now();if(this.match)this.match.setSource(ws.clientId,ws.fishSource);if(!ws.fishReady&&this.inMatch(ws.clientId))this.pause('recenter',slot);this.publish();return true;}
   if(m.type==='fish_pause'){if(this.inMatch(ws.clientId))this.pause('phone_hidden',slot);return true;}
   if(m.type==='fish_command')return this.command(m.action,slot);
   if(!ws.fishReady)return true;
   this.apply(ws.clientId,m,ws.fishSource||'motion',ws);return true;
  }
  throw Error('无法识别钓鱼操作。');
 }
 // 输入校验：数值范围、序号、事件编号去重、频率。
 apply(id,m,source,ws=null){
  const holder=ws||(this.keyboardState||(this.keyboardState={}));
  const kind=m.type==='fish_input'?m.kind:m.type.slice(5);
  if(kind==='pose'){
   if(![m.pitch,m.roll].every(v=>Number.isFinite(v)&&Math.abs(v)<=90))throw Error('竿姿数据无效。');
   if(m.seq!==undefined){if(!Number.isSafeInteger(m.seq)||m.seq<0)throw Error('竿姿数据无效。');if(m.seq<=(holder.fishSeq??-1))return;holder.fishSeq=m.seq;}
   if(ws){ws.fishPoseAt=this.now();if(ws.fishStale){ws.fishStale=false;this.publish();}}
   this.match?.input(id,{type:'pose',pitch:m.pitch,roll:m.roll});return;
  }
  if(!this.match)return;
  if(kind==='cast'){if(!Number.isFinite(m.power)||m.power<0||m.power>1||(m.dir!==undefined&&(!Number.isFinite(m.dir)||Math.abs(m.dir)>30))||(m.aimRoll!==undefined&&(!Number.isFinite(m.aimRoll)||Math.abs(m.aimRoll)>90)))throw Error('抛投数据无效。');const eid=String(m.eventId??'');if(eid&&holder.fishCastIds?.includes(eid))return;holder.fishCastIds=[...(holder.fishCastIds||[]).slice(-9),eid];this.match.input(id,{type:'cast',power:m.power,dir:m.dir||0,aimRoll:m.aimRoll,source});return;}
  if(['arm','disarm','hook','reel','abandon'].includes(kind)){this.match.input(id,{type:kind});return;}
  throw Error('无法识别钓鱼操作。');
 }
 command(action,slot){
  if(!COMMANDS.has(action))throw Error('无法识别钓鱼操作。');
  if(action==='start'){if(this.locked())return true;this.start(false);return true;}
  if(action==='rematch'){if(this.locked())return true;this.start(true);return true;}
  if(action==='pause'){this.pause('manual',slot);return true;}
  if(action==='resume'){this.resume();return true;}
  // 0.28.1：有人的手机没电或走开了，电脑可以“不等 xP，继续”：这位钓手保留已得分数，本局先不参加；手机回来就绪后自动回到比赛。
  if(action==='skip'){if(slot!==null)throw Error('只能在电脑上决定不等谁。');if(this.match?.phase!=='paused')return true;for(const s of this.waiting()){const id=this.slots[s]?.id;if(!id)continue;this.benched.add(id);const a=this.match.angler(id);if(a&&a.phase!=='done')a.reset('done');}this.publish();this.resume();return true;}
  if(action==='lobby'||action==='end'){if(slot!==null&&this.locked()&&this.match.mode!=='practice')throw Error('比赛中只能在电脑上结束。');this.lobby();return true;}
  return true;
 }
}
