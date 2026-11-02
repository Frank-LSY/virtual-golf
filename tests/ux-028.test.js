import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../game-service/game.js';

test('0.28 球局中途回大厅只是暂离：成绩和球位保留，可继续；开新局后不能再继续旧局', ()=>{
 const g=new Game();g.start('orchard',9);
 g.state.holeIndex=2;g.state.strokes=3;g.state.ball={x:4,z:-30};
 g.lobby();
 assert.equal(g.state.phase,'lobby');assert.equal(g.state.resumePhase,'playing');
 g.resume();
 assert.equal(g.state.phase,'playing');assert.equal(g.state.holeIndex,2);assert.equal(g.state.strokes,3);assert.deepEqual(g.state.ball,{x:4,z:-30});assert.equal(g.state.resumePhase,null);
 assert.throws(()=>g.resume(),/没有可以继续/);
 g.state.phase='hole_complete';g.lobby();g.resume();assert.equal(g.state.phase,'hole_complete','完成本洞后离开，回来仍停在“前往下一洞”');
 g.lobby();g.start('coast',3);
 assert.equal(g.state.resumePhase,undefined);assert.throws(()=>{g.lobby();g.state.resumePhase=null;g.resume();},/没有可以继续/);
});

test('0.28 整轮打完后回大厅不提供“继续上一局”', ()=>{
 const g=new Game();g.start('orchard',3);g.state.phase='finished';g.lobby();
 assert.equal(g.state.resumePhase,null);assert.throws(()=>g.resume(),/没有可以继续/);
});

test('0.28.1 单人局：开局手机离线后由在线手机接着打，原手机回来交还；多人局不转移', async ()=>{
 const {TrainingChannel}=await import('../local-gateway/training-channel.js');
 const {RoundChannel}=await import('../local-gateway/round-channel.js');
 const one=[{id:'a',deviceId:'a',name:'球手1',number:1,style:'sage'}],two=[...one,{id:'b',deviceId:'b',name:'球手2',number:2,style:'coast'}];
 const make=roster=>{const g=new Game();g.start('orchard',3,roster);const screen={role:'screen',clientId:'s',roundView:true},b={role:'phone',clientId:'b',calibrated:true},clients=new Set([screen,b]),sent=[],send=(to,m)=>sent.push({to,m}),training=new TrainingChannel(clients,send);const round=new RoundChannel(g,clients,send,training,{state:()=>{},shot:()=>{}});return {g,clients,b,sent,round};};
 // 单人：开局时绑定的手机 a 不在线，b 在线 → b 可以控制
 const solo=make(one);solo.round.sync();assert.equal(solo.round.phone(),solo.b);
 const sub=solo.sent.filter(x=>x.to===solo.b&&x.m.type==='round_subscription').at(-1).m;assert.equal(sub.canControl,true);assert.equal(sub.stream,true);
 // a 回来后交还给 a
 const a={role:'phone',clientId:'a',calibrated:true};solo.clients.add(a);assert.equal(solo.round.phone(),a);
 // 多人：当前球手的手机离线时不交给别人
 const multi=make(two);assert.equal(multi.g.player.id,'a');assert.equal(multi.round.phone(),undefined);
});
