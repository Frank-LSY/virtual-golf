import test from 'node:test';
import assert from 'node:assert/strict';
import {FISHING,WATERS,CATCHES,WEEDS,REEDS_AT,scenario,waterAt,polar,castDistance,aimFromRoll,inWeeds,catchPoints} from '../shared/fishing/rules.js';
import {Angler} from '../shared/fishing/angler.js';
import {FishingMatch} from '../shared/fishing/match.js';
import {RodMapper,CastDetector,rodAngles} from '../shared/fishing/input.js';
import {FishingBot,fishFor,rollFor,powerFor} from './fishing-bot.js';
const dt=FISHING.step,run=(a,seconds,fn=()=>{},ctx={})=>{const out=[];for(let i=0;i<Math.round(seconds/dt);i++){fn(a,i*dt);a.tick(dt,ctx);out.push(...a.events.splice(0));}return out;};
// 0.29 整片湖都能钓：四个代表性的落点（浅水、芦苇边、开阔水、深潭）。
const SPOT={shallow:{distance:9,angle:-30},reeds:{distance:16,angle:27},open:{distance:16,angle:-8},deep:{distance:26,angle:2}};
const castTo=(a,{distance,angle},{power}={})=>{a.setPose(0,rollFor(angle));run(a,.6,x=>x.setPose(0,rollFor(angle)));assert.equal(a.arm(),true);assert.equal(a.cast({power:power??powerFor(distance)}),true);run(a,a.flightTime+.05,x=>x.setPose(0,rollFor(angle)));};
// 只会来同一种东西的赛题（测试单种鱼 / 杂物 / 宝箱）。
const only=(type,kg)=>({seed:1,version:'test',waters:Object.fromEntries(WATERS.map(w=>[w.id,Array.from({length:40},(_,i)=>({slot:i,water:w.id,type,kg,seed:1000+i,side:1,approach:1}))]))});
// 抛到 spot、等咬钩、刺中，返回正在收线的钓手。
const hooked=(sc,spot)=>{const a=new Angler({id:'h',scenario:sc});castTo(a,spot);let t=0;while(a.phase!=='bite'&&t<40){a.setPose(0,0);a.tick(dt,{});a.events.length=0;t+=dt;}assert.equal(a.phase,'bite');a.hook();a.tick(dt,{});a.events.length=0;assert.equal(a.phase,'fight');return a;};

test('0.29 开放水域：按位置分四片水域；哪里都能钓（只有芦苇丛会挂住）；鱼情表与赛题固定；分数按重量', ()=>{
 const at=(d,ang)=>{const p=polar(d,ang);return waterAt(p.x,p.z).id;};
 assert.equal(at(8,-30),'shallow');assert.equal(at(REEDS_AT.distance,REEDS_AT.angle),'reeds');assert.equal(at(16,-10),'open');assert.equal(at(27,0),'deep');assert.equal(at(10,40),'shallow');
 for(const [w,spot] of Object.entries(SPOT)){const a=new Angler({id:w,scenario:scenario(3)});castTo(a,spot);assert.equal(a.zone,w,`抛到${w}`);const ev=run(a,.3,x=>x.setPose(0,0));assert.ok(a.fish,`${w} 也能来鱼`);assert.ok(!ev.some(e=>e.kind==='empty'));}
 const weed=WEEDS[2],wp=Math.hypot(weed.x,weed.z),wa=Math.atan2(weed.x,-weed.z)*180/Math.PI,b=new Angler({id:'w',scenario:scenario(1)});castTo(b,{distance:wp,angle:wa});assert.ok(run(b,1.3).some(e=>e.kind==='empty'&&e.reason==='weeds'),'抛进芦苇丛会挂住');
 const s1=scenario(5),s2=scenario(5);assert.equal(JSON.stringify(s1),JSON.stringify(s2),'同一赛题完全相同');assert.notEqual(JSON.stringify(scenario(6)),JSON.stringify(s1));
 for(const w of WATERS){const list=s1.waters[w.id];assert.equal(list.length,40);for(const x of list){assert.ok(w.table[x.type],`${w.id} 只出鱼情表里的东西`);const c=CATCHES[x.type];assert.ok(x.kg>=c.w[0]&&x.kg<=c.w[1]);}}
 const share=(w,type)=>{let n=0,all=0;for(let seed=1;seed<=30;seed++)for(const x of scenario(seed).waters[w]){all++;if(x.type===type)n++;}return n/all;};
 assert.ok(share('shallow','crucian')>.55,'浅水多是鲫鱼');assert.ok(share('reeds','perch')>.4,'芦苇边鲈鱼多');assert.ok(share('deep','big')>.3,'深潭大青鱼多');assert.equal(share('shallow','chest'),0,'宝箱只在深潭');assert.ok(share('deep','chest')>0);
 assert.ok(catchPoints('carp',3)>catchPoints('carp',2),'越重越值钱');assert.ok(catchPoints('boot',2.5)<10,'杂物几乎不值钱');assert.ok(catchPoints('chest',7)>catchPoints('big',4));
 // 咬口快慢：浅水比深潭快（同样不动）
 const biteTime=w=>{let sum=0;for(const seed of [1,2,3,4,5,6]){const a=new Angler({id:'t',scenario:scenario(seed)});castTo(a,SPOT[w]);let t=0;while(a.phase!=='bite'&&t<40){a.setPose(0,0);a.tick(dt,{});a.events.length=0;t+=dt;}sum+=t;}return sum/6;};
 assert.ok(biteTime('shallow')<biteTime('deep'),'浅水咬口更快');
});

