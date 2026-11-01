import test from 'node:test';
import assert from 'node:assert/strict';
import {FISHING,ZONES,FISH,WEEDS,scenario,zoneById,zoneFrame,polar,castDistance,aimFromRoll,inWeeds,zonesOpen} from '../shared/fishing/rules.js';
import {Angler} from '../shared/fishing/angler.js';
import {FishingMatch} from '../shared/fishing/match.js';
import {RodMapper,CastDetector,rodAngles} from '../shared/fishing/input.js';
import {FishingBot,fishFor,rollFor,powerFor} from './fishing-bot.js';
const dt=FISHING.step,run=(a,seconds,fn=()=>{},ctx={})=>{const out=[];for(let i=0;i<Math.round(seconds/dt);i++){fn(a,i*dt);a.tick(dt,ctx);out.push(...a.events.splice(0));}return out;};
const castInto=(a,zone,{power}={})=>{const z=zoneById(zone);a.setPose(0,rollFor(z.angle));run(a,.6,x=>x.setPose(0,rollFor(z.angle)));assert.equal(a.arm(),true);assert.equal(a.cast({power:power??powerFor(z.distance)}),true);run(a,a.flightTime+.05,x=>x.setPose(0,rollFor(z.angle)));};

test('湖面：三个钓区的距离与 PRD 一致，芦苇口入口留出清水，赛题固定且每区 6 个鱼槽', ()=>{
 const d=Object.fromEntries(ZONES.map(z=>[z.id,z.distance]));assert.ok(d.shallow>=6&&d.shallow<=12);assert.ok(d.reeds>=12&&d.reeds<=20);assert.ok(d.deep>=22&&d.deep<=30);
 const f=zoneFrame(zoneById('reeds'));for(const r of [-1.6,0,1.6])assert.equal(inWeeds(f.at(r,0).x,f.at(r,0).z),false,'入口约 4 米宽的清水');assert.ok(WEEDS.length>=3);
 const a=scenario(5),b=scenario(5),c=scenario(6);assert.deepEqual(a,b);assert.notDeepEqual(a,c);for(const z of ZONES){assert.equal(a.zones[z.id].length,6);assert.ok(a.zones[z.id].every(s=>s.type===z.fish));}
 assert.deepEqual(zonesOpen(1,false),['shallow','reeds']);assert.deepEqual(zonesOpen(2,false),['shallow','reeds','deep']);assert.deepEqual(zonesOpen(1,true),['shallow','reeds','deep']);
 assert.equal(FISH.small.points,100);assert.equal(FISH.perch.points,220);assert.equal(FISH.big.points,400);
});

test('瞄准与抛投：左右倾有死区和上限；力量 → 6–30 米单调；只在准备窗口里接受一次，5 秒超时', ()=>{
 assert.equal(aimFromRoll(1.5),0);assert.equal(aimFromRoll(40),50);assert.equal(aimFromRoll(-40),-50);assert.ok(aimFromRoll(10)>0&&aimFromRoll(10)<aimFromRoll(20));
 assert.equal(castDistance(0),6);assert.ok(Math.abs(castDistance(1)-30)<1e-9);assert.equal(castDistance(2),castDistance(1),'超过满力不再增加');for(let p=.1;p<=1;p+=.1)assert.ok(castDistance(p)>castDistance(p-.1));
 const a=new Angler({id:'a',scenario:scenario(1)});assert.equal(a.cast({power:.5}),false,'没准备不能抛');a.arm();assert.equal(a.phase,'armed');assert.equal(a.cast({power:.5,dir:30}),true);assert.equal(a.cast({power:.9}),false,'一次准备只抛一次');assert.ok(Math.abs(a.target.angle-8)<1e-9,'方向修正限 ±8°');
 const b=new Angler({id:'b',scenario:scenario(1)});b.arm();const ev=run(b,5.1);assert.equal(b.phase,'aim');assert.ok(ev.some(e=>e.kind==='arm_timeout'));
});

