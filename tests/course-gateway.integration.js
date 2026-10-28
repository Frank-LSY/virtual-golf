import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {Game} from '../game-service/game.js';

const base='http://localhost:5195',dataDir=path.resolve('.local/course-integration-'+Date.now()),game=new Game();
game.start('orchard',9,[{id:'a',deviceId:'course-phone-a',name:'甲',style:'sage'},{id:'b',deviceId:'course-phone-b',name:'乙',style:'coast'}]);game.state.seed=421;
for(let i=0;i<2;i++){const h=game.hole;game.state.ball={x:h.pin.x,z:h.pin.z-1};game.setArmed(true);game.stroke({power:.04,dir:0,seq:i+1,stateVersion:game.state.stateVersion},game.player.deviceId);game.settle();}
assert.equal(game.state.phase,'hole_complete');await mkdir(dataDir,{recursive:true});await writeFile(path.join(dataDir,'game.json'),JSON.stringify(game.state));
const server=spawn(process.execPath,['local-gateway/server.js'],{env:{...process.env,PORT:'5195',HTTPS_PORT:'8495',SWINGLINK_DATA_DIR:dataDir},stdio:['ignore','pipe','pipe']}),sockets=[];
const deadline=setTimeout(()=>{server.kill();throw Error('Course integration timed out');},35000);
try{
 await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{if(d.toString().includes('本机地址：'))resolve();});server.on('error',reject);server.on('exit',c=>{if(c)reject(Error('Server exited '+c));});});const config=await fetch(base+'/api/config').then(r=>r.json());
 const wait=async(ws,p,limit=15000)=>{const until=Date.now()+limit;while(Date.now()<until){const i=ws.queue.findIndex(p);if(i>=0)return ws.queue.splice(i,1)[0];await new Promise(r=>setTimeout(r,10));}throw Error('Missing course event: '+p);};
 const send=(ws,m)=>ws.send(JSON.stringify(m));
 async function connect(role,id){const ws=new WebSocket(base.replace('http','ws')+'/ws?token='+config.token,{origin:base});sockets.push(ws);ws.queue=[];ws.on('message',m=>ws.queue.push(JSON.parse(m)));await once(ws,'open');send(ws,{type:'hello',role,clientId:id,protocolVersion:1});await wait(ws,m=>m.type==='ready');return ws;}
 const screen=await connect('screen','course-screen'),observer=await connect('screen','course-observer'),phone=await connect('phone','course-phone-b');send(phone,{type:'calibrated',peakMax:600,dirZero:0,noise:2});send(screen,{type:'round_view',active:true});send(observer,{type:'round_view',active:true});
 send(screen,{type:'next_hole'});const inTransit=(await wait(screen,m=>m.type==='room_state'&&m.state.phase==='transferring')).state;assert.equal(inTransit.holeIndex,0);assert.equal(inTransit.players.length,2);const other=(await wait(observer,m=>m.type==='room_state'&&m.state.phase==='transferring')).state;assert.equal(other.transfer.id,inTransit.transfer.id);
 assert.equal((await wait(phone,m=>m.type==='round_subscription'&&m.transferring)).canControl,false);send(phone,{type:'round_arm',armed:true});assert.match((await wait(phone,m=>m.type==='error')).message,/等待/);send(screen,{type:'next_hole'});assert.match((await wait(screen,m=>m.type==='error')).message,/完成/);
 send(screen,{type:'skip_transfer',transferId:'old',stateVersion:inTransit.stateVersion});assert.match((await wait(screen,m=>m.type==='error')).message,/更新/);
 const arrived=(await wait(screen,m=>m.type==='room_state'&&m.state.phase==='playing'&&m.state.holeIndex===1)).state;assert.deepEqual(arrived.players.map(p=>p.scores),inTransit.players.map(p=>p.scores));assert.deepEqual(arrived.players.map(p=>p.deviceId),['course-phone-a','course-phone-b']);assert.equal(arrived.armed,false);assert.equal(arrived.shotHistory.length,2);assert.equal(arrived.transfer,undefined);
 // 新手机连接也得到相同第二洞状态；没有重新播一遍接驳或重置计分。
 const reconnect=await connect('screen','course-reconnect');const restored=(await wait(reconnect,m=>m.type==='room_state')).state;assert.equal(restored.holeIndex,1);assert.deepEqual(restored.players.map(p=>p.scores),arrived.players.map(p=>p.scores));
 console.log('Course gateway passed: shared transfer, phone lock, stale/duplicate rejection, timed arrival, identity and score persistence.');
}finally{clearTimeout(deadline);sockets.forEach(s=>s.close());server.kill();}