test('诱鱼：对路的节奏咬得更快；抬早会吓退；杂物不挑节奏', ()=>{
 const timeTo=(type,pattern)=>{const a=new Angler({id:'a',scenario:only(type,1)});castTo(a,SPOT.open);let t=0;while(a.phase!=='bite'&&t<30){a.setPose(pattern(t),0);a.tick(dt,{});a.events.length=0;t+=dt;}return t;};
 const drag=t=>6*Math.sin(t*2*Math.PI/2.4),twitch=t=>{const ph=t%.9;return ph<.12?ph/.12*7:ph<.4?7*(1-(ph-.12)/.28):0;};
 assert.ok(timeTo('crucian',drag)<timeTo('crucian',twitch),'鲫鱼爱缓拖');assert.ok(timeTo('perch',twitch)<timeTo('perch',drag),'鲈鱼爱轻抽');
 assert.ok(Math.abs(timeTo('boot',drag)-timeTo('boot',twitch))<.6,'杂物不挑节奏');
});

test('刺鱼：咬钩窗口内抬竿 ≥12° 才算；小抬不算；抬早会吓退鱼；错过窗口鱼会离开，冷却后再来', ()=>{
 const toBite=(seed=2)=>{const a=new Angler({id:'a',scenario:scenario(seed)});castTo(a,SPOT.shallow);let t=0;while(a.phase!=='bite'&&t<20){a.setPose(6*Math.sin(t*2*Math.PI/2.4),0);a.tick(dt,{});a.events.length=0;t+=dt;}a.setPose(0,0);return a;};
 const a=toBite();assert.equal(a.phase,'bite');assert.equal(a.biteWindow,FISHING.bite.window);const ev=run(a,.3,(x,t)=>x.setPose(Math.min(18,t*90),0));assert.equal(a.phase,'fight');const hook=ev.find(e=>e.kind==='hook');assert.ok(hook);assert.ok(hook.name&&hook.kg>0&&hook.points>0,'中鱼就知道是什么、多重');
 const b=toBite();run(b,.25,(x,t)=>x.setPose(Math.min(8,t*60),0));assert.equal(b.phase,'bite','8° 小抬不算刺鱼');const miss=run(b,1,x=>x.setPose(8,0));assert.equal(b.phase,'lure');assert.ok(miss.some(e=>e.kind==='miss'));
 const back=run(b,FISHING.approach.missCooldown+.2,(x,t)=>x.setPose(6*Math.sin(t*2*Math.PI/2.4),0));assert.ok(back.some(e=>e.kind==='fish_near'),'冷却后鱼再来');
 const c=new Angler({id:'c',scenario:scenario(2)});castTo(c,SPOT.shallow);let t=0;while(!(c.fish&&c.fish.A>.5)&&t<20){c.setPose(6*Math.sin(t*2*Math.PI/2.4),0);c.tick(dt,{});c.events.length=0;t+=dt;}const A=c.fish.A;const sp=run(c,.3,(x,u)=>x.setPose(Math.min(22,u*110),0));assert.ok(sp.some(e=>e.kind==='spook'));assert.ok(c.fish.A<A-.3,'抬早了，鱼退开');
 const d=toBite(4);d.hook();d.tick(dt,{});assert.equal(d.phase,'fight','触控 / 键盘的显式抬竿');
});

