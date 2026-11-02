// 体感钓鱼 · 一位钓手的完整流程（纯逻辑，网关与测试共用）：
// 瞄准 → 准备抛竿（5 秒窗口）→ 抛投飞行 → 诱鱼（接近、试探、真咬）→ 刺鱼 → 搏鱼（张力、体力、冲刺、水草）→ 上岸 / 逃鱼 → 下一竿。
// 输入只有四种命令：竿姿 pose（抬放角、左右倾）、准备 arm、抛投 cast（力量、方向修正）、刺鱼 hook（触控 / 键盘的显式抬竿）；
// 另有收线重抛 reel 与放弃本竿 abandon。体感、触控和键盘都转成同样的命令，经过同一套规则。
import {FISHING,FISH,RHYTHM,ZONES,PREFER_TIPS,zoneAt,inWeeds,polar,toPolar,clamp,lerp,seededRandom,castDistance,aimFromRoll} from './rules.js';
export const ROD_TIP=Object.freeze({x:0,y:2.3,z:-1.6});
export const LOST_TEXT=Object.freeze({break:'一直硬拉，线断了',unhook:'线松太久，鱼脱钩了',weed:'鱼钻进水草，线被缠住了',abandon:'放弃了这一竿',timeup:'时间到，鱼放回湖里'});
const PHASES=['aim','armed','flight','lure','bite','fight','reel','landed','lost','done'];

