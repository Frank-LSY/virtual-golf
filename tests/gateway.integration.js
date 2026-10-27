import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import https from 'node:https';

const base='http://localhost:5197',dataDir=path.resolve('.local/integration-'+Date.now());
await mkdir(dataDir,{recursive:true});
const processHandle=spawn(process.execPath,['local-gateway/server.js'],{env:{...process.env,PORT:'5197',HTTPS_PORT:'8497',SWINGLINK_DATA_DIR:dataDir},stdio:['ignore','pipe','pipe']});
const stop=setTimeout(()=>{processHandle.kill();throw Error('Gateway test timed out');},30000);
let screen,phone;
try{
 await new Promise((resolve,reject)=>{processHandle.stdout.on('data',b=>{if(b.toString().includes('本机地址：'))resolve();});processHandle.once('error',reject);processHandle.once('exit',code=>{if(code)reject(Error('Server exited '+code));});});
 assert.equal((await fetch(base+'/api/health')).status,200);const config=await fetch(base+'/api/config').then(r=>r.json());assert.ok(config.secure);assert.ok(config.qr.startsWith('<svg'));
 const ca=await readFile(path.join(process.env.SWINGLINK_CERT_DIR||'certs','rootCA.pem'));await new Promise((resolve,reject)=>{https.get('https://localhost:8497/api/health',{ca},res=>{assert.equal(res.statusCode,200);res.resume();res.on('end',resolve);}).on('error',reject);});
 for(const file of ['/','/phone','/screen-web/app.js','/shared/swing.js','/vendor/three/three.module.js','/local-ca.cer'])assert.equal((await fetch(base+file)).status,200,file);
 for(const file of ['/certs/server-key.pem','/certs/rootCA-key.pem','/.local/game.json','/game-service/game.js'])assert.equal((await fetch(base+file)).status,404,file);
 await new Promise((resolve,reject)=>{const bad=new WebSocket(base.replace('http','ws')+'/ws?token=wrong',{origin:base});bad.on('unexpected-response',(_req,res)=>{assert.equal(res.statusCode,403);res.destroy();resolve();});bad.on('open',()=>reject(Error('Unauthorized connection accepted')));bad.on('error',()=>{});});
 async function connect(role,id){const ws=new WebSocket(`${base.replace('http','ws')}/ws?token=${config.token}`,{origin:base});ws.queue=[];ws.on('message',m=>ws.queue.push(JSON.parse(m)));await once(ws,'open');ws.send(JSON.stringify({type:'hello',role,clientId:id,protocolVersion:1}));return ws;}
 async function wait(ws,predicate,limit=10000){const end=Date.now()+limit;while(Date.now()<end){const i=ws.queue.findIndex(predicate);if(i>=0)return ws.queue.splice(i,1)[0];await new Promise(r=>setTimeout(r,10));}throw Error('Expected message not received: '+predicate);}
 const send=(ws,m)=>ws.send(JSON.stringify(m));
 screen=await connect('screen','integration-screen');let snap=(await wait(screen,m=>m.type==='room_state')).state;
 phone=await connect('phone','integration-phone');await wait(phone,m=>m.type==='ready');await wait(screen,m=>m.type==='controller_status'&&m.connected);
 send(phone,{type:'test_swing',power:.4,dir:0,peak:300,seq:1});assert.match((await wait(phone,m=>m.type==='error')).message,/校准/);
 send(phone,{type:'calibrated',peakMax:600,dirZero:0,noise:3});await wait(screen,m=>m.type==='controller_status'&&m.calibrated);
 send(screen,{type:'practice_view',active:true});assert.equal((await wait(screen,m=>m.type==='practice_state')).history.length,0);await wait(phone,m=>m.type==='practice_subscription'&&m.stream);
 const settings={powerGain:1.2,directionGain:.75,threshold:100,gamma:1.8};send(screen,{type:'set_input_settings',phoneId:'integration-phone',settings,requestId:'tune-1'});assert.deepEqual((await wait(phone,m=>m.type==='input_settings_request')).settings,settings);
 send(phone,{type:'input_settings',settings,requestId:'tune-1'});assert.equal((await wait(screen,m=>m.type==='input_settings_applied')).requestId,'tune-1');
 send(phone,{type:'sensor_sample',sample:{alpha:30,beta:420,gamma:20,axis:'beta',state:'DOWN',stage:'ready',tilt:3,hz:60,peakMax:600}});assert.equal((await wait(screen,m=>m.type==='sensor_sample')).sample.beta,420);
 send(screen,{type:'practice_config',settings:{clubId:'wedge',target:70}});await wait(screen,m=>m.type==='practice_state'&&m.settings.clubId==='wedge');
 send(screen,{type:'practice_arm',armed:true});await wait(phone,m=>m.type==='practice_subscription'&&m.armed);
 send(phone,{type:'test_swing',power:.42,dir:.1,peak:350,seq:1,path:['IDLE','BACK','DOWN','HIT','COOLDOWN']});assert.equal((await wait(screen,m=>m.type==='swing_feedback')).power,.42);
 const practice=await wait(screen,m=>m.type==='practice_result');assert.ok(practice.report.carry>20);assert.equal(practice.report.input.powerGain,1.2);assert.equal(practice.report.target,70);assert.ok(practice.shot.path.length>5);await wait(phone,m=>m.type==='practice_ack'&&m.seq===1);
 send(phone,{type:'test_swing',power:.42,dir:.1,peak:350,seq:1});assert.match((await wait(phone,m=>m.type==='error')).message,/已经收到/);
 send(screen,{type:'practice_view',active:false});await wait(phone,m=>m.type==='practice_subscription'&&!m.active);
 send(screen,{type:'round_view',active:true});
 send(screen,{type:'start_round',courseId:'coast',mode:3});snap=(await wait(screen,m=>m.type==='room_state'&&m.state.courseId==='coast'&&m.state.phase==='playing')).state;
 await wait(phone,m=>m.type==='round_subscription'&&m.stream);
 send(phone,{type:'sensor_sample',sample:{alpha:40,beta:30,gamma:20,axis:'beta',state:'IDLE',stage:'ready',tilt:2,hz:60,peakMax:600}});assert.equal((await wait(screen,m=>m.type==='sensor_sample'&&m.scope==='round')).sample.alpha,40);
 send(phone,{type:'swing',power:.4,dir:0,seq:2,stateVersion:snap.stateVersion});assert.ok((await wait(screen,m=>m.type==='round_rehearsal')).shot.path.length>2);await wait(phone,m=>m.type==='rehearsal_ack'&&m.seq===2);
 send(phone,{type:'round_arm',armed:true});snap=(await wait(screen,m=>m.type==='room_state'&&m.state.armed)).state;assert.equal(snap.strokes,0);
 send(phone,{type:'swing',power:.4,dir:0,seq:3,stateVersion:snap.stateVersion});const shot=(await wait(screen,m=>m.type==='shot_result')).shot;assert.ok(shot.path.length>2);assert.equal((await wait(phone,m=>m.type==='ack'&&m.seq===3)).seq,3);
 send(phone,{type:'swing',power:.4,dir:0,seq:3,stateVersion:snap.stateVersion});assert.match((await wait(phone,m=>m.type==='error')).message,/已经收到/);
 screen.close();await once(screen,'close');screen=await connect('screen','integration-screen');snap=(await wait(screen,m=>m.type==='room_state')).state;assert.equal(snap.strokes,1);assert.deepEqual(snap.ball,shot.to);
 if(snap.phase==='animating')snap=(await wait(screen,m=>m.type==='room_state'&&m.state.phase==='playing')).state;assert.equal(snap.strokes,1);assert.ok(snap.stateVersion>shot.stateVersion);
 phone.close();await once(phone,'close');await wait(screen,m=>m.type==='controller_status'&&!m.connected);
 await new Promise(r=>setTimeout(r,80));const saved=JSON.parse(await readFile(path.join(dataDir,'game.json'),'utf8'));assert.equal(saved.strokes,1);assert.deepEqual(saved.ball,shot.to);
 console.log('PASS: HTTP / HTTPS, private files, pairing, calibration, live telemetry, confirmed sensitivity, independent practice flight, duplicate rejection, formal rehearsal and one-shot arming, round telemetry, reconnect, disconnect, and saved state.');
}finally{clearTimeout(stop);screen?.close();phone?.close();processHandle.kill();}
