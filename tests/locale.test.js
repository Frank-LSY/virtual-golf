import test from 'node:test';
import assert from 'node:assert/strict';
import {chineseLog,chineseCsv} from '../shared/locale.js';

test('旧版挥杆记录可导出中文字段与状态，CSV 保留中文及带逗号的内容',()=>{
 const old={time:'2026-10-26T12:00:00Z',axis:'beta',power:.4,dir:0,peak:300,mode:'play',sent:true,acknowledged:true,feeling:'Too light',path:['IDLE','BACK','DOWN','HIT','COOLDOWN']};
 const row=chineseLog(old);assert.equal(row['手感'],'偏轻');assert.equal(row['模式'],'正式打球');assert.equal(row['是否发送'],'是');assert.deepEqual(row['识别过程'],['静止','上杆','下挥','击球','冷却']);
 const csv=chineseCsv([old,{...old,feeling:'轻, "慢"'}]);assert.ok(csv.startsWith('\uFEFF"时间"'));assert.ok(csv.includes('"轻, ""慢"""'));assert.ok(csv.includes('"偏轻"'));assert.equal(chineseLog({feeling:'Missed swing'})['角速度峰值'],null);
});
