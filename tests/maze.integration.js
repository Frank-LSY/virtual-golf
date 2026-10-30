import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

const base='http://localhost:5201',dataDir=path.resolve('.local/maze-integration-'+Date.now());await mkdir(dataDir,{recursive:true});
const server=spawn(process.execPath,['local-gateway/server.js'],{env:{...process.env,PORT:'5201',HTTPS_PORT:'8501',SWINGLINK_DATA_DIR:dataDir},stdio:['ignore','pipe','pipe']});
const sockets=[],stop=setTimeout(()=>{server.kill();console.error('Maze integration timed out');process.exit(1);},30000);
try{
 await new Promise((resolve,reject)=>{server.stdout.on('data',b=>{if(b.toString().includes('本机地址：'))resolve();});server.once('exit',code=>reject(Error('Server exited '+code)));});
 const config=await fetch(base+'/api/config').then(r=>r.json());
 for(const file of ['/','/phone','/shared/maze/levels.js','/shared/maze/physics.js','/shared/maze/tilt.js','/screen-web/maze.js','/screen-web/maze-renderer.js','/screen-web/maze.css','/phone-web/maze-entry.js','/phone-web/maze-controller.js','/phone-web/maze.css'])assert.equal((await fetch(base+file)).status,200,file);
 async function connect(role,id){const ws=new WebSocket(`${base.replace('http','ws')}/ws?token=${config.token}`,{origin:base});sockets.push(ws);ws.queue=[];ws.on('message',m=>ws.queue.push(JSON.parse(m)));await once(ws,'open');ws.send(JSON.stringify({type:'hello',role,clientId:id,protocolVersion:1}));await wait(ws,m=>m.type==='ready');return ws;}
 async function wait(ws,predicate,limit=3000){const end=Date.now()+limit;while(Date.now()<end){const i=ws.queue.findIndex(predicate);if(i>=0)return ws.queue.splice(i,1)[0];await new Promise(r=>setTimeout(r,10));}throw Error('Missing packet '+predicate+'; '+JSON.stringify(ws.queue));}
 const send=(ws,m)=>ws.send(JSON.stringify(m));
 const screen=await connect('screen','maze-pc'),phone=await connect('phone','maze-phone'),other=await connect('phone','other-phone');
 send(screen,{type:'maze_view',active:true});await wait(screen,m=>m.type==='maze_host'&&m.host);await wait(phone,m=>m.type==='maze_subscription'&&m.active);assert.equal((await wait(other,m=>m.type==='maze_subscription')).active,false);
 send(phone,{type:'maze_ready',ready:true,source:'joystick'});await wait(screen,m=>m.type==='maze_controller'&&m.ready);send(screen,{type:'maze_input_mode',phone:true});send(phone,{type:'maze_input',x:.6,y:-.2,seq:1});assert.equal((await wait(screen,m=>m.type==='maze_input')).x,.6);
 send(other,{type:'maze_input',x:1,y:0,seq:1});assert.match((await wait(other,m=>m.type==='error')).message,/不是当前/);
 send(screen,{type:'maze_state',phase:'playing',level:2,elapsed:12.5,falls:3});assert.equal((await wait(phone,m=>m.type==='maze_game_state')).falls,3);
 send(phone,{type:'maze_pause'});await wait(screen,m=>m.type==='maze_pause'&&m.reason==='phone_hidden');send(phone,{type:'maze_command',action:'retry'});await wait(screen,m=>m.type==='maze_command'&&m.action==='retry');
 send(screen,{type:'maze_rezero'});await wait(phone,m=>m.type==='maze_rezero');await wait(screen,m=>m.type==='maze_controller'&&!m.ready);send(phone,{type:'maze_ready',ready:true,source:'tilt'});await wait(screen,m=>m.type==='maze_controller'&&m.ready);send(phone,{type:'maze_input',x:0,y:0,seq:2});await wait(screen,m=>m.type==='maze_input');await wait(screen,m=>m.type==='maze_pause'&&m.reason==='stream_gap');
 const second=await connect('screen','second-pc');send(second,{type:'maze_view',active:true});assert.equal((await wait(second,m=>m.type==='maze_host')).host,false);
 send(screen,{type:'maze_select',phoneId:'other-phone'});await wait(other,m=>m.type==='maze_subscription'&&m.active);await wait(phone,m=>m.type==='maze_subscription'&&!m.active);send(other,{type:'maze_ready',ready:true,source:'joystick'});await wait(screen,m=>m.type==='maze_controller'&&m.ready);other.close();await wait(screen,m=>m.type==='maze_pause'&&m.reason==='controller_offline');
 send(screen,{type:'maze_select',phoneId:'maze-phone'});await wait(phone,m=>m.type==='maze_subscription'&&m.active);send(screen,{type:'maze_view',active:false});await wait(phone,m=>m.type==='maze_subscription'&&!m.active);
 console.log('Maze integration passed: assets, pairing, ownership, continuous input, state, pause, commands, recenter, stale input, disconnect and view exit.');
}finally{for(const ws of sockets)ws.terminate();clearTimeout(stop);const ended=once(server,'exit');server.kill('SIGTERM');await ended;}
