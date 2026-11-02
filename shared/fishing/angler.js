// 体感钓鱼 · 一位钓手的完整流程（纯逻辑，网关与测试共用）：
// 瞄准 → 准备抛竿（5 秒窗口）→ 抛投飞行 → 诱鱼（接近、试探、真咬）→ 刺鱼 → 收线（0.29：转轮收线、溜鱼、带鱼头）→ 上岸 / 逃鱼 → 下一竿。
// 0.29 起整片湖都能钓：落点所在水域决定咬口快慢和会来什么（鱼 / 杂物 / 宝箱），见 rules.js 的 WATERS 与 CATCHES。
// 输入只有四种命令：竿姿 pose（抬放角、左右倾）、准备 arm、抛投 cast（力量、方向修正）、刺鱼 hook（触控 / 键盘的显式抬竿）；
// 另有收线重抛 reel 与放弃本竿 abandon。体感、触控和键盘都转成同样的命令，经过同一套规则。
import {FISHING,CATCHES,RHYTHM,WATERS,PREFER_TIPS,waterAt,waterById,inWeeds,polar,toPolar,clamp,lerp,rad,seededRandom,castDistance,aimFromRoll,catchPoints} from './rules.js';
export const ROD_TIP=Object.freeze({x:0,y:2.3,z:-1.6});
export const LOST_TEXT=Object.freeze({break:'它冲的时候还在硬收，线断了',unhook:'停手太久，线松了，鱼脱钩了',weed:'鱼钻进障碍物，线被缠住了',runaway:'鱼一直跑，线放光了',abandon:'剪线了',timeup:'时间到，放回湖里'});
const PHASES=['aim','armed','flight','lure','bite','fight','reel','landed','lost','done'];

