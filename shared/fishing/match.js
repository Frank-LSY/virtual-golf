// 体感钓鱼 · 一场比赛（最多 6 人同时钓，各自独立的鱼池，同一份赛题）。
// 练习：不限时、全部钓区开放、刺鱼窗口更长、冲刺预兆更久。
// 比赛：两轮，每轮所有人同时开钓；第一轮开放浅湾与芦苇口，第二轮开放全部钓区；到时已刺中的鱼最多收尾 10 秒。
// 总分 = 两轮所有上岸鱼的固定分值之和；同分比鱼获数，仍相同则并列。
import {FISHING,ZONES,VERSUS_PALETTE,RULES_VERSION,scenario as makeScenario,zonesOpen} from './rules.js';
import {Angler} from './angler.js';

export class FishingMatch {
 constructor({players=[],mode='match',roundSeconds=FISHING.match.roundSeconds,seed=1}={}){
  this.mode=mode==='practice'?'practice':'match';this.practice=this.mode==='practice';this.roundSeconds=FISHING.match.choices.includes(roundSeconds)?roundSeconds:FISHING.match.roundSeconds;
  this.seed=seed>>>0;this.scenario=makeScenario(this.seed);this.version=RULES_VERSION;this.clock=0;this.events=[];
  this.anglers=players.slice(0,FISHING.maxPlayers).map((p,i)=>new Angler({id:p.id,slot:p.slot??i,name:p.name||`${(p.slot??i)+1}P`,color:p.color||VERSUS_PALETTE[(p.slot??i)%6].color,scenario:this.scenario,practice:this.practice,source:p.source||'motion'}));
  this.round=1;this.phase='countdown';this.countdown=FISHING.match.countdown;this.timeLeft=this.practice?Infinity:this.roundSeconds;this.finishLeft=0;this.resumePhase=null;this.lastCount=Math.ceil(this.countdown);this.rounds=[];
 }
 angler(id){return this.anglers.find(a=>a.id===id)||null;}
 get open(){return zonesOpen(this.round,this.practice);}
 get active(){return ['playing','finishing'].includes(this.phase);}
 emit(kind,extra={}){this.events.push({kind,t:this.clock,...extra});}
 // ---------- 输入（来自网关，已校验）----------
 input(id,command){
  const a=this.angler(id);if(!a)return false;
  if(command.type==='pose'){a.setPose(command.pitch,command.roll);return true;}
  if(!this.active)return false;
  if(this.phase==='finishing'&&['arm','cast'].includes(command.type))return false;
  if(command.type==='arm')return a.arm();
  if(command.type==='disarm'){a.disarm();return true;}
  if(command.type==='cast')return a.cast({power:command.power,dir:command.dir,source:command.source,aimRoll:command.aimRoll});
  if(command.type==='hook'){a.hook();return true;}
  if(command.type==='reel'){a.reel();return true;}
  if(command.type==='abandon'){a.abandon();return true;}
  return false;
 }
 setSource(id,source){const a=this.angler(id);if(a)a.source=source;}
 pause(reason='manual'){if(['playing','finishing','countdown'].includes(this.phase)){this.resumePhase={phase:this.phase,countdown:this.countdown};this.phase='paused';this.pauseReason=reason;this.emit('pause',{reason});}}
 // 继续：先倒数 1.5 秒；动作缓存清空，不会用暂停前的姿势自动拉鱼或刺鱼。
 resume(){if(this.phase!=='paused')return;const back=this.resumePhase||{phase:'playing'};for(const a of this.anglers)a.clearHistory();this.emit('resume');
  if(back.phase==='countdown'){this.phase='countdown';this.countdown=back.countdown;return;}
  this.phase='resuming';this.countdown=FISHING.match.resume;this.resumeTo=back.phase;}
 tick(dt){
  if(['paused','over'].includes(this.phase))return this.events;
  this.clock+=dt;
  if(this.phase==='countdown'){this.countdown-=dt;const n=Math.ceil(this.countdown);if(n<this.lastCount&&n>0)this.emit('countdown',{n});this.lastCount=n;if(this.countdown<=0){this.phase='playing';this.started=true;this.emit('go',{round:this.round});}return this.events;}
  if(this.phase==='resuming'){this.countdown-=dt;if(this.countdown<=0){this.phase=this.resumeTo||'playing';this.resumeTo=null;this.emit('resumed');}return this.events;}
  if(this.phase==='intermission'){this.countdown-=dt;if(this.countdown<=0)this.startRound(this.round+1);return this.events;}
  const open=this.open,casting=this.phase==='playing';
  for(const a of this.anglers){a.round=this.round;a.tick(dt,{open,casting});for(const e of a.events.splice(0))this.events.push(e);}
  if(this.practice)return this.events;
  if(this.phase==='playing'){
   this.timeLeft-=dt;
   if(this.timeLeft<=0){this.timeLeft=0;const fighting=this.anglers.filter(a=>a.timeUp());this.emit('time_up',{round:this.round,finishing:fighting.map(a=>a.id)});
    if(fighting.length){this.phase='finishing';this.finishLeft=FISHING.match.finish;}else this.endRound();}
  }else if(this.phase==='finishing'){
   this.finishLeft-=dt;const busy=this.anglers.filter(a=>['fight','landed'].includes(a.phase));
   if(this.finishLeft<=0){for(const a of this.anglers)if(a.phase==='fight')a.lose('timeup');for(const a of this.anglers)for(const e of a.events.splice(0))this.events.push(e);this.endRound();}
   else if(!busy.length)this.endRound();
  }
  return this.events;
 }
 startRound(n){this.round=n;this.phase='countdown';this.countdown=FISHING.match.countdown;this.lastCount=Math.ceil(this.countdown);this.timeLeft=this.roundSeconds;for(const a of this.anglers){a.reset('aim');a.round=n;}this.emit('round',{round:n});}
 endRound(){
  for(const a of this.anglers)if(a.phase!=='done')a.reset('done');
  this.rounds.push({round:this.round,scores:Object.fromEntries(this.anglers.map(a=>[a.id,a.catches.filter(c=>c.round===this.round).reduce((s,c)=>s+c.points,0)]))});
  if(this.round<FISHING.match.rounds){this.phase='intermission';this.countdown=FISHING.match.intermission;this.emit('round_end',{round:this.round});}
  else{this.phase='over';this.emit('over',{standings:this.standings().map(s=>({id:s.id,rank:s.rank,score:s.score}))});}
 }
 // 名次：总分 → 鱼获数 → 并列。
 standings(){
  const list=this.anglers.map(a=>({id:a.id,slot:a.slot,name:a.name,color:a.color,score:a.score,count:a.catches.length,catches:a.catches,losses:a.losses,source:a.source,biggest:a.catches.reduce((b,c)=>!b||c.points>b.points||c.points===b.points&&c.size>b.size?c:b,null)})).sort((x,y)=>y.score-x.score||y.count-x.count);
  list.forEach((s,i)=>{const prev=list[i-1];s.rank=prev&&prev.score===s.score&&prev.count===s.count?prev.rank:i+1;});return list;
 }
 snapshot(){return {mode:this.mode,phase:this.phase,round:this.round,rounds:this.practice?0:FISHING.match.rounds,countdown:['countdown','resuming','intermission'].includes(this.phase)?+this.countdown.toFixed(2):null,timeLeft:Number.isFinite(this.timeLeft)?+this.timeLeft.toFixed(2):null,finishLeft:this.phase==='finishing'?+this.finishLeft.toFixed(2):null,pauseReason:this.phase==='paused'?this.pauseReason:null,open:this.open,seed:this.seed,version:this.version,roundSeconds:this.roundSeconds,anglers:this.anglers.map(a=>a.snapshot())};}
}
