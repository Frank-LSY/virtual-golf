import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../game-service/game.js';
import {Players} from '../local-gateway/players.js';
import {TrainingChannel} from '../local-gateway/training-channel.js';
import {RoundChannel} from '../local-gateway/round-channel.js';
import {roundExport} from '../shared/players.js';
const roster=['a','b','c','d'].map((id,i)=>({id,deviceId:id,name:'球手'+(i+1),number:i+1,style:['sage','coast','sunset','plum'][i]}));
function stroke(g,id=g.player.id){g.setArmed(true);return g.stroke({power:.3,dir:0,seq:(g.sequences.get(id)||0)+1,stateVersion:g.state.stateVersion},id,{source:'phone',calibration:{axis:'beta',peakMax:id==='a'?500:800}});}
test('支持选择 2 至 16 人；大队伍逐杆轮换，超出人数上限拒绝创建',()=>{
 const entries=Array.from({length:16},(_,i)=>({id:'p'+i,deviceId:'p'+i,name:'球手'+i,number:i+1,style:'sage'})),g=new Game();
 for(const count of [2,3,4,6,8,16]){g.start('sunny',3,entries.slice(0,count));assert.equal(g.state.players.length,count);for(let i=0;i<count;i++){assert.equal(g.player.id,'p'+i);stroke(g);g.settle();}assert.equal(g.player.id,'p0');assert.ok(g.state.players.every(p=>p.strokes>=1));}
 assert.throws(()=>g.start('sunny',3,[...entries,{id:'overflow'}]),/最多支持/);
});
test('多人每杆轮换并保存各自球位、罚杆、成绩与手机归属；中途恢复仍切换正确球手',()=>{
 const g=new Game();g.start('sunny',3,roster.slice(0,2));const aShot=stroke(g);assert.equal(g.player.id,'a');assert.equal(g.state.shotHistory[0].inputDeviceId,'a');assert.equal(g.state.shotHistory[0].calibration.peakMax,500);
 const restored=new Game(g.state);assert.equal(restored.player.id,'b');assert.equal(restored.state.armed,false);assert.equal(restored.state.strokes,0);assert.deepEqual(restored.state.ball,{x:0,z:0});g.settle();stroke(g);g.settle();assert.equal(g.player.id,'a');assert.deepEqual(g.state.ball,aShot.to);assert.equal(g.state.strokes,1+(aShot.penalty?1:0));assert.equal(g.state.shotHistory[1].inputDeviceId,'b');
 const exp=roundExport(g.snapshot());assert.equal(exp['球手'].length,2);assert.equal(exp['击球记录'][1]['绑定手机'],'手机 02');
});
test('四人记分独立；到达上限者跳过，全部完成后才进下一洞',()=>{
 const g=new Game();g.start('sunny',3,roster);for(let i=0;i<4;i++){assert.equal(g.player.id,roster[i].id);g.state.strokes=11;stroke(g);g.settle();if(i<3){assert.equal(g.state.phase,'playing');assert.throws(()=>g.next(),/先完成/);}}
 assert.equal(g.state.phase,'hole_complete');assert.ok(g.state.players.every(p=>p.scores[0].strokes===12));g.next();assert.equal(g.player.id,'a');assert.ok(g.state.players.every(p=>p.strokes===0&&p.scores.length===1&&!p.holeDone));
 g.state.strokes=11;stroke(g);g.settle();stroke(g);g.settle();stroke(g);g.settle();stroke(g);g.settle();assert.equal(g.player.id,'b');assert.throws(()=>g.start('sunny',3,[roster[0],roster[0]]),/不同/);
});
function setup(){const g=new Game();g.start('sunny',3,roster.slice(0,2));const screen={role:'screen',clientId:'s',roundView:true},a={role:'phone',clientId:'a',calibrated:true,calibration:{peakMax:500}},b={role:'phone',clientId:'b',calibrated:true,calibration:{peakMax:800}},clients=new Set([screen,a,b]),messages=[],send=(to,m)=>messages.push({to,m}),players=new Players();players.ensure('a');players.ensure('b');const training=new TrainingChannel(clients,send,{players});const round=new RoundChannel(g,clients,send,training,{state:()=>round.sync(),shot:()=>{}});round.sync();return {g,screen,a,b,clients,messages,training,round};}
test('其他手机不能准备、击球、消费准备或转动人物；断线不转移控制，原身份可重连',()=>{
 const {g,screen,a,b,clients,messages,round}=setup();round.handle(a,{type:'round_arm',armed:true});assert.throws(()=>round.handle(b,{type:'round_arm',armed:false}),/未轮到/);assert.throws(()=>round.handle(b,{type:'swing',power:.4,dir:0,seq:1,stateVersion:g.state.stateVersion}),/未轮到/);assert.equal(g.state.armed,true);assert.throws(()=>round.handle(screen,{type:'swing',power:.4,dir:0,seq:1,stateVersion:g.state.stateVersion}),/手机/);
 round.handle(b,{type:'sensor_sample',sample:{}});assert.ok(!messages.some(x=>x.m.type==='sensor_sample'));clients.delete(a);round.sync();assert.equal(g.state.armed,false);assert.equal(round.phone(),undefined);assert.equal(g.player.id,'a');clients.add(a);round.sync();round.handle(a,{type:'round_arm',armed:true});assert.equal(g.state.armed,true);
});
test('练习室手机切换会隔离设置、历史、校准和参数回执；离线保留选择',()=>{
 const {screen,a,b,clients,messages,training}=setup();training.handle(screen,{type:'practice_view',active:true});training.handle(screen,{type:'practice_config',settings:{clubId:'wedge',target:70}});training.handle(a,{type:'practice_arm',armed:true});training.handle(a,{type:'test_swing',power:.4,dir:0,peak:300,seq:1});assert.equal(training.range.history[0].playerId,'a');assert.equal(training.range.history[0].calibration.peakMax,500);training.range.busyUntil=0;
 training.handle(screen,{type:'practice_select',phoneId:'b'});assert.equal(training.range.history.length,0);assert.equal(training.range.settings.clubId,'iron');assert.equal(training.range.armed,false);assert.throws(()=>training.handle(a,{type:'practice_arm',armed:true}),/启用体感/);
 training.handle(screen,{type:'request_calibration',phoneId:'b',mode:'full'});assert.ok(messages.some(x=>x.to===b&&x.m.type==='calibration_request'));training.handle(screen,{type:'practice_config',settings:{clubId:'putter',target:10}});
 training.handle(screen,{type:'practice_select',phoneId:'a'});assert.equal(training.range.history.length,1);assert.equal(training.range.settings.clubId,'wedge');const restored=new TrainingChannel(clients,()=>{},{saved:training.saved()});restored.selectedId='b';assert.equal(restored.range.settings.clubId,'putter');restored.selectedId='a';assert.equal(restored.range.history[0].playerId,'a');clients.delete(a);training.changed();assert.equal(training.phone(),undefined);assert.equal(training.selectedId,'a');
});
