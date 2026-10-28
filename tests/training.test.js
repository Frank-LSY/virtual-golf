import test from 'node:test';
import assert from 'node:assert/strict';
import {Training} from '../game-service/training.js';
import {TrainingChannel} from '../local-gateway/training-channel.js';
import {INPUT_DEFAULTS,inputSettings,TRAINING_CLUBS,trainingExport} from '../shared/training.js';
import {SwingDetector,mapSwing} from '../shared/swing.js';

test('training measures real simulated flight and signed landing errors for every club',()=>{
 for(const club of TRAINING_CLUBS){const t=new Training();t.configure({clubId:club.id,target:club.target});const {shot,report:r}=t.stroke({power:.65,dir:.1,seq:1},'screen','screen',null,100);
  assert.ok(shot.path.length>10);assert.equal(r.lateral,shot.to.x);assert.equal(r.longitudinal,shot.to.z-club.target);assert.equal(r.targetError,Math.hypot(r.lateral,r.longitudinal));assert.ok(r.roll>0);assert.ok(r.ballSpeed>0);assert.equal(r.peak,null);assert.equal(r.tempo,null);assert.equal(r.feedback.length,2);
  if(club.id==='putter'){assert.equal(r.carry,0);assert.equal(r.apex,0);assert.equal(r.launchAngle,.75);}else{assert.ok(r.carry>(club.id==='chip'?15:30));assert.ok(r.apex>(club.id==='chip'?3:5));assert.ok(r.travel>r.carry);assert.equal(r.launchAngle,2.5);}
  const mirrored=new Training();mirrored.configure({clubId:club.id,target:club.target});const left=mirrored.stroke({power:.65,dir:-.1,seq:1},'screen','screen',null,100).report;assert.ok(Math.abs(left.lateral+r.lateral)<1e-8);assert.ok(Math.abs(left.travel-r.travel)<1e-8);
 }
});
test('practice rejects malformed, duplicate and busy input without changing history',()=>{
 const t=new Training(),m={power:.5,dir:0,peak:400,backswingMs:450,downswingMs:150,seq:1};
 assert.throws(()=>t.stroke({...m,power:2},'p','phone',INPUT_DEFAULTS,100),/无效/);assert.throws(()=>t.stroke({...m,peak:Infinity},'p','phone',INPUT_DEFAULTS,100),/无效/);assert.equal(t.history.length,0);
 const {report:r}=t.stroke(m,'p','phone',INPUT_DEFAULTS,100);assert.equal(r.tempo,3);assert.equal(r.input.powerGain,1);
 assert.throws(()=>t.stroke(m,'p','phone',INPUT_DEFAULTS,200),/已经收到/);assert.throws(()=>t.stroke({...m,seq:2},'p','phone',INPUT_DEFAULTS,200),/运动/);assert.throws(()=>t.configure({clubId:'driver',target:220},200),/停稳/);assert.equal(t.history.length,1);
 t.configure({clubId:'driver',target:220},t.busyUntil+1);assert.equal(t.settings.clubId,'driver');assert.throws(()=>t.configure({clubId:'bad',target:20},t.busyUntil+1),/有效/);
 const exported=trainingExport(t.history)[0];assert.equal(exported['节奏比'],3);assert.equal(exported['手机灵敏度']['力量倍率'],1);assert.match(exported['训练反馈'][2],/3.00/);
});
test('sensitivity changes mapping monotonically, validates bounds, and preserves raw peak',()=>{
 const hit={peak:300,direction:18},cal={peakMax:600,dirZero:0},base=mapSwing(hit,cal);
 const boosted=mapSwing(hit,cal,{POWER_GAMMA:1.6,DIR_FULL_SCALE:45,POWER_GAIN:1.5,DIRECTION_GAIN:.5});assert.ok(boosted.power>base.power);assert.equal(boosted.dir,base.dir*.5);assert.equal(boosted.peak,300);
 const saturated=mapSwing(hit,cal,{POWER_GAMMA:1,DIR_FULL_SCALE:45,POWER_GAIN:10,DIRECTION_GAIN:10});assert.equal(saturated.power,1);assert.equal(saturated.dir,1);
 assert.deepEqual(inputSettings(INPUT_DEFAULTS),INPUT_DEFAULTS);for(const key of Object.keys(INPUT_DEFAULTS))for(const n of [NaN,Infinity,-1,1000])assert.throws(()=>inputSettings({...INPUT_DEFAULTS,[key]:n}));
});
test('tempo uses detector transitions and interruptions cannot reuse prior timings',()=>{
 const d=new SwingDetector();let hit;[0,150,180,100,90,-120,-300,-600,-500,-200].forEach((v,i)=>{hit=d.sample(v,0,i*40)||hit;});assert.equal(hit.backswingMs,160);assert.equal(hit.downswingMs,160);
 d.reset();d.sample(200,0,0);d.sample(-300,0,100);assert.equal(d.sample(0,0,900),null);assert.equal(d.state,'IDLE');
});
test('telemetry only reaches subscribed screens and tuning requires phone confirmation',()=>{
 const s={role:'screen',clientId:'s'},hidden={role:'screen',clientId:'h'},p={role:'phone',clientId:'p',calibrated:true};const clients=new Set([s,hidden,p]),messages=[];const ch=new TrainingChannel(clients,(to,m)=>messages.push({to,m}));
 const sample={alpha:10,beta:200,gamma:-30,axis:'beta',state:'BACK',stage:'ready',tilt:4,hz:60,peakMax:600};
 ch.handle(p,{type:'sensor_sample',sample});assert.equal(messages.length,0);
 ch.handle(s,{type:'practice_view',active:true});assert.ok(messages.some(x=>x.to===p&&x.m.type==='practice_subscription'&&x.m.stream));messages.length=0;
 ch.handle(p,{type:'sensor_sample',sample});assert.equal(messages.length,1);assert.equal(messages[0].to,s);assert.deepEqual(messages[0].m.sample,sample);
 const settings={...INPUT_DEFAULTS,powerGain:1.2};ch.handle(s,{type:'set_input_settings',phoneId:'p',settings,requestId:'request'});assert.equal(messages.at(-1).to,p);assert.equal(messages.at(-1).m.type,'input_settings_request');assert.equal(p.inputSettings,undefined);
 ch.handle(p,{type:'input_settings',settings,requestId:'request'});assert.equal(messages.at(-1).m.type,'input_settings_applied');assert.equal(p.inputSettings.powerGain,1.2);
 assert.throws(()=>ch.handle(hidden,{type:'set_input_settings',phoneId:'p',settings,requestId:'request'}),/连接/);assert.throws(()=>ch.handle(p,{type:'swing'}),/训练场/);
 ch.handle(s,{type:'practice_view',active:false});assert.equal(messages.at(-1).m.stream,false);
});

