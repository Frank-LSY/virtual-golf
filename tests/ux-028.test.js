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