test('收线：四片水域都能用合法操作钓上来，耗时按重量；同样的操作得到同样的结果', ()=>{
 const times={};
 for(const [w,spot] of Object.entries(SPOT)){const a=new Angler({id:w,scenario:scenario(4)});const {results}=fishFor(a,{target:spot,seconds:90});const landed=results.filter(r=>r.kind==='landed');
  assert.ok(landed.length>=2,`${w} 90 秒能钓上 2 条以上`);assert.deepEqual(results.filter(r=>r.kind==='lost'),[],`${w} 合理操作不丢鱼`);for(const r of landed)(times[r.type]??=[]).push(r.fight);}
 const avg=k=>times[k].reduce((s,v)=>s+v,0)/times[k].length;
 assert.ok(avg('crucian')<6,'鲫鱼几秒就上来');assert.ok(times.big&&avg('big')>15&&avg('big')<45,'大青鱼要拉一阵');assert.ok(avg('crucian')<avg('carp'));
 const once=()=>JSON.stringify(fishFor(new Angler({id:'x',scenario:scenario(8)}),{target:SPOT.open,seconds:60}).results);assert.equal(once(),once(),'确定性');
});

test('逃掉的原因都能解释：冲刺时硬收会断线；不冲时停手太久会脱钩；不往反方向倾会缠住；线放光；剪线换下一条', ()=>{
 const greedy=fishFor(new Angler({id:'g',scenario:only('big',6)}),{target:SPOT.deep,seconds:60,greedy:true}).results;assert.ok(greedy.some(r=>r.reason==='break'),'冲刺时一直收会断线');
 const calm=fishFor(new Angler({id:'c',scenario:only('big',6)}),{target:SPOT.deep,seconds:60}).results;assert.ok(calm.some(r=>r.kind==='landed'),'冲刺时停手就能拉上来');
 const lazy=hooked(only('crucian',.4),SPOT.shallow);const ev=run(lazy,8,x=>x.setPose(5,0,0));assert.ok(ev.some(e=>e.kind==='lost'&&e.reason==='unhook'),'一直不收线会脱钩');
 const side=fishFor(new Angler({id:'s',scenario:only('perch',1.2)}),{target:SPOT.reeds,seconds:40,lean:false}).results;assert.ok(side.some(r=>r.reason==='weed'),'鲈鱼往水草钻，不倾竿会缠住');
 const leaned=fishFor(new Angler({id:'l',scenario:only('perch',1.2)}),{target:SPOT.reeds,seconds:40}).results;assert.ok(!leaned.some(r=>r.reason==='weed'),'往反方向倾就不会缠住');
 const far=hooked(only('big',7),SPOT.deep);Object.assign(far.fight,{D:33.6,behavior:'dash',timer:2});const out=run(far,1,x=>x.setPose(5,0,0));assert.ok(out.some(e=>e.kind==='lost'&&e.reason==='runaway'),'线放光了');
 const junk=hooked(scenario(1),SPOT.shallow),w=junk.zone,before=junk.next[w];junk.abandon();assert.equal(junk.phase,'lost');assert.equal(junk.lostReason,'abandon');assert.equal(junk.next[w],before+1,'剪线后换下一个，不会又钩到同一只靴子');
 // 单帧尖峰不会直接断线
 const spike=hooked(only('carp',2),SPOT.open);spike.fight.T=1.2;run(spike,dt*3,x=>x.setPose(5,0,1));assert.equal(spike.phase,'fight');
});