test('诱鱼：节奏对路咬钩更快；没鱼的位置 5 秒内提示换位置；没开放的钓区和水草也会说明', ()=>{
 const time=(zone,wave)=>{const a=new Angler({id:'a',scenario:scenario(3)});castInto(a,zone);let t=0;while(a.phase==='lure'&&t<30){a.setPose(wave(t),0);a.tick(dt,{});a.events.length=0;t+=dt;}return {t,phase:a.phase};};
 const drag=t=>6*Math.sin(t*2*Math.PI/2.4),twitch=t=>{const p=t%.9;return p<.12?p/.12*7:p<.4?7*(1-(p-.12)/.28):0;},still=()=>0;
 const sd=time('shallow',drag),st=time('shallow',twitch),ss=time('shallow',still);assert.equal(sd.phase,'bite');assert.ok(sd.t>=2.5&&sd.t<=7,`小鱼缓拖 ${sd.t.toFixed(1)} 秒咬钩`);assert.ok(st.t>sd.t+1,'小鱼不爱轻抽');assert.ok(ss.t>sd.t);
 const pt=time('reeds',twitch),pd=time('reeds',drag);assert.ok(pt.t<pd.t-1,`鲈鱼轻抽 ${pt.t.toFixed(1)} 秒 / 缓拖 ${pd.t.toFixed(1)} 秒`);
 const a=new Angler({id:'a',scenario:scenario(1)});a.setPose(0,0);a.arm();a.cast({power:.15});run(a,a.flightTime+.05);assert.equal(a.zone,null);const ev=run(a,5);assert.ok(ev.some(e=>e.kind==='empty'&&e.reason==='none'));
 const c=new Angler({id:'c',scenario:scenario(1)});castInto(c,'deep');const ce=run(c,5,x=>x.setPose(0,0),{open:['shallow','reeds']});assert.ok(ce.some(e=>e.kind==='empty'&&e.reason==='closed'),'第一轮深水未开放');
 const w=new Angler({id:'w',scenario:scenario(1)}),bed=WEEDS[2],p=Math.hypot(bed.x,bed.z),ang=Math.atan2(bed.x,-bed.z)*180/Math.PI;w.setPose(0,rollFor(ang));run(w,.6,x=>x.setPose(0,rollFor(ang)));w.arm();w.cast({power:powerFor(p)});run(w,w.flightTime+.05,x=>x.setPose(0,rollFor(ang)));assert.ok(run(w,1.2).some(e=>e.kind==='empty'&&e.reason==='weeds'));
});

test('刺鱼：咬钩窗口内抬竿 ≥12° 才算；小抬不算；抬早会吓退鱼；错过窗口鱼会离开，冷却后再来', ()=>{
 const toBite=(seed=2)=>{const a=new Angler({id:'a',scenario:scenario(seed)});castInto(a,'shallow');let t=0;while(a.phase!=='bite'&&t<20){a.setPose(6*Math.sin(t*2*Math.PI/2.4),0);a.tick(dt,{});a.events.length=0;t+=dt;}a.setPose(0,0);return a;};
 const a=toBite();assert.equal(a.phase,'bite');assert.equal(a.biteWindow,FISHING.bite.window);const ev=run(a,.3,(x,t)=>x.setPose(Math.min(18,t*90),0));assert.equal(a.phase,'fight');assert.ok(ev.some(e=>e.kind==='hook'));
 const b=toBite();run(b,.25,(x,t)=>x.setPose(Math.min(8,t*60),0));assert.equal(b.phase,'bite','8° 小抬不算刺鱼');const miss=run(b,1,x=>x.setPose(8,0));assert.equal(b.phase,'lure');assert.ok(miss.some(e=>e.kind==='miss'));
 const back=run(b,FISHING.approach.missCooldown+.2,(x,t)=>x.setPose(6*Math.sin(t*2*Math.PI/2.4),0));assert.ok(back.some(e=>e.kind==='fish_near'),'冷却后鱼再来');
 const c=new Angler({id:'c',scenario:scenario(2)});castInto(c,'shallow');let t=0;while(!(c.fish&&c.fish.A>.5)&&t<20){c.setPose(6*Math.sin(t*2*Math.PI/2.4),0);c.tick(dt,{});c.events.length=0;t+=dt;}const A=c.fish.A;const sp=run(c,.3,(x,u)=>x.setPose(Math.min(20,u*100),0));assert.ok(sp.some(e=>e.kind==='spook'));assert.ok(c.fish.A<A-.3,'抬早了，鱼退开');
 const d=toBite(4);d.hook();d.tick(dt,{});assert.equal(d.phase,'fight','触控 / 键盘的显式抬竿');
});