export class Angler {
 constructor({id,slot=0,name='',color='#ffffff',scenario,practice=false,source='motion'}={}){
  Object.assign(this,{id,slot,name,color,scenario,practice,source});
  this.clock=0;this.score=0;this.catches=[];this.losses=[];this.events=[];this.pose={pitch:0,roll:0};this.history=[];this.lastLift=-9;this.aim=0;
  this.next=Object.fromEntries(ZONES.map(z=>[z.id,0]));this.cooldown={};this.catchSeq=0;this.tips=new Set();this.round=1;
  this.reset('aim');
 }
 reset(phase='aim'){this.phase=phase;this.timer=0;this.bobber=null;this.target=null;this.zone=null;this.zoneOpen=true;this.fish=null;this.fight=null;this.armedLeft=0;this.emptyHinted=false;this.hookPending=false;this.wantArm=false;this.lostReason=null;this.lastCatch=null;}
 emit(kind,extra={}){this.events.push({kind,id:this.id,slot:this.slot,t:this.clock,...extra});}
 // ---------- 输入 ----------
 setPose(pitch,roll){if(!Number.isFinite(pitch)||!Number.isFinite(roll))return;const P=FISHING.pose;this.pose={pitch:clamp(pitch,P.pitchMin,P.pitchMax),roll:clamp(roll,-P.rollMax,P.rollMax)};this.history.push({t:this.clock,p:this.pose.pitch,r:this.pose.roll});while(this.history.length&&this.history[0].t<this.clock-3)this.history.shift();}
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
 // 落点离最近的开放钓区偏哪边：远了 / 近了、偏左 / 偏右。
 missHint(open){const t=this.target,zs=ZONES.filter(z=>open.includes(z.id));if(!t||!zs.length)return '';let best=null,bd=Infinity;for(const z of zs){const c=polar(z.distance,z.angle),d=Math.hypot(t.x-c.x,t.z-c.z);if(d<bd){bd=d;best=z;}}
  const far=t.distance-best.distance,side=(t.angle-best.angle)*Math.PI/180*best.distance,parts=[];if(Math.abs(far)>best.radius*.5)parts.push(far>0?'抛远了':'抛近了');if(Math.abs(side)>best.radius*.5)parts.push(side>0?'偏右':'偏左');
  return parts.length?`离${best.name}${parts.join('、')}`:`就在${best.name}边上`;}
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
 tick(dt,{open=ZONES.map(z=>z.id),casting=true}={}){
  this.clock+=dt;if(!this.history.length||this.clock-this.history.at(-1).t>.1)this.history.push({t:this.clock,p:this.pose.pitch,r:this.pose.roll});
  if(['aim','armed'].includes(this.phase))this.aim+=(aimFromRoll(this.pose.roll)-this.aim)*(1-Math.exp(-dt/.1));
  switch(this.phase){
   case 'armed':this.armedLeft-=dt;if(this.armedLeft<=0){this.phase='aim';this.emit('arm_timeout');}if(!casting)this.phase='aim';break;
   case 'flight':this.flightTick(dt,open);break;
   case 'lure':this.lureTick(dt,open);break;
   case 'bite':this.biteTick(dt);break;
   case 'fight':this.fightTick(dt);break;
   case 'reel':{this.timer+=dt;const k=Math.min(1,this.timer/FISHING.cast.reel),a=this.reelFrom||ROD_TIP;this.bobber={x:lerp(a.x,ROD_TIP.x,k),y:lerp(a.y??0,ROD_TIP.y,k)+Math.sin(k*Math.PI)*.6,z:lerp(a.z,ROD_TIP.z,k)};if(k>=1){const arm=this.wantArm&&casting;this.reset(casting?'aim':'done');if(arm){this.phase='armed';this.armedLeft=FISHING.cast.window;this.emit('armed');}}break;}
   case 'landed':case 'lost':this.timer-=dt;if(this.timer<=0)this.reset(casting?'aim':'done');break;
  }
  this.hookPending=false;
 }
 flightTick(dt,open){
  this.timer+=dt;const k=Math.min(1,this.timer/this.flightTime),t=this.target,apex=1.8+t.distance*.18;
  this.bobber={x:lerp(ROD_TIP.x,t.x,k),y:lerp(ROD_TIP.y,0,k)+4*apex*k*(1-k),z:lerp(ROD_TIP.z,t.z,k)};
  if(k<1)return;
  this.bobber={x:t.x,y:0,z:t.z};const hit=zoneAt(t.x,t.z,open),weeds=inWeeds(t.x,t.z,-.2);this.zone=hit&&!weeds?hit.zone.id:null;this.zoneOpen=!!hit?.open;this.weedCast=weeds;
  this.phase='lure';this.timer=0;this.emptyHinted=false;this.fish=null;this.emit('splash',{x:t.x,z:t.z,zone:this.zone,open:this.zoneOpen,weeds});
 }
 lureTick(dt,open){
  this.timer+=dt;const A=FISHING.approach;
  // 0.28.1：没落进开放的钓区时马上说（以前要等 4 秒），并提示离最近的开放钓区偏哪边；挂水草仍等 1 秒。
  if(!this.zone||!this.zoneOpen||!open.includes(this.zone)){if(this.timer>=(this.weedCast?1:0)&&!this.emptyHinted){this.emptyHinted=true;const reason=this.weedCast?'weeds':this.zone&&(!this.zoneOpen||!open.includes(this.zone))?'closed':'none';this.emit('empty',{reason,zone:this.zone,hint:reason==='weeds'?'':this.missHint(open)});}return;}
  if(!this.fish){
   if(this.clock<(this.cooldown[this.zone]||0))return;
   const slot=this.scenario.zones[this.zone][this.next[this.zone]%6],r=seededRandom(slot.seed^0x9e37),gap=lerp(A.gap[0],A.gap[1],r()),dir=r()*Math.PI*2;
   this.fish={slot,type:slot.type,A:0,pause:0,from:{x:this.bobber.x+Math.cos(dir)*gap,z:this.bobber.z+Math.sin(dir)*gap},nibble:0,since:this.clock,tipped:false};this.emit('fish_near',{type:slot.type});
  }
  const f=this.fish,kind=this.rhythm(),mult=(RHYTHM[f.type][kind]??.7)*f.slot.approach;f.rhythm=kind;
  if(this.lift(FISHING.hook.spook)||this.hookPending){if(f.A>A.spookAbove){const early=f.nibble>0;f.A=Math.max(0,f.A-A.spookLoss);f.pause=A.spookPause;this.emit('spook',{early});}}
  else if(f.pause>0)f.pause-=dt;else f.A=Math.min(1,f.A+A.base*mult*dt);
  while(f.nibble<A.nibbles.length&&f.A>=A.nibbles[f.nibble]){f.nibble++;this.emit('nibble',{n:f.nibble});}
  if(!f.tipped&&this.clock-f.since>6&&f.A<.6){f.tipped=true;this.emit('tip',{type:f.type,text:PREFER_TIPS[f.type]});}
  const k=Math.pow(f.A,.8);f.x=lerp(f.from.x,this.bobber.x,k);f.z=lerp(f.from.z,this.bobber.z,k);
  if(f.A>=1){this.phase='bite';this.timer=this.practice?FISHING.bite.practice:FISHING.bite.window;this.biteWindow=this.timer;this.emit('bite',{type:f.type});}
 }
 biteTick(dt){
  this.timer-=dt;const f=this.fish;
  if(this.lift()||this.hookPending){this.startFight();return;}
  if(this.timer<=0){this.emit('miss',{type:f.type});this.cooldown[this.zone]=this.clock+FISHING.approach.missCooldown;this.fish=null;this.phase='lure';this.timer=0;}
 }
 startFight(){
  const f=this.fish,t=FISH[f.type],r=seededRandom(f.slot.seed),p=toPolar(this.bobber.x,this.bobber.z);
  this.fight={type:f.type,slot:f.slot,D:p.d,angle:p.angle,lat:0,E:1,T:.35,C:0,S:0,behavior:'swim',timer:lerp(t.swim[0],t.swim[1],r()),dashLeft:t.dashes,side:f.slot.side,tight:0,slack:0,weed:0,hold:0,lastP:this.pose.pitch,pf:this.pose.pitch,stroke:0,strain:0,rng:r,elapsed:0,dashes:0,reeled:0};
  this.phase='fight';this.timer=0;this.fish={...f,x:this.bobber.x,z:this.bobber.z};this.emit('hook',{type:f.type});
 }
 // 搏鱼：一维“拉锯”模型 + 侧向偏移。见 docs/FISHING.md。
 fightTick(dt){
  const f=this.fight,t=FISH[f.type],T0=FISHING.tension,D0=f.D;f.pf+=(this.pose.pitch-f.pf)*(1-Math.exp(-dt/.12));const p=f.pf,dp=(p-f.lastP)/dt;f.lastP=p;f.elapsed+=dt;
  const rho=clamp((p+8)/33,0,1);
  // 鱼的行为：巡游 → 预兆（至少 0.8 秒）→ 冲刺 → 巡游 …；体力低于 0.3 进入疲劳，不再冲刺。
  f.timer-=dt;
  if(f.behavior==='swim'&&f.E<.3)f.behavior='tired';
  if(f.timer<=0){
   if(f.behavior==='swim'&&f.dashLeft>0){f.behavior='telegraph';f.timer=t.telegraph*(this.practice?1.5:1);f.dashDir=t.sideways?(f.dashes%2?-f.side:f.side):0;this.emit('telegraph',{dir:f.dashDir});}
   else if(f.behavior==='telegraph'){f.behavior='dash';f.timer=t.dashTime*(.6+.4*f.E);f.dashLeft--;f.dashes++;this.emit('dash',{dir:f.dashDir});}
   else if(f.behavior==='dash'){f.behavior=f.E<.3?'tired':'swim';f.timer=lerp(t.swim[0],t.swim[1],f.rng());}
   else f.timer=lerp(t.swim[0],t.swim[1],f.rng());
  }
  const dash=f.behavior==='dash',force=({swim:.35,telegraph:.45,dash:1,tired:.15})[f.behavior]*t.strength*(.45+.55*f.E),speed=({swim:.25,telegraph:.15,dash:1.9,tired:.06})[f.behavior]*(.5+.5*t.strength)*(.5+.5*f.E);
  // 抬竿：把鱼拉近（冲刺时拉不太动），拉近的距离成为“可用松线”；放竿：自动收回可用松线（不超过收线速度）。
  // 抬竿：先收紧松掉的线，再把鱼拉近；拉近的距离成为“可收的线” C。一次抬竿的前 3° 不算（抖腕不拉鱼），
  // 拉近速度不超过 3.5 米/秒——节奏再快也不会更快。
  if(dp>0){const before=f.stroke;f.stroke+=dp*dt;const eff=Math.max(0,f.stroke-3)-Math.max(0,before-3);let pull=Math.min(.13*eff,3.5*dt);const take=Math.min(f.S,pull);f.S-=take;pull=(pull-take)*(dash?.25:1);f.D-=pull;f.C+=pull;}else if(dp<-2)f.stroke=0;
  // 放竿：自动收回可收的线（不超过 3.5 米/秒）；放得比收得快、或者根本没有可收的线，多出来的就成了松线 S。
  if(dp<0){const drop=.13*-dp*dt,r=Math.min(f.C,3.5*dt,drop);f.C-=r;f.reeled+=r;f.S=Math.min(4,f.S+(drop-r)*.4);}
  // 鱼往外游：竿抬得越高越游不动；先把松线拉直，再拉出新线。
  const run=speed*(1-.7*rho)*dt;f.D+=run;f.S=Math.max(0,f.S-run);f.C=Math.max(0,f.C-run*.5);
  f.D=clamp(f.D,.6,34);
  // 侧向：鱼往一侧游（鲈鱼冲向水草），向反方向侧倾鱼竿把它带回来。
  const wander=f.dashDir&&(dash||f.behavior==='telegraph')?f.dashDir*(dash?1.5:.3):.18*Math.sin(f.elapsed*.7+f.slot.seed%7);
  f.lat+=(wander-clamp(this.pose.roll/FISHING.pose.full,-1,1)*1.3*(.5+.5*rho))*dt;f.lat=clamp(f.lat*(f.D/Math.max(.6,D0)),-9,9);
  const base=polar(f.D,f.angle),right={x:Math.cos(f.angle*Math.PI/180),z:Math.sin(f.angle*Math.PI/180)};this.fish.x=base.x+right.x*f.lat;this.fish.z=base.z+right.z*f.lat;
  // 张力（平滑，单帧尖峰不会直接失败）。
  const liftRate=clamp(dp/60,0,1),loose=clamp(f.S/1.5,0,1),low=p<-5&&!dash?.05:0;
  // 一直把竿举在高处：张力持续累积（硬拉）。
  f.strain=rho>.8?f.strain+dt:Math.max(0,f.strain-2*dt);
  const raw=clamp(.1+.62*force*(.35+.65*rho)+.35*rho+.2*liftRate+.09*Math.min(f.strain,4)-.3*loose-low,0,1);f.T+=(raw-f.T)*(1-Math.exp(-dt/T0.smooth));
  f.tight=f.T>T0.danger?f.tight+dt:Math.max(0,f.tight-dt);f.slack=f.T<T0.slack?f.slack+dt:Math.max(0,f.slack-dt);
  const weedy=inWeeds(this.fish.x,this.fish.z);f.weed=weedy?f.weed+dt:Math.max(0,f.weed-.6*dt);
  if(weedy&&f.weed>=FISHING.weed.warn&&!f.weedWarned){f.weedWarned=true;this.emit('weed_warn');}if(!weedy&&f.weed===0)f.weedWarned=false;
  // 体力：有效受力时消耗，冲刺额外消耗；张力很低时慢慢恢复。
  f.E=clamp(f.E-(.03+.24*f.T*rho+(dash?.05:0))*dt/t.stamina+(f.T<.2?.02*dt:0),0,1);
  if(f.tight>=T0.breakTime)return this.lose('break');
  if(f.slack>=T0.slackTime)return this.lose('unhook');
  if(f.weed>=FISHING.weed.escape)return this.lose('weed');
  const L=FISHING.land;if(f.D<=L.distance&&f.E<L.stamina&&f.T>=L.tension[0]&&f.T<=L.tension[1])f.hold+=dt;else f.hold=0;
  if(f.hold>=L.hold)this.land();
 }
 land(){
  const f=this.fight,t=FISH[f.type],c={catchId:`${this.id}:${++this.catchSeq}`,type:f.type,name:t.name,zone:f.slot.zone,slot:f.slot.slot,size:f.slot.size,points:t.points,round:this.round,time:Math.round(f.elapsed*10)/10,source:this.castSource||this.source};
  this.catches.push(c);this.score+=c.points;this.next[f.slot.zone]++;this.emit('landed',{catch:c});this.lastCatch=c;
  this.phase='landed';this.timer=FISHING.landedShow;this.fight=null;this.fish=null;this.bobber=null;
 }
 lose(reason){
  const f=this.fight;this.losses.push({reason,type:f?.type??null,round:this.round,t:this.clock});if(f){this.cooldown[f.slot.zone]=this.clock+FISHING.approach.missCooldown;}
  this.emit('lost',{reason,type:f?.type??null,text:LOST_TEXT[reason]});this.lostReason=reason;this.phase='lost';this.timer=FISHING.lostShow;this.fight=null;this.fish=null;this.bobber=null;
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
   fight:f&&{D:+f.D.toFixed(2),E:+f.E.toFixed(3),T:+f.T.toFixed(3),C:+f.C.toFixed(2),S:+f.S.toFixed(2),behavior:f.behavior,tight:+f.tight.toFixed(2),slack:+f.slack.toFixed(2),weed:+f.weed.toFixed(2),hold:+f.hold.toFixed(2),type:f.type},
   score:this.score,catches:this.catches.length,last:this.lastCatch,lost:this.phase==='lost'?this.lostReason:null,source:this.source};
 }
}
export {PHASES};