test('试挥不计入成绩，准备只允许一杆，离开或手机断开会取消准备',()=>{
 const screen={role:'screen',clientId:'s',practiceView:true},phone={role:'phone',clientId:'p',calibrated:true},clients=new Set([screen,phone]),messages=[];
 const ch=new TrainingChannel(clients,(to,m)=>messages.push({to,m}));ch.changed();const m={type:'test_swing',power:.5,dir:0,peak:400,seq:1};ch.handle(phone,m);
 assert.equal(ch.range.history.length,0);assert.equal(ch.range.busyUntil,0);assert.ok(messages.some(x=>x.m.type==='practice_rehearsal'));
 ch.handle(phone,{type:'practice_arm',armed:true});assert.equal(ch.range.armed,true);ch.handle(phone,{...m,seq:2});assert.equal(ch.range.history.length,1);assert.equal(ch.range.armed,false);assert.ok(messages.some(x=>x.m.type==='practice_result'));
 assert.throws(()=>ch.handle(screen,{type:'practice_shot',power:.5,dir:0,seq:3}),/准备/);
 ch.range.busyUntil=0;ch.handle(phone,{type:'practice_arm',armed:true});phone.calibrated=false;ch.changed();assert.equal(ch.range.armed,false);phone.calibrated=true;ch.changed();
 ch.range.busyUntil=0;ch.handle(screen,{type:'practice_arm',armed:true});clients.delete(phone);ch.changed();assert.equal(ch.range.armed,false);
 ch.handle(screen,{type:'practice_arm',armed:true});ch.handle(screen,{type:'practice_view',active:false});assert.equal(ch.range.armed,false);
});

test('训练场边界反馈保留轨迹终点，不能误报为发球点',()=>{
 const t=new Training();t.configure({clubId:'driver',target:220,aim:35});
 const {report,shot}=t.stroke({power:1,dir:1,seq:1},'screen','screen',null,100,true),last=shot.path.at(-1);
 assert.equal(shot.penalty,'out');assert.deepEqual(shot.to,{x:last.x,z:last.z});assert.ok(report.lateral>180);assert.match(report.feedback[0],/离开训练区/);assert.equal(trainingExport([report])[0]['瞄准方向（度）'],35);
});

test('瞄准方向影响真实模拟落点，力量刻度取自同一物理模型',()=>{
 const t=new Training();t.configure({clubId:'iron',target:150,aim:10});const marks=t.snapshot().powerMarks;
 assert.equal(marks.length,4);assert.ok(marks.every(m=>m.to.x>0));assert.ok(marks[0].total<marks[1].total&&marks[1].total<marks[2].total);
 const {report}=t.stroke({power:.5,dir:0,seq:1},'screen','screen',null,100,true);assert.equal(report.launchAngle,10);assert.deepEqual(report.to,marks[1].to);assert.equal(t.history.length,0);
 assert.throws(()=>t.configure({clubId:'iron',target:150,aim:36}),/35/);
});