test('搏鱼：三类鱼都能用合法操作钓上来，耗时符合 PRD 目标；同样的操作得到同样的结果', ()=>{
 const target={shallow:[12,24],reeds:[20,38],deep:[35,55]};
 for(const zone of ['shallow','reeds','deep']){const a=new Angler({id:'a',scenario:scenario(11)}),{results}=fishFor(a,{zone,seconds:120});const ok=results.filter(r=>r.kind==='landed');assert.ok(ok.length>=2,`${zone} 钓上 ${ok.length} 条`);assert.equal(results.filter(r=>r.kind==='lost').length,0,`${zone} 不该逃鱼`);const avg=ok.reduce((s,r)=>s+r.total,0)/ok.length;assert.ok(avg>=target[zone][0]&&avg<=target[zone][1],`${zone} 平均一条 ${avg.toFixed(1)} 秒`);}
 const once=()=>{const a=new Angler({id:'a',scenario:scenario(4)});return fishFor(a,{zone:'reeds',seconds:60}).events.map(e=>`${e.kind}@${e.t.toFixed(3)}`).join(',');};assert.equal(once(),once());
});

const hooked=(zone,seed=8)=>{const a=new Angler({id:'a',scenario:scenario(seed)}),bot=new FishingBot(a,{zone});let t=0;while(a.phase!=='fight'&&t<40){bot.step(dt);a.tick(dt,{});a.events.length=0;t+=dt;}assert.equal(a.phase,'fight');return a;};
test('逃鱼的三种原因都可解释：一直硬拉会断线、竿放太低太久会脱钩、鲈鱼钻进水草；单帧尖峰不会直接失败', ()=>{
 const a=hooked('deep');const ev=run(a,30,x=>x.setPose(25,0));const lost=ev.find(e=>e.kind==='lost');assert.equal(lost?.reason,'break','大鱼冲刺时一直高抬会断线');assert.match(lost.text,/硬拉/);
 const b=hooked('shallow');const eb=run(b,12,(x,t)=>x.setPose(t<.8?20:-20,0));assert.equal(eb.find(e=>e.kind==='lost')?.reason,'unhook','竿一直放很低会脱钩');
 const c=hooked('reeds');const ec=run(c,40,x=>x.setPose(6,x.fight?Math.sign(x.fight.lat||1)*-25:0));const lc=ec.find(e=>e.kind==='lost');assert.equal(lc?.reason,'weed','往反方向乱侧拉，鲈鱼钻进水草');assert.ok(ec.some(e=>e.kind==='weed_warn'),'进水草前先警告');
 const d=hooked('shallow');run(d,1,x=>x.setPose(5,0));d.setPose(40,0);d.tick(dt,{});d.setPose(5,0);run(d,1,x=>x.setPose(5,0));assert.equal(d.phase,'fight','一帧的猛抬不会断线');
});

test('收线约束：没有先抬竿拉鱼，光放竿收不回线；高频抖腕不比正常抬放更快；上岸要同时满足距离、体力、张力', ()=>{
 const a=hooked('shallow');a.fight.behavior='swim';a.fight.timer=99;const D0=a.fight.D;run(a,2,(x,t)=>x.setPose(10-t*10,0));assert.ok(a.fight.D>=D0-.05,'只放竿不会拉近');
 const pump=hooked('shallow',3),jit=hooked('shallow',3);for(const x of [pump,jit]){x.fight.behavior='swim';x.fight.timer=99;x.fight.dashLeft=0;}
 const p0=pump.fight.D,j0=jit.fight.D;run(pump,4,(x,t)=>{const ph=t%1.4;x.setPose(ph<.7?ph/.7*20:20-(ph-.7)/.7*20,0);});run(jit,4,(x,t)=>x.setPose(10+10*Math.sign(Math.sin(t*2*Math.PI*8)),0));
 assert.ok(p0-pump.fight.D>j0-jit.fight.D,`正常抬放拉近 ${(p0-pump.fight.D).toFixed(1)} 米，抖腕 ${(j0-jit.fight.D).toFixed(1)} 米`);
 const c=hooked('shallow');Object.assign(c.fight,{D:1.2,E:.5,behavior:'tired',timer:99,dashLeft:0});run(c,1.5,x=>x.setPose(8,0));assert.equal(c.phase,'fight','体力还多，不能抄起');
 Object.assign(c.fight,{D:1.2,E:.1});const ev=run(c,1.5,x=>x.setPose(8,0));const land=ev.find(e=>e.kind==='landed');assert.ok(land,'满足条件 0.6 秒后抄起');assert.equal(land.catch.points,100);assert.equal(c.score,100);assert.ok(land.catch.catchId);
});