test('黄金矿工式收线：越重收得越慢；转得越快收得越快（有上限）；冲刺时收不动；离岸 1.2 米上岸，按重量计分', ()=>{
 const landTime=(type,kg,crank)=>{const a=hooked(only(type,kg),SPOT.open);a.fight.D=14;let t=0;while(a.phase==='fight'&&t<60){a.setPose(5,0,crank);a.tick(dt,{});t+=dt;}return {t,a};};
 const can=landTime('can',.8,2.5),chest=landTime('chest',8,2.5);assert.equal(can.a.phase,'landed');assert.equal(chest.a.phase,'landed');
 const ratio=chest.t/can.t;assert.ok(ratio>2&&ratio<3,`宝箱比罐头慢约 2.5 倍（${ratio.toFixed(2)}）`);
 assert.ok(landTime('can',.8,1.2).t>can.t*1.6,'转得慢收得慢');assert.ok(Math.abs(landTime('can',.8,10).t-landTime('can',.8,FISHING.reel.maxCrank).t)<.05,'转得再快也有上限');
 const c=chest.a.catches[0];assert.equal(c.kind,'treasure');assert.equal(c.kg,8);assert.equal(c.points,catchPoints('chest',8));assert.equal(chest.a.score,c.points);
 const big=hooked(only('big',6),SPOT.deep);Object.assign(big.fight,{behavior:'dash',timer:1,E:1});const D=big.fight.D;run(big,.3,x=>x.setPose(5,0,3));assert.ok(big.fight.D>=D,'冲刺时收线几乎没用，鱼还在往外跑');
});

test('瞄准与抛投：左右倾有死区和上限；力量 → 6–30 米单调；只在准备窗口里接受一次，5 秒超时', ()=>{
 assert.equal(aimFromRoll(1.5),0);assert.equal(aimFromRoll(40),50);assert.equal(aimFromRoll(-40),-50);assert.ok(aimFromRoll(10)>0&&aimFromRoll(10)<aimFromRoll(20));
 assert.equal(castDistance(0),6);assert.ok(Math.abs(castDistance(1)-30)<1e-9);assert.equal(castDistance(2),castDistance(1),'超过满力不再增加');for(let p=.1;p<=1;p+=.1)assert.ok(castDistance(p)>castDistance(p-.1));
 const a=new Angler({id:'a',scenario:scenario(1)});assert.equal(a.cast({power:.5}),false,'没准备不能抛');a.arm();assert.equal(a.phase,'armed');assert.equal(a.cast({power:.5,dir:30}),true);assert.equal(a.cast({power:.9}),false,'一次准备只抛一次');assert.ok(Math.abs(a.target.angle-8)<1e-9,'方向修正限 ±8°');
 const b=new Angler({id:'b',scenario:scenario(1)});b.arm();const ev=run(b,5.1);assert.equal(b.phase,'aim');assert.ok(ev.some(e=>e.kind==='arm_timeout'));
});

test('比赛：6 人同时钓、各自鱼池；整片湖都能钓；到时搏鱼中的可收尾 10 秒；暂停冻结、继续不自动拉鱼；名次按分数和条数', ()=>{
 const players=Array.from({length:6},(_,i)=>({id:'p'+i,name:'钓手'+(i+1)}));const m=new FishingMatch({players,roundSeconds:60,seed:9});
 assert.equal(m.anglers.length,6);assert.equal(m.open,undefined,'0.29 没有分轮开放的钓区');assert.equal(m.phase,'countdown');assert.equal(m.input('p0',{type:'arm'}),false,'倒计时中不能准备');
 for(let i=0;i<(FISHING.match.countdown+.1)/dt;i++)m.tick(dt);assert.equal(m.phase,'playing');
 const bots=m.anglers.map((a,i)=>new FishingBot(a,{target:i%2?SPOT.reeds:SPOT.shallow}));
 for(let i=0;i<20/dt;i++){for(const b of bots)b.step(dt);m.tick(dt);}m.events.length=0;
 m.pause('manual');const left=m.timeLeft,snap=JSON.stringify(m.snapshot().anglers.map(a=>a.fight&&a.fight.D));for(let i=0;i<120;i++){m.anglers[0].setPose(30,0);m.tick(dt);}assert.equal(m.timeLeft,left);assert.equal(JSON.stringify(m.snapshot().anglers.map(a=>a.fight&&a.fight.D)),snap,'暂停时鱼和线不动');
 m.resume();assert.equal(m.phase,'resuming');assert.equal(m.anglers[0].lift(),false,'继续时清空动作缓存');for(let i=0;i<2/dt;i++)m.tick(dt);assert.equal(m.phase,'playing');
 const both=new Set();for(let i=0;i<200/dt&&m.phase!=='over';i++){if(m.active)for(const b of bots)b.step(dt);else for(const a of m.anglers)a.setPose(0,0);m.tick(dt);for(const e of m.events.splice(0))both.add(e.kind);}
 assert.equal(m.phase,'over');for(const k of ['go','time_up','round_end','round','over','landed'])assert.ok(both.has(k),k);
 const s=m.standings();assert.equal(s.length,6);for(let i=1;i<6;i++)assert.ok(s[i].score<s[i-1].score||s[i].score===s[i-1].score&&s[i].count<=s[i-1].count);
 assert.ok(s.every(x=>x.score===x.catches.reduce((n,c)=>n+c.points,0)),'总分 = 逐鱼明细之和');
 const first=m.scenario.waters.shallow[0].seed,landedSlot0=m.anglers.filter(a=>a.catches.some(c=>c.zone==='shallow'&&c.slot===0));assert.ok(landedSlot0.length>=2,'不同钓手都能钓到同一个鱼槽（独立鱼池）');assert.ok(first);
});

