import test from 'node:test';
import assert from 'node:assert/strict';
import {SwingMotion,SwingReplay,traceReplay,planSwing,swingGoal,FOLLOW_PHASES} from '../screen-web/swing-motion.js';
import {swingPose} from '../screen-web/golfer.js';
import {swingKin,motionSample} from '../shared/training.js';

// 手机时间与电脑时间相差 5000 毫秒，网络延迟 20–60 毫秒。
function feed(motion,points,{offset=5000,jitter=[20,60]}={}){let k=0;for(const [t,u,phase] of points){const lag=jitter[0]+(k++%5)/4*(jitter[1]-jitter[0]);motion.push({t,u,phase},t+offset+lag);}}
test('小人时间线：按手机时间排序插值，延迟约 90 毫秒平滑播放；断流后不再实时跟随',()=>{
 const m=new SwingMotion(),T=20000;const pts=[];for(let t=0;t<=1000;t+=40)pts.push([T+t,Math.min(1,t/800),'back']);feed(m,pts);
 assert.equal(m.offset,5020,'偏移取最小到达延迟');assert.ok(m.live(T+1000+5060));assert.equal(m.live(T+1000+5020+800),false);
 const v=m.value(T+500+5020+90);assert.ok(Math.abs(v-500/800)<.01,'按手机时间插值 '+v);assert.equal(m.at(T-100),0);assert.equal(m.at(T+5000),1);
 m.push({t:T+420,u:.9},T+6000);assert.ok(m.samples.findIndex(p=>p.t===T+420)>0,'乱序到达的样本按时间插入');
 m.push({t:10,u:0},T+9000);assert.equal(m.samples.length,1,'手机页面刷新后时间戳重新开始则重置');
});
test('击球：插入手机发来的 25 Hz 轨迹，按“球杆回到站位”的时刻算出本地起飞时间；慢放最近一杆',()=>{
 const m=new SwingMotion();const pts=[];for(let t=0;t<=1200;t+=80)pts.push([t,t<700?t/700:Math.max(-1,1-(t-700)/150),'x']);feed(m,pts,{jitter:[30,30]});
 const u=[];for(let i=0;i<=30;i++){const t=i*40;u.push(t<=760?t/760:Math.max(-1,1-(t-760)/120));}
 const kin=swingKin({t0:0,dt:40,u,impactAt:820,now:1200,top:150,topU:1});assert.ok(kin);
 const impact=m.insertTrace(kin);assert.equal(impact,880,'峰值后第一次回到站位');assert.equal(m.impactLocal(kin),880+5030+90);
 assert.ok(m.samples.filter(p=>p.phase==='trace').length===u.length);assert.ok(m.samples.every((p,i)=>!i||p.t>m.samples[i-1].t));
 const last=m.lastSwing(1200+5030+500);assert.ok(last&&last.points.length>=10&&last.points[0].t===150,'从上杆前 150 毫秒开始');assert.ok(Math.abs(last.impact-(880+150))<1e-9);
 const replay=new SwingReplay(last.points,{speed:.5,start:0});assert.ok(replay.duration>=last.points.at(-1).t*2-1e-6);assert.ok(Math.abs(replay.value(0)-last.points[0].u)<1e-9);assert.equal(replay.done(replay.duration+700),true);
 assert.equal(swingKin({t0:0,dt:40,u:[0,1],impactAt:0}),null,'轨迹太短无效');assert.equal(swingKin({t0:0,dt:40,u:[0,2,3],impactAt:0}),null,'越界无效');
});
test('击球计划：实时跟随 → 继续跟随并对齐起飞；只有轨迹 → 从上杆顶点回放；电脑输入 → 按力度的固定动画',()=>{
 const kin={t0:0,dt:40,u:Array.from({length:30},(_,i)=>i<20?i/19:Math.max(-1,1-(i-19)/3)),impactAt:800};
 const live=new SwingMotion();feed(live,[[0,0],[400,.5],[780,1],[1150,-1]],{jitter:[30,30]});const now=1150+5030+20,plan=planSwing(live,{source:'phone',kin,now});
 assert.equal(plan.mode,'live');assert.ok(plan.impact>=0&&plan.impact<300,'起飞时刻 '+plan.impact);assert.equal(swingGoal(plan,0,live,now),live.value(now));
 const quiet=new SwingMotion(),replay=planSwing(quiet,{source:'phone',kin,now:1000});assert.equal(replay.mode,'replay');assert.ok(replay.impact>0&&replay.impact<400);assert.ok(Math.abs(swingGoal(replay,0,quiet,1000)-kin.u[17])<.06,'从上杆顶点附近开始');assert.ok(swingGoal(replay,0,quiet,1000+replay.replay.duration)<=-.95,'补齐到收杆');
 const canned=planSwing(quiet,{source:'screen',power:.3});assert.equal(canned.mode,'canned');assert.equal(canned.impact,540);const peak=Math.max(...Array.from({length:40},(_,i)=>swingGoal(canned,i*30,quiet)));assert.ok(peak>.45&&peak<.6,'30% 力度上杆到约一半：'+peak);
 assert.ok(FOLLOW_PHASES.has('flight')&&!FOLLOW_PHASES.has('moving'));
 const tr=traceReplay({t0:0,dt:40,u:[0,.5,1,.2]},{start:0});assert.equal(tr.value(tr.duration),-1);
});
test('小人姿势：关键姿势之间平滑连续，站位与原来一致，上杆到顶点时球杆越过头顶指向目标方向',()=>{
 const address=swingPose(0);assert.ok(address.hand.distanceTo({x:0,y:1.03,z:.65})<1e-9);assert.ok(address.dir.y<-.7,'站位杆头朝下指向球');
 let prev=swingPose(-1.05);for(let u=-1.04;u<=1.12;u+=.01){const p=swingPose(u);assert.ok(Math.abs(p.dir.length()-1)<1e-6);assert.ok(p.hand.distanceTo(prev.hand)<.06,'双手连续 u='+u.toFixed(2));assert.ok(p.dir.angleTo(prev.dir)<.35,'杆身连续 u='+u.toFixed(2));prev=p;}
 const waist=swingPose(.4),top=swingPose(1),finish=swingPose(-1);assert.ok(waist.dir.x>.9,'腰高：杆身水平指向后方');assert.ok(top.hand.y>1.8&&top.dir.x<-.5,'顶点：双手过肩，杆身指向目标');assert.ok(finish.hand.x<-.3&&finish.hand.y>1.8,'收杆在目标一侧高处');
 assert.ok(swingPose(5).hand.distanceTo(swingPose(1.12).hand)<1e-9,'超出范围时夹紧');
});
test('传感器样本携带小人姿势：时间戳、u、弧度与阶段通过校验，越界值丢弃',()=>{
 const base={alpha:1,beta:2,gamma:3,axis:'auto',state:'idle',stage:'ready',tilt:0,hz:60};
 const ok=motionSample({...base,t:1234.6,u:.51234,arc:88.04,phase:'back'});assert.equal(ok.t,1235);assert.equal(ok.u,.512);assert.equal(ok.arc,88);assert.equal(ok.phase,'back');
 const bad=motionSample({...base,t:5,u:9,phase:'jump'});assert.equal(bad.u,undefined);assert.equal(bad.phase,undefined);assert.equal(motionSample({...base,t:5,u:.2,phase:'jump'}).phase,undefined);
});