test('比赛：6 人同时钓、各自鱼池；第一轮不开深水；到时搏鱼中的可收尾 10 秒；暂停冻结、继续不自动拉鱼；名次按分数和条数', ()=>{
 const players=Array.from({length:6},(_,i)=>({id:'p'+i,name:'钓手'+(i+1)}));const m=new FishingMatch({players,roundSeconds:60,seed:9});
 assert.equal(m.anglers.length,6);assert.deepEqual(m.open,['shallow','reeds']);assert.equal(m.phase,'countdown');assert.equal(m.input('p0',{type:'arm'}),false,'倒计时中不能准备');
 for(let i=0;i<(FISHING.match.countdown+.1)/dt;i++)m.tick(dt);assert.equal(m.phase,'playing');
 const bots=m.anglers.map((a,i)=>new FishingBot(a,{zone:i%2?'reeds':'shallow'}));
 for(let i=0;i<20/dt;i++){for(const b of bots)b.step(dt);m.tick(dt);}m.events.length=0;
 m.pause('manual');const left=m.timeLeft,snap=JSON.stringify(m.snapshot().anglers.map(a=>a.fight&&a.fight.D));for(let i=0;i<120;i++){m.anglers[0].setPose(30,0);m.tick(dt);}assert.equal(m.timeLeft,left);assert.equal(JSON.stringify(m.snapshot().anglers.map(a=>a.fight&&a.fight.D)),snap,'暂停时鱼和线不动');
 m.resume();assert.equal(m.phase,'resuming');assert.equal(m.anglers[0].lift(),false,'继续时清空动作缓存');for(let i=0;i<2/dt;i++)m.tick(dt);assert.equal(m.phase,'playing');
 const both=new Set();for(let i=0;i<200/dt&&m.phase!=='over';i++){if(m.active)for(const b of bots)b.step(dt);else for(const a of m.anglers)a.setPose(0,0);m.tick(dt);for(const e of m.events.splice(0)){both.add(e.kind);if(e.kind==='landed'&&m.round===1)assert.notEqual(e.catch.zone,'deep');}}
 assert.equal(m.phase,'over');for(const k of ['go','time_up','round_end','round','over','landed'])assert.ok(both.has(k),k);
 const s=m.standings();assert.equal(s.length,6);for(let i=1;i<6;i++)assert.ok(s[i].score<s[i-1].score||s[i].score===s[i-1].score&&s[i].count<=s[i-1].count);
 assert.ok(s.every(x=>x.score===x.catches.reduce((n,c)=>n+c.points,0)),'总分 = 逐鱼明细之和');
 const first=m.scenario.zones.shallow[0].seed,landedSlot0=m.anglers.filter(a=>a.catches.some(c=>c.zone==='shallow'&&c.slot===0));assert.ok(landedSlot0.length>=2,'不同钓手都能钓到同一个鱼槽（独立鱼池）');assert.ok(first);
});

test('收尾：到时已刺中的鱼还能在 10 秒内上岸计分；超过收尾时间放回不计分', ()=>{
 const m=new FishingMatch({players:[{id:'a'},{id:'b'}],roundSeconds:60,seed:3});m.phase='playing';m.timeLeft=.02;
 const [a,b]=m.anglers;for(const x of [a,b]){castInto(x,'shallow');let t=0;while(x.phase!=='bite'&&t<20){x.setPose(6*Math.sin(t*2*Math.PI/2.4),0);x.tick(dt,{});x.events.length=0;t+=dt;}run(x,.3,(y,u)=>y.setPose(Math.min(18,u*90),0));assert.equal(x.phase,'fight');}
 Object.assign(a.fight,{D:1.3,E:.1,behavior:'tired',timer:99,dashLeft:0});Object.assign(b.fight,{D:12,E:1});
 m.tick(dt);m.tick(dt);assert.equal(m.phase,'finishing');for(let i=0;i<11/dt&&m.phase==='finishing';i++){a.setPose(8,0);b.setPose(8,0);m.tick(dt);}
 assert.equal(a.score,100,'收尾内上岸计分');assert.equal(b.score,0);assert.ok(b.losses.some(l=>l.reason==='timeup'),'收尾超时放回');assert.equal(m.phase,'intermission');
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