export class Angler {
 constructor({id,slot=0,name='',color='#ffffff',scenario,practice=false,source='motion'}={}){
  Object.assign(this,{id,slot,name,color,scenario,practice,source});
  this.clock=0;this.score=0;this.catches=[];this.losses=[];this.events=[];this.pose={pitch:0,roll:0};this.history=[];this.lastLift=-9;this.aim=0;
  this.next=Object.fromEntries(WATERS.map(w=>[w.id,0]));this.crank=0;this.crankAt=-9;this.cooldown={};this.catchSeq=0;this.tips=new Set();this.round=1;
  this.reset('aim');
 }
 reset(phase='aim'){this.phase=phase;this.timer=0;this.bobber=null;this.target=null;this.zone=null;this.fish=null;this.fight=null;this.armedLeft=0;this.emptyHinted=false;this.hookPending=false;this.wantArm=false;this.lostReason=null;this.lastCatch=null;}
 emit(kind,extra={}){this.events.push({kind,id:this.id,slot:this.slot,t:this.clock,...extra});}
 // ---------- 输入 ----------
 setPose(pitch,roll,crank){if(Number.isFinite(crank)){this.crank=clamp(crank,0,FISHING.reel.maxCrank+2);this.crankAt=this.clock;}if(!Number.isFinite(pitch)||!Number.isFinite(roll))return;const P=FISHING.pose;this.pose={pitch:clamp(pitch,P.pitchMin,P.pitchMax),roll:clamp(roll,-P.rollMax,P.rollMax)};this.history.push({t:this.clock,p:this.pose.pitch,r:this.pose.roll});while(this.history.length&&this.history[0].t<this.clock-3)this.history.shift();}
 clearHistory(){this.history=[{t:this.clock,p:this.pose.pitch,r:this.pose.roll}];this.lastLift=this.clock;this.hookPending=false;}
 arm(){
  if(this.phase==='aim'){this.phase='armed';this.armedLeft=FISHING.cast.window;this.emit('armed');return true;}
  if(this.phase==='armed')return true;
  if(['lure','bite'].includes(this.phase)){this.startReel(true);return true;}
  if(['landed','lost'].includes(this.phase)){this.reset('aim');this.phase='armed';this.armedLeft=FISHING.cast.window;this.emit('armed');return true;}
  return false;
 }
 disarm(){if(this.phase==='armed'){this.phase='aim';this.emit('disarm');}}
 // 抛投：只在准备窗口内接受一次。power 0–1；dir 为挥动方向修正（度，限 ±8°）。
 // aimRoll：手机在后引开始时的左右倾（挥动前稳定的瞄准）；没有时用当前瞄准。
 cast({power,dir=0,source=this.source,aimRoll}={}){
  if(this.phase!=='armed'||!Number.isFinite(power))return false;
  if(Number.isFinite(aimRoll))this.aim=aimFromRoll(clamp(aimRoll,-FISHING.pose.rollMax,FISHING.pose.rollMax));
  const C=FISHING.cast,distance=castDistance(power),angle=clamp(this.aim+clamp(Number(dir)||0,-C.dirCorrection,C.dirCorrection),-C.aimRange-C.dirCorrection,C.aimRange+C.dirCorrection),p=polar(distance,angle);
  this.target={...p,distance,angle};this.phase='flight';this.timer=0;this.flightTime=C.flightBase+C.flightPerMeter*distance;this.castSource=source;this.bobber={x:ROD_TIP.x,y:ROD_TIP.y,z:ROD_TIP.z};
  this.emit('cast',{distance,angle,power});return true;
 }
 hook(){if(['lure','bite'].includes(this.phase))this.hookPending=true;}
 reel(){if(['lure','bite'].includes(this.phase))this.startReel(false);}
 abandon(){if(['lure','bite','reel'].includes(this.phase)){this.startReel(false);return;}if(this.phase==='fight')this.lose('abandon');}
 startReel(arm){this.phase='reel';this.timer=0;this.wantArm=arm;this.fish=null;this.reelFrom={...this.bobber};this.emit('reel');}
 // ---------- 动作判定 ----------
 // 刺鱼动作：0.4 秒内抬竿至少 12°，速度不低于 40°/秒（冷却 0.5 秒）。
 // 0.28.1：从最近一次的最低点算起（以前取窗口里最早的最低点，静止后实际要抬约 16° 才算）。
 lift(need=FISHING.hook.lift){
  const H=FISHING.hook;if(this.clock-this.lastLift<H.cooldown)return false;let min=Infinity,minT=this.clock;
  for(const h of this.history)if(h.t>=this.clock-H.time&&h.p<=min){min=h.p;minT=h.t;}
  const rise=this.pose.pitch-min,rate=rise/Math.max(.05,this.clock-minT);if(rise>=need&&rate>=H.minRate){this.lastLift=this.clock;return true;}return false;
 }
 // 诱鱼节奏：最近 1.5 秒的抬放形态。
 rhythm(){
  const now=this.clock,win=this.history.filter(h=>h.t>=now-1.5);if(win.length<3)return 'still';
  let twitch=false;for(let i=0;i<win.length&&!twitch;i++)for(let j=i+1;j<win.length&&win[j].t-win[i].t<=.2;j++){const rise=win[j].p-win[i].p;if(rise>=6&&rise<FISHING.hook.spook&&win[j].t-win[i].t<=.15){twitch=true;break;}}
  const last=win.filter(h=>h.t>=now-1),ps=last.map(h=>h.p),range=Math.max(...ps)-Math.min(...ps);let move=0;for(let i=1;i<last.length;i++)move+=Math.abs(last[i].p-last[i-1].p);const speed=move/Math.max(.3,last.at(-1).t-last[0].t);
  let kind;
  if(twitch)kind='twitch';
  else if(range<2.5)kind=now-(this.lastDrag??-9)<3?'dragpause':now-(this.lastMove??-9)>4?'still':'pause';
  else kind=speed>=3&&speed<=30?'drag':'other';
  if(kind==='drag')this.lastDrag=now;if(['drag','twitch','other'].includes(kind))this.lastMove=now;
  return kind;
 }
 // ---------- 每一步 ----------
 tick(dt,{casting=true}={}){
  this.clock+=dt;if(this.clock-this.crankAt>FISHING.reel.stale)this.crank=0;if(!this.history.length||this.clock-this.history.at(-1).t>.1)this.history.push({t:this.clock,p:this.pose.pitch,r:this.pose.roll});
  if(['aim','armed'].includes(this.phase))this.aim+=(aimFromRoll(this.pose.roll)-this.aim)*(1-Math.exp(-dt/.1));
  switch(this.phase){
   case 'armed':this.armedLeft-=dt;if(this.armedLeft<=0){this.phase='aim';this.emit('arm_timeout');}if(!casting)this.phase='aim';break;
   case 'flight':this.flightTick(dt);break;
   case 'lure':this.lureTick(dt);break;
   case 'bite':this.biteTick(dt);break;
   case 'fight':this.fightTick(dt);break;
   case 'reel':{this.timer+=dt;const k=Math.min(1,this.timer/FISHING.cast.reel),a=this.reelFrom||ROD_TIP;this.bobber={x:lerp(a.x,ROD_TIP.x,k),y:lerp(a.y??0,ROD_TIP.y,k)+Math.sin(k*Math.PI)*.6,z:lerp(a.z,ROD_TIP.z,k)};if(k>=1){const arm=this.wantArm&&casting;this.reset(casting?'aim':'done');if(arm){this.phase='armed';this.armedLeft=FISHING.cast.window;this.emit('armed');}}break;}
   case 'landed':case 'lost':this.timer-=dt;if(this.timer<=0)this.reset(casting?'aim':'done');break;
  }
  this.hookPending=false;
 }
 flightTick(dt){
  this.timer+=dt;const k=Math.min(1,this.timer/this.flightTime),t=this.target,apex=1.8+t.distance*.18;
  this.bobber={x:lerp(ROD_TIP.x,t.x,k),y:lerp(ROD_TIP.y,0,k)+4*apex*k*(1-k),z:lerp(ROD_TIP.z,t.z,k)};
  if(k<1)return;
  this.bobber={x:t.x,y:0,z:t.z};const weeds=inWeeds(t.x,t.z,-.2),water=waterAt(t.x,t.z);this.zone=weeds?null:water.id;this.weedCast=weeds;
  this.phase='lure';this.timer=0;this.emptyHinted=false;this.fish=null;this.emit('splash',{x:t.x,z:t.z,zone:this.zone,water:water.id,weeds});
 }
 // 诱鱼：哪里都能钓；水域决定咬口快慢（bite）和会来什么（赛题里这片水域的下一个）。只有抛进芦苇丛会挂住。
 lureTick(dt){
  this.timer+=dt;const A=FISHING.approach;
  if(this.weedCast||!this.zone){if(this.timer>=1&&!this.emptyHinted){this.emptyHinted=true;this.emit('empty',{reason:'weeds'});}return;}
  const water=waterById(this.zone);
  if(!this.fish){
   if(this.clock<(this.cooldown[this.zone]||0))return;
   const slot=this.scenario.waters[this.zone][this.next[this.zone]%40],r=seededRandom(slot.seed^0x9e37),gap=lerp(A.gap[0],A.gap[1],r()),dir=r()*Math.PI*2;
   this.fish={slot,type:slot.type,A:0,pause:0,from:{x:this.bobber.x+Math.cos(dir)*gap,z:this.bobber.z+Math.sin(dir)*gap},nibble:0,since:this.clock,tipped:false};this.emit('fish_near',{type:slot.type});
  }
  const f=this.fish,kind=this.rhythm(),mult=(RHYTHM[f.type]?.[kind]??.7)*f.slot.approach*water.bite;f.rhythm=kind;
  if(this.lift(FISHING.hook.spook)||this.hookPending){if(f.A>A.spookAbove){const early=f.nibble>0;f.A=Math.max(0,f.A-A.spookLoss);f.pause=A.spookPause;this.emit('spook',{early});}}
  else if(f.pause>0)f.pause-=dt;else f.A=Math.min(1,f.A+A.base*mult*dt);
  while(f.nibble<A.nibbles.length&&f.A>=A.nibbles[f.nibble]){f.nibble++;this.emit('nibble',{n:f.nibble});}
  if(!f.tipped&&this.clock-f.since>6&&f.A<.6&&PREFER_TIPS[f.type]){f.tipped=true;this.emit('tip',{type:f.type,text:PREFER_TIPS[f.type]});}
  const k=Math.pow(f.A,.8);f.x=lerp(f.from.x,this.bobber.x,k);f.z=lerp(f.from.z,this.bobber.z,k);
  if(f.A>=1){this.phase='bite';this.timer=this.practice?FISHING.bite.practice:FISHING.bite.window;this.biteWindow=this.timer;this.emit('bite',{type:f.type});}
 }
 biteTick(dt){
  this.timer-=dt;const f=this.fish;
  if(this.lift()||this.hookPending){this.startFight();return;}
  if(this.timer<=0){this.emit('miss',{type:f.type});this.cooldown[this.zone]=this.clock+FISHING.approach.missCooldown;this.fish=null;this.phase='lure';this.timer=0;}
 }
 startFight(){
  const f=this.fish,s=f.slot,c=CATCHES[s.type],water=waterById(this.zone)||WATERS[2],r=seededRandom(s.seed),p=toPolar(this.bobber.x,this.bobber.z),fish=c.kind==='fish';
  this.fight={type:s.type,kind:c.kind,kg:s.kg,points:catchPoints(s.type,s.kg),slot:s,water:water.id,width:water.width,snagName:water.snag,D:p.d,angle:p.angle,lat:0,E:1,T:.25,
   behavior:fish?'swim':'heavy',timer:fish?lerp(c.swim[0],c.swim[1],r()):0,dashLeft:fish?c.dashes:0,side:s.side,dashDir:0,tight:0,slack:0,snag:0,elapsed:0,dashes:0,reeled:0,crank:0,rng:r};
  this.phase='fight';this.timer=0;this.fish={...f,x:this.bobber.x,z:this.bobber.z};this.emit('hook',{type:s.type,catchKind:c.kind,kg:s.kg,name:c.name,points:this.fight.points});
 }
 // 收线（0.29，参考“黄金矿工”）：转轮收线，东西越重收得越慢；鱼会“预兆 → 冲刺”，冲刺时硬收会断线，要停手让它跑（溜鱼），
 // 跑累了就快收；冲刺会往两边钻，往反方向倾竿把鱼头带回来；不冲的时候停手太久线会松、鱼会脱钩。抬竿能卸掉一部分张力。
 fightTick(dt){
  const f=this.fight,c=CATCHES[f.type],R=FISHING.reel,fish=f.kind==='fish',crank=clamp(this.crank,0,R.maxCrank),lift=clamp(this.pose.pitch/20,0,1),lean=clamp(this.pose.roll/FISHING.pose.full,-1,1);
  f.elapsed+=dt;f.crank=crank;
  if(fish){
   f.timer-=dt;if(f.behavior==='swim'&&f.E<.3){f.behavior='tired';this.emit('tired');}
   if(f.timer<=0){
    if(f.behavior==='swim'&&f.dashLeft>0){f.behavior='telegraph';f.timer=c.telegraph*(this.practice?1.5:1);f.dashDir=c.sideways?f.side:0;this.emit('telegraph',{dir:f.dashDir});}
    else if(f.behavior==='telegraph'){f.behavior='dash';f.timer=c.dashTime*(.6+.4*f.E);f.dashLeft--;f.dashes++;this.emit('dash',{dir:f.dashDir});}
    else if(f.behavior==='dash'){f.behavior=f.E<.3?'tired':'swim';f.timer=lerp(c.swim[0],c.swim[1],f.rng());if(f.behavior==='tired')this.emit('tired');}
    else f.timer=lerp(c.swim[0],c.swim[1],f.rng());
   }
  }
  const dash=f.behavior==='dash',warn=f.behavior==='telegraph',pull=fish?({swim:.3,telegraph:.4,dash:1,tired:.12})[f.behavior]*c.strength*(.5+.5*f.E):0;
  // 距离：你收回来的（每圈 spool 米，越重越慢；冲刺时几乎收不动）减去鱼游出去的。
  const reelV=crank*R.spool/(1+f.kg/R.weightK),run=fish?({swim:.3,telegraph:.1,dash:2.4,tired:.04})[f.behavior]*(.5+.5*c.strength)*(.5+.5*f.E):0;
  f.D+=(run-reelV*(dash?.15:1))*dt;f.reeled+=reelV*dt;
  // 张力：鱼的拉力 + 收线的力（冲刺时收线力加倍）；杂物和宝箱只是沉；抬竿卸力。
  const effort=Math.min(1,crank/2.5),dead=fish?0:Math.min(.5,f.kg/16);
  const raw=clamp(.08+.62*pull+(fish?(dash?.7:.32):.25)*effort+dead*effort-.18*lift*(pull>.4?1:.4),0,1.3);f.T+=(raw-f.T)*(1-Math.exp(-dt/FISHING.tension.smooth));
  f.tight=f.T>=R.breakT?f.tight+dt:Math.max(0,f.tight-1.5*dt);
  const idle=fish&&crank<.3&&!dash&&!warn;f.slack=idle?f.slack+dt:crank>=.3?Math.max(0,f.slack-2*dt):f.slack;
  // 侧向（lat 正 = 线的右边）：鱼游动时左右晃，会往两边钻的鱼冲刺时猛往一边；往反方向倾竿把鱼头带回来（倾过头会带到另一边）。
  const wander=fish?(f.dashDir&&(dash||warn)?f.dashDir*(dash?2.6:.4):.22*Math.sin(f.elapsed*.8+f.slot.seed%7)):0;
  f.lat+=(wander+lean*1.4-(Math.abs(lean)<.1?.15*f.lat:0))*dt;f.lat=clamp(f.lat,-f.width-.5,f.width+.5);
  f.snag=Math.abs(f.lat)>=f.width?f.snag+dt:Math.max(0,f.snag-dt);
  if(Math.abs(f.lat)>=f.width*.7&&!f.snagWarned){f.snagWarned=true;this.emit('snag_warn',{dir:Math.sign(f.lat),name:f.snagName});}if(Math.abs(f.lat)<f.width*.4)f.snagWarned=false;
  if(dash&&f.D>R.lineMax-4&&!f.lineWarned){f.lineWarned=true;this.emit('line_warn');}
  // 体力：扛着张力最累人，冲刺更累；累了就不再冲刺，可以快收。
  if(fish)f.E=clamp(f.E-(.015+.16*f.T*(dash?1.6:1))*dt/c.stamina,0,1);
  f.D=clamp(f.D,0,R.lineMax+1);
  const base=polar(Math.max(.6,f.D),f.angle),right={x:Math.cos(rad(f.angle)),z:Math.sin(rad(f.angle))};this.fish.x=base.x+right.x*f.lat;this.fish.z=base.z+right.z*f.lat;
  if(f.tight>=R.breakTime)return this.lose('break');
  if(f.slack>=R.slackTime)return this.lose('unhook');
  if(f.snag>=R.snagTime)return this.lose('weed');
  if(f.D>=R.lineMax)return this.lose('runaway');
  if(f.D<=R.landAt)this.land();
 }
 land(){
  const f=this.fight,t=CATCHES[f.type],c={catchId:`${this.id}:${++this.catchSeq}`,type:f.type,kind:t.kind,name:t.name,water:f.water,zone:f.water,slot:f.slot.slot,kg:f.kg,points:f.points,round:this.round,time:Math.round(f.elapsed*10)/10,source:this.castSource||this.source};
  this.catches.push(c);this.score+=c.points;this.next[f.water]++;this.emit('landed',{catch:c});this.lastCatch=c;
  this.phase='landed';this.timer=FISHING.landedShow;this.fight=null;this.fish=null;this.bobber=null;
 }
 lose(reason){
  const f=this.fight;this.losses.push({reason,type:f?.type??null,kg:f?.kg??null,round:this.round,t:this.clock});if(f){this.cooldown[f.water]=this.clock+FISHING.approach.missCooldown;this.next[f.water]++;}
  this.emit('lost',{reason,type:f?.type??null,catchKind:f?.kind??null,kg:f?.kg??null,name:f?CATCHES[f.type].name:null,text:LOST_TEXT[reason]});this.lostReason=reason;this.phase='lost';this.timer=FISHING.lostShow;this.fight=null;this.fish=null;this.bobber=null;
 }
 // 到时：搏鱼中的可以收尾，其余直接结束本轮。
 timeUp(){if(this.phase==='fight')return true;if(['landed','lost'].includes(this.phase))return false;this.reset('done');return false;}
 // 给画面的快照。
 snapshot(){
  const f=this.fight,fish=this.fish;
  return {id:this.id,slot:this.slot,name:this.name,color:this.color,phase:this.phase,aim:Math.round(this.aim*10)/10,pose:{p:Math.round(this.pose.pitch*10)/10,r:Math.round(this.pose.roll*10)/10},armed:this.phase==='armed'?Math.round(this.armedLeft*10)/10:null,
   bobber:this.bobber&&{x:+this.bobber.x.toFixed(2),y:+this.bobber.y.toFixed(2),z:+this.bobber.z.toFixed(2)},target:this.target&&{x:+this.target.x.toFixed(2),z:+this.target.z.toFixed(2),d:+this.target.distance.toFixed(1)},zone:this.zone,
   fish:fish&&{x:+(fish.x??fish.from.x).toFixed(2),z:+(fish.z??fish.from.z).toFixed(2),type:fish.type,A:fish.A!==undefined?+fish.A.toFixed(2):1,rhythm:fish.rhythm||null},
   bite:this.phase==='bite'?{left:+this.timer.toFixed(2),window:this.biteWindow}:null,
   fight:f&&{D:+f.D.toFixed(2),E:+f.E.toFixed(3),T:+f.T.toFixed(3),behavior:f.behavior,type:f.type,kind:f.kind,kg:f.kg,points:f.points,water:f.water,lat:+f.lat.toFixed(2),width:f.width,snagName:f.snagName,snag:+f.snag.toFixed(2),tight:+f.tight.toFixed(2),slack:+f.slack.toFixed(2),crank:+f.crank.toFixed(2),dashDir:f.dashDir,dashLeft:f.dashLeft,elapsed:+f.elapsed.toFixed(1)},
   score:this.score,catches:this.catches.length,last:this.lastCatch,lost:this.phase==='lost'?this.lostReason:null,source:this.source};
 }
}
export {PHASES};
