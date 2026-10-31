import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

const base='http://localhost:5201',dataDir=path.resolve('.local/maze-integration-'+Date.now());await mkdir(dataDir,{recursive:true});
const server=spawn(process.execPath,['local-gateway/server.js'],{env:{...process.env,PORT:'5201',HTTPS_PORT:'8501',SWINGLINK_DATA_DIR:dataDir},stdio:['ignore','pipe','pipe']});
const sockets=[],stop=setTimeout(()=>{server.kill();console.error('Maze integration timed out');process.exit(1);},45000);
try{
 await new Promise((resolve,reject)=>{server.stdout.on('data',b=>{if(b.toString().includes('本机地址：'))resolve();});server.once('exit',code=>reject(Error('Server exited '+code)));});
 const config=await fetch(base+'/api/config').then(r=>r.json());
 for(const file of ['/','/phone','/shared/maze/levels.js','/shared/maze/physics.js','/shared/maze/camera.js','/shared/maze/tilt.js','/screen-web/maze.js','/screen-web/maze-renderer.js','/screen-web/maze.css','/screen-web/skyroll-sfx.js','/screen-web/toon-look.js','/screen-web/cartoon.css','/phone-web/cartoon.css','/phone-web/maze-entry.js','/phone-web/maze-controller.js','/phone-web/maze.css'])assert.equal((await fetch(base+file)).status,200,file);
 async function connect(role,id){const ws=new WebSocket(`${base.replace('http','ws')}/ws?token=${config.token}`,{origin:base});sockets.push(ws);ws.queue=[];ws.on('message',m=>ws.queue.push(JSON.parse(m)));await once(ws,'open');ws.send(JSON.stringify({type:'hello',role,clientId:id,protocolVersion:1}));await wait(ws,m=>m.type==='ready');return ws;}
 async function wait(ws,predicate,limit=3000){const end=Date.now()+limit;while(Date.now()<end){const i=ws.queue.findIndex(predicate);if(i>=0)return ws.queue.splice(i,1)[0];await new Promise(r=>setTimeout(r,10));}throw Error('Missing packet '+predicate+'; '+JSON.stringify(ws.queue));}
 const send=(ws,m)=>ws.send(JSON.stringify(m));
 const screen=await connect('screen','maze-pc'),phone=await connect('phone','maze-phone'),other=await connect('phone','other-phone');
 send(screen,{type:'maze_view',active:true});await wait(screen,m=>m.type==='maze_host'&&m.host);await wait(phone,m=>m.type==='maze_subscription'&&m.active);assert.equal((await wait(other,m=>m.type==='maze_subscription')).active,false);
 send(phone,{type:'maze_ready',ready:true,source:'joystick'});await wait(screen,m=>m.type==='maze_controller'&&m.ready);send(screen,{type:'maze_input_mode',phone:true});send(phone,{type:'maze_input',x:.6,y:-.2,seq:1});assert.equal((await wait(screen,m=>m.type==='maze_input')).x,.6);
 send(other,{type:'maze_input',x:1,y:0,seq:1});assert.match((await wait(other,m=>m.type==='error')).message,/不是当前/);
 send(screen,{type:'maze_state',phase:'playing',level:2,elapsed:12.5,falls:3,checkpoint:1,checkpointCount:3});const state=await wait(phone,m=>m.type==='maze_game_state');assert.equal(state.falls,3);assert.equal(state.checkpoint,1);assert.equal(state.checkpointCount,3);
 send(phone,{type:'maze_pause'});await wait(screen,m=>m.type==='maze_pause'&&m.reason==='phone_hidden');send(phone,{type:'maze_command',action:'retry'});await wait(screen,m=>m.type==='maze_command'&&m.action==='retry');
 send(screen,{type:'maze_rezero'});await wait(phone,m=>m.type==='maze_rezero');await wait(screen,m=>m.type==='maze_controller'&&!m.ready);send(phone,{type:'maze_ready',ready:true,source:'tilt'});await wait(screen,m=>m.type==='maze_controller'&&m.ready);send(phone,{type:'maze_input',x:0,y:0,seq:2});await wait(screen,m=>m.type==='maze_input');await wait(screen,m=>m.type==='maze_pause'&&m.reason==='stream_gap');
 const second=await connect('screen','second-pc');send(second,{type:'maze_view',active:true});assert.equal((await wait(second,m=>m.type==='maze_host')).host,false);send(second,{type:'maze_view',active:true,takeover:true});await wait(screen,m=>m.type==='maze_host'&&!m.host);await wait(second,m=>m.type==='maze_host'&&m.host);send(screen,{type:'maze_view',active:true,takeover:true});await wait(second,m=>m.type==='maze_host'&&!m.host);await wait(screen,m=>m.type==='maze_host'&&m.host);
 send(screen,{type:'maze_select',phoneId:'other-phone'});await wait(other,m=>m.type==='maze_subscription'&&m.active);await wait(phone,m=>m.type==='maze_subscription'&&!m.active);send(other,{type:'maze_ready',ready:true,source:'joystick'});await wait(screen,m=>m.type==='maze_controller'&&m.ready);other.close();await wait(screen,m=>m.type==='maze_pause'&&m.reason==='controller_offline');
 send(screen,{type:'maze_select',phoneId:'maze-phone'});await wait(phone,m=>m.type==='maze_subscription'&&m.active);send(screen,{type:'maze_view',active:false});await wait(phone,m=>m.type==='maze_subscription'&&!m.active);
 // 0.21：九张地图的状态、电脑所在游戏转告手机、配乐清单与音频
 send(screen,{type:'maze_view',active:true});await wait(screen,m=>m.type==='maze_host');send(screen,{type:'maze_state',phase:'won',level:9,elapsed:70,falls:0,checkpoint:3,checkpointCount:4});assert.equal((await wait(phone,m=>m.type==='maze_game_state'&&m.level===9)).phase,'won');
 send(screen,{type:'maze_state',phase:'playing',level:10,elapsed:1,falls:0});assert.match((await wait(screen,m=>m.type==='error')).message,/滚球状态无效/);
 send(screen,{type:'screen_view',game:'skyroll',view:'maze'});assert.equal((await wait(phone,m=>m.type==='screen_view'&&m.game==='skyroll')).view,'maze');send(screen,{type:'screen_view',game:'bogus'});assert.equal((await wait(other,m=>m.type==='screen_view'&&m.game==='hub')).game,'hub');
 const late=await connect('phone','late-phone');assert.equal((await wait(late,m=>m.type==='screen_view')).game,'hub');
 const soundtrack=await fetch(base+'/screen-web/assets/music/soundtrack.json').then(r=>r.json());assert.equal(Object.keys(soundtrack.cues).length,10);const cue=await fetch(base+soundtrack.cues['sky-isles'].src);assert.equal(cue.status,200);assert.equal(cue.headers.get('content-type'),'audio/mpeg');
 // 0.24：多人对战（无尽云路）——最多 4 个位置、各自就绪与输入、电脑状态转发、比赛中锁定、断线保留位置、断流自动恢复。
 for(const file of ['/shared/maze/endless.js','/screen-web/versus.js','/screen-web/versus-renderer.js','/screen-web/versus.css'])assert.equal((await fetch(base+file)).status,200,file);
 const v3=await connect('phone','vs-phone-3'),v4=await connect('phone','vs-phone-4'),v5=await connect('phone','vs-phone-5');
 send(screen,{type:'maze_mode',mode:'versus'});for(const ws of [phone,late,v5]){const sub=await wait(ws,m=>m.type==='maze_subscription'&&m.mode==='versus');assert.equal(sub.active,true);assert.equal(sub.joined,false);}
 const join=async(ws,slot)=>{send(ws,{type:'maze_join',join:true});const sub=await wait(ws,m=>m.type==='maze_subscription'&&m.joined);assert.equal(sub.slot,slot);};
 await join(phone,0);await join(late,1);await join(v3,2);await join(v4,3);
 let roster=await wait(screen,m=>m.type==='maze_roster'&&m.slots.filter(Boolean).length===4);assert.equal(roster.slots[1].id,'late-phone');assert.equal(roster.allReady,false);
 send(v5,{type:'maze_join',join:true});assert.match((await wait(v5,m=>m.type==='error')).message,/已满/);send(screen,{type:'maze_versus_keyboard',join:true});assert.match((await wait(screen,m=>m.type==='error')).message,/已满/);
 send(v4,{type:'maze_join',join:false});await wait(v4,m=>m.type==='maze_subscription'&&m.mode==='versus'&&!m.joined);send(v4,{type:'maze_command',action:'start'});assert.match((await wait(v4,m=>m.type==='error')).message,/加入对战/);
 send(screen,{type:'maze_versus_keyboard',join:true});roster=await wait(screen,m=>m.type==='maze_roster'&&m.slots[3]?.kind==='keyboard');
 for(const ws of [phone,late,v3])send(ws,{type:'maze_ready',ready:true,source:'joystick'});roster=await wait(screen,m=>m.type==='maze_roster'&&m.allReady);assert.ok(roster.slots.slice(0,3).every(s=>s.ready&&s.connected));
 send(phone,{type:'maze_input',x:.5,y:-1,seq:500});const input=await wait(screen,m=>m.type==='maze_input'&&m.phoneId==='maze-phone');assert.equal(input.slot,0);assert.ok(Math.abs(Math.hypot(input.x,input.y)-1)<1e-9,'输入归一化');
 send(late,{type:'maze_input',x:0,y:-1,seq:1});assert.equal((await wait(screen,m=>m.type==='maze_input'&&m.phoneId==='late-phone')).slot,1);
 send(late,{type:'practice_arm'});await new Promise(r=>setTimeout(r,200));assert.ok(!late.queue.some(m=>m.type==='error'),'对战中手机的高尔夫操作被忽略');
 send(phone,{type:'maze_command',action:'start'});assert.equal((await wait(screen,m=>m.type==='maze_command'&&m.action==='start')).slot,0);
 const players=[0,1,2,3].map(slot=>({slot,alive:true,rank:null,distance:12+slot,gap:6.5}));
 send(screen,{type:'maze_versus_state',phase:'playing',elapsed:4.2,speed:1.6,stage:1,solo:false,winner:null,round:1,players});
 for(const [ws,slot] of [[phone,0],[late,1],[v3,2],[v5,null]]){const st=await wait(ws,m=>m.type==='maze_versus_state'&&m.phase==='playing');assert.equal(st.you,slot);assert.equal(st.players.length,4);assert.equal(st.stage,1);}
 assert.equal((await wait(v5,m=>m.type==='maze_subscription'&&m.locked)).joined,false);
 send(v5,{type:'maze_join',join:true});assert.match((await wait(v5,m=>m.type==='error')).message,/本局进行中/);send(late,{type:'maze_join',join:false});assert.match((await wait(late,m=>m.type==='error')).message,/不能退出/);
 send(screen,{type:'maze_versus_state',phase:'playing',elapsed:1,players:[{slot:0,alive:true,rank:9,distance:1}]});assert.match((await wait(screen,m=>m.type==='error')).message,/对战状态无效/);
 v3.close();const offline=await wait(screen,m=>m.type==='maze_pause'&&m.reason==='controller_offline'&&m.slot===2);assert.equal(offline.phoneId,'vs-phone-3');roster=await wait(screen,m=>m.type==='maze_roster'&&m.slots[2]&&!m.slots[2].connected);
 // 断流：停发 0.55 秒以上判为断流并暂停；手机恢复发送后自动恢复就绪。
 await wait(screen,m=>m.type==='maze_pause'&&m.reason==='stream_gap'&&m.slot===0,2500);roster=await wait(screen,m=>m.type==='maze_roster'&&m.slots[0]&&!m.slots[0].ready);
 send(phone,{type:'maze_input',x:0,y:-1,seq:501});await wait(screen,m=>m.type==='maze_roster'&&m.slots[0]?.ready);await wait(screen,m=>m.type==='maze_input'&&m.phoneId==='maze-phone'&&m.y<0);
 send(screen,{type:'maze_versus_state',phase:'over',elapsed:40,speed:4,stage:3,solo:false,winner:1,round:1,players:players.map(p=>({...p,alive:p.slot===1,rank:p.slot+1,gap:null}))});
 assert.equal((await wait(late,m=>m.type==='maze_versus_state'&&m.phase==='over')).winner,1);roster=await wait(screen,m=>m.type==='maze_roster'&&m.phase==='over'&&!m.slots[2]);
 send(screen,{type:'maze_mode',mode:'solo'});const solo=await wait(phone,m=>m.type==='maze_subscription'&&m.mode==='solo');assert.equal(solo.active,true);assert.equal((await wait(late,m=>m.type==='maze_subscription'&&m.mode==='solo')).active,false);
 console.log('Maze integration passed: assets, pairing, ownership, continuous input, state, pause, commands, recenter, stale input, disconnect, view exit, 9 maps, screen view relay, soundtrack, and 0.24 versus (4 slots, join/leave/full, keyboard slot, per-phone input, state relay, match lock, offline slot keep, stream-gap recovery, mode switch).');
}finally{for(const ws of sockets)ws.terminate();clearTimeout(stop);const ended=once(server,'exit');server.kill('SIGTERM');await ended;}
