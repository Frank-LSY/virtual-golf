import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
const base='http://127.0.0.1:5198',dataDir=path.resolve('.local/multi-integration-'+Date.now()),sockets=[];
await mkdir(dataDir,{recursive:true});
const server=spawn(process.execPath,['local-gateway/server.js'],{env:{...process.env,PORT:'5198',HTTPS_PORT:'8498',SWINGLINK_DATA_DIR:dataDir},stdio:['ignore','pipe','pipe']});
const timeout=setTimeout(()=>server.kill(),40000),send=(ws,m)=>ws.send(JSON.stringify(m));
async function wait(ws,p,ms=10000){const end=Date.now()+ms;while(Date.now()<end){const i=ws.queue.findIndex(p);if(i>=0)return ws.queue.splice(i,1)[0];await new Promise(r=>setTimeout(r,10));}throw Error('未收到消息：'+p);}
try{
 await new Promise((resolve,reject)=>{server.stdout.on('data',b=>{if(b.toString().includes('本机地址：'))resolve();});server.on('error',reject);server.on('exit',()=>reject(Error('服务提前退出')));});
 const config=await fetch(base+'/api/config').then(r=>r.json());
 async function connect(role,clientId){const ws=new WebSocket(base.replace('http','ws')+'/ws?token='+config.token,{origin:base});sockets.push(ws);ws.queue=[];ws.on('message',raw=>ws.queue.push(JSON.parse(raw)));await once(ws,'open');send(ws,{type:'hello',role,clientId,protocolVersion:1});await wait(ws,m=>m.type==='ready');return ws;}
 const screen=await connect('screen','multi-screen'),a=await connect('phone','multi-a'),b=await connect('phone','multi-b');
 const pa=(await wait(a,m=>m.type==='player_identity')).player,pb=(await wait(b,m=>m.type==='player_identity')).player;assert.notEqual(pa.number,pb.number);
 send(a,{type:'player_profile',name:'青禾',style:'sage'});await wait(a,m=>m.type==='player_identity'&&m.player.name==='青禾');
 for(const [ws,peakMax,axis] of [[a,500,'beta'],[b,800,'gamma']])send(ws,{type:'calibrated',peakMax,axis,dirZero:0,verified:true,quality:98});
 await wait(screen,m=>m.type==='controller_status'&&m.phones.filter(p=>p.calibrated).length===2);
 send(screen,{type:'practice_view',active:true});await wait(screen,m=>m.type==='practice_state'&&m.owner.id==='multi-a');
 send(screen,{type:'request_calibration',phoneId:'multi-a',mode:'zero'});assert.equal((await wait(a,m=>m.type==='calibration_request')).mode,'zero');
 send(a,{type:'practice_arm',armed:true});await wait(a,m=>m.type==='practice_subscription'&&m.armed);send(a,{type:'test_swing',power:.12,dir:0,peak:170,seq:1});
 const practice=await wait(screen,m=>m.type==='practice_result');assert.equal(practice.report.playerName,'青禾');assert.equal(practice.report.calibration.peakMax,500);
 await new Promise(r=>setTimeout(r,practice.shot.duration*1000+950));send(screen,{type:'practice_select',phoneId:'multi-b'});assert.equal((await wait(screen,m=>m.type==='practice_state'&&m.owner.id==='multi-b')).history.length,0);
 const settings={powerGain:1.2,directionGain:.8,threshold:80,gamma:1.5};send(screen,{type:'set_input_settings',phoneId:'multi-b',settings,requestId:'b-only'});await wait(b,m=>m.type==='input_settings_request'&&m.requestId==='b-only');assert.ok(!a.queue.some(m=>m.type==='input_settings_request'));
 send(b,{type:'input_settings',settings,requestId:'b-only'});await wait(screen,m=>m.type==='input_settings_applied'&&m.phoneId==='multi-b');
 send(screen,{type:'practice_select',phoneId:'multi-a'});assert.equal((await wait(screen,m=>m.type==='practice_state'&&m.owner.id==='multi-a'&&m.history.length===1)).history[0].playerId,'multi-a');
 send(screen,{type:'practice_view',active:false});send(screen,{type:'round_view',active:true});send(screen,{type:'start_round',courseId:'sunny',mode:3,multiplayer:true,playerIds:['multi-a','multi-b']});
 let state=(await wait(screen,m=>m.type==='room_state'&&m.state.multiplayer&&m.state.phase==='playing')).state;assert.equal(state.activePlayerId,'multi-a');
 send(b,{type:'round_arm',armed:true});assert.match((await wait(b,m=>m.type==='error')).message,/未轮到/);
 send(a,{type:'round_arm',armed:true});state=(await wait(screen,m=>m.type==='room_state'&&m.state.armed)).state;send(b,{type:'swing',power:.2,dir:0,seq:1,stateVersion:state.stateVersion});assert.match((await wait(b,m=>m.type==='error')).message,/未轮到/);
 send(a,{type:'swing',power:.15,dir:0,peak:230,seq:2,stateVersion:state.stateVersion});await wait(a,m=>m.type==='ack');
 state=(await wait(screen,m=>m.type==='room_state'&&m.state.phase==='playing'&&m.state.activePlayerId==='multi-b')).state;assert.equal(state.strokes,0);assert.equal(state.players[0].strokes,1);assert.equal(state.shotHistory[0].inputDeviceId,'multi-a');
 send(b,{type:'round_arm',armed:true});state=(await wait(screen,m=>m.type==='room_state'&&m.state.activePlayerId==='multi-b'&&m.state.armed)).state;send(b,{type:'swing',power:.18,dir:0,peak:300,seq:1,stateVersion:state.stateVersion});await wait(b,m=>m.type==='ack');
 state=(await wait(screen,m=>m.type==='room_state'&&m.state.phase==='playing'&&m.state.activePlayerId==='multi-a'&&m.state.shotHistory.length===2)).state;assert.equal(state.shotHistory[1].calibration.axis,'gamma');assert.equal(state.shotHistory[1].inputSettings.powerGain,1.2);
 send(a,{type:'round_arm',armed:true});await wait(screen,m=>m.type==='room_state'&&m.state.armed&&m.state.stateVersion>state.stateVersion);a.close();await once(a,'close');await wait(screen,m=>m.type==='controller_status'&&m.count===1);state=(await wait(screen,m=>m.type==='room_state'&&!m.state.armed&&m.state.stateVersion>state.stateVersion)).state;assert.equal(state.activePlayerId,'multi-a');
 const again=await connect('phone','multi-a');assert.equal((await wait(again,m=>m.type==='player_identity')).player.number,pa.number);
 const oldClosed=once(again,'close'),replacement=await connect('phone','multi-a');assert.equal((await oldClosed)[0],4001);assert.equal((await wait(replacement,m=>m.type==='player_identity')).player.name,'青禾');
 send(screen,{type:'start_round',courseId:'coast',mode:3,multiplayer:true,playerIds:['multi-a','multi-b']});await wait(screen,m=>m.type==='room_state'&&m.state.courseId==='coast');send(screen,{type:'round_records'});const records=await wait(screen,m=>m.type==='round_records');assert.equal(records.rounds[0].shotHistory.length,2);assert.equal(records.current.shotHistory.length,0);
 await new Promise(r=>setTimeout(r,150));const saved=JSON.parse(await readFile(path.join(dataDir,'practice.json'),'utf8'));assert.equal(saved.sessions.find(x=>x.id==='multi-a').history[0].playerName,'青禾');assert.equal(JSON.parse(await readFile(path.join(dataDir,'rounds.json'),'utf8'))[0].shotHistory[1].playerId,'multi-b');
 const ids=['multi-a','multi-b'];for(let i=3;i<=16;i++){const p=await connect('phone','multi-'+i);const identity=(await wait(p,m=>m.type==='player_identity')).player;ids.push(identity.id);}
 for(const count of [3,4,6,16]){const before=state.stateVersion;send(screen,{type:'start_round',courseId:'sunny',mode:3,multiplayer:true,playerCount:count,playerIds:ids.slice(0,count)});state=(await wait(screen,m=>m.type==='room_state'&&m.state.players.length===count&&m.state.stateVersion>before)).state;assert.equal(state.players.length,count);}
 send(screen,{type:'start_round',courseId:'sunny',mode:3,multiplayer:true,playerCount:4,playerIds:ids.slice(0,3)});assert.match((await wait(screen,m=>m.type==='error')).message,/选定人数/);
 console.log('PASS: 两台手机独立身份/校准/调参/训练记录，轮流击球与独立球位，断线重连，归档导出；3/4/6/16 人建局与人数核对。');
}finally{clearTimeout(timeout);for(const ws of sockets)ws.close();server.kill();}