test('收尾：到时已刺中的鱼还能在 10 秒内上岸计分；超过收尾时间放回不计分', ()=>{
 const m=new FishingMatch({players:[{id:'a'},{id:'b'}],roundSeconds:60,seed:3});m.phase='playing';m.timeLeft=.02;
 const [a,b]=m.anglers;for(const x of [a,b]){castTo(x,SPOT.shallow);let t=0;while(x.phase!=='bite'&&t<20){x.setPose(6*Math.sin(t*2*Math.PI/2.4),0);x.tick(dt,{});x.events.length=0;t+=dt;}run(x,.3,(y,u)=>y.setPose(Math.min(18,u*90),0));assert.equal(x.phase,'fight');}
 Object.assign(a.fight,{D:2,E:.1,behavior:'tired',timer:99,dashLeft:0});Object.assign(b.fight,{D:30,E:.2,behavior:'tired',timer:99,dashLeft:0});
 m.tick(dt);m.tick(dt);assert.equal(m.phase,'finishing');for(let i=0;i<11/dt&&m.phase==='finishing';i++){a.setPose(5,0,2.5);b.setPose(5,0,.4);m.tick(dt);}
 assert.ok(a.score>0&&a.score===a.catches[0].points,'收尾内上岸计分');assert.equal(b.score,0);assert.ok(b.losses.some(l=>l.reason==='timeup'),'收尾超时放回');assert.equal(m.phase,'intermission');
 // 同分：条数多的在前；完全相同则并列。
 const t=new FishingMatch({players:[{id:'x'},{id:'y'},{id:'z'}],seed:1});const [x,y,z]=t.anglers;x.score=400;x.catches=[{points:400,size:70}];y.score=400;y.catches=[{points:200,size:30},{points:200,size:30}];z.score=400;z.catches=[{points:400,size:70}];
 const st=t.standings();assert.equal(st[0].id,'y');assert.equal(st[1].rank,2);assert.equal(st[2].rank,2,'并列');
});

test('手机鱼竿输入：静止 0.6 秒归零；竿姿相对基准；转屏或断流要重新归零；抛投识别轻 / 中 / 重并拒绝无效动作', ()=>{
 const m=new RodMapper();let t=0,r;for(;t<=500;t+=16)r=m.sample(30,0,t);assert.equal(r.ready,false);for(;t<=700;t+=16)r=m.sample(30,0,t);assert.equal(r.ready,true);
 for(let i=0;i<30;i++,t+=16)r=m.sample(45,8,t);assert.ok(Math.abs(r.pitch-(15-1.5))<1.2,`抬竿 ${r.pitch.toFixed(1)}°`);assert.ok(r.roll>4);
 assert.equal(m.sample(45,8,t+16,90).ready,false,'转屏撤销基准');const m2=new RodMapper();for(let k=0;k<=700;k+=16)m2.sample(30,0,k);assert.equal(m2.sample(30,0,1300).ready,false,'断流撤销基准');
 assert.ok(Math.abs(rodAngles(30,0).pitch-30)<1e-9);assert.ok(Math.abs(rodAngles(0,20).roll-20)<1e-9);
 const swing=(back,speed,{hold=120,roll=0}={})=>{const d=new CastDetector();d.arm();let time=0,res=null;const push=(p,rl=0)=>{const out=d.sample(p,rl,time);time+=16;if(out)res=out;};
  for(let i=0;i<10;i++)push(0);const up=Math.ceil(back/120*1000/16);for(let i=1;i<=up;i++)push(back*i/up);for(let k=0;k<hold/16;k++)push(back);const down=Math.max(2,Math.ceil((back+10)/speed*1000/16));for(let i=1;i<=down;i++)push(back-(back+10)*i/down,roll*i/down);for(let i=0;i<6;i++)push(-10,roll);return res;};
 const light=swing(20,160),mid=swing(40,300),heavy=swing(60,480);assert.ok(light.power<mid.power&&mid.power<heavy.power,`力量 ${light.power} < ${mid.power} < ${heavy.power}`);assert.ok(heavy.power>.85&&light.power<.3);
 assert.ok(swing(40,300,{roll:20}).dir>0,'前挥时右倾修正向右');assert.ok(Math.abs(swing(40,300,{roll:60}).dir)<=8);
 assert.equal(swing(8,300),null,'没有后引不抛');assert.equal(swing(40,60).reject,'weak');assert.equal(swing(40,300,{hold:1600}).reject,'slow');
 const d=new CastDetector();d.arm();let time=0,count=0;for(let rep=0;rep<2;rep++){for(let i=0;i<10;i++){if(d.sample(0,0,time)?.power!==undefined)count++;time+=16;}for(let i=1;i<=20;i++){if(d.sample(40*i/20,0,time)?.power!==undefined)count++;time+=16;}for(let i=1;i<=6;i++){if(d.sample(40-50*i/6,0,time)?.power!==undefined)count++;time+=16;}for(let i=0;i<5;i++){if(d.sample(-10,0,time)?.power!==undefined)count++;time+=16;}}
 assert.equal(count,1,'一次准备只认一次');const off=new CastDetector();assert.equal(off.sample(40,0,0),null,'没准备时不识别');
});

test('0.28.1 钓鱼网关：网络抖一下后能继续；中场断线的手机让第二轮暂停；电脑可以“不等 xP，继续”，回来后归队', async()=>{
 const {FishingChannel}=await import('../local-gateway/fishing-channel.js');
 let now=0;const clients=new Set(),mk=(role,id)=>{const ws={role,clientId:id,out:[]};clients.add(ws);return ws;};
 const ch=new FishingChannel(clients,(ws,m)=>ws.out.push(m),{now:()=>now,autoTick:false});
 const host=mk('screen','pc');ch.handle(host,{type:'fish_view',active:true});
 const A=mk('phone','A'),B=mk('phone','B');for(const p of [A,B]){ch.connected(p);ch.handle(p,{type:'fish_join',join:true});ch.handle(p,{type:'fish_ready',ready:true,source:'touch'});}
 let quietB=false;const run=sec=>{for(let i=0;i<sec*60;i++){now+=1000/60;if(i%2===0){ch.handle(A,{type:'fish_pose',pitch:0,roll:0});if(!quietB&&clients.has(B))ch.handle(B,{type:'fish_pose',pitch:0,roll:0});}ch.tick(now);}};
 ch.command('start',null);run(5);assert.equal(ch.match.phase,'playing');
 quietB=true;run(.7);quietB=false;assert.equal(ch.match.phase,'paused');assert.equal(ch.match.pauseReason,'stream_gap');
 run(1);assert.deepEqual(ch.waiting(),[],'竿姿恢复后不用重新就绪');ch.command('resume',null);run(2);assert.equal(ch.match.phase,'playing');
 // 第一轮结束 → 中场时 B 断线 → 第二轮倒数时暂停，不会扔下 B 开打
 ch.match.timeLeft=.05;run(.5);for(let i=0;i<40&&ch.match.phase!=='intermission';i++)run(.5);assert.equal(ch.match.phase,'intermission');
 clients.delete(B);ch.disconnected?.(B);run(8);assert.equal(ch.match.phase,'paused','第二轮开始前发现 B 不在');assert.deepEqual(ch.waiting(),[1]);
 assert.throws(()=>ch.command('skip',1),/电脑/);ch.command('skip',null);run(4);assert.equal(ch.match.phase,'playing','不等 2P 继续');assert.equal(ch.match.angler('B').phase,'done');
 const pausedAgain=ch.match.phase;run(1);assert.equal(ch.match.phase,pausedAgain,'B 不在也不会再暂停');
 // B 回来就绪后归队
 clients.add(B);ch.connected(B);ch.handle(B,{type:'fish_ready',ready:true,source:'touch'});run(.2);assert.equal(ch.match.angler('B').phase,'aim');
});
