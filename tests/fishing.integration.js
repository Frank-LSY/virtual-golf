import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
// 体感钓鱼 · 真实 WebSocket：6 台手机加入、满员、键盘位、就绪、开始、竿姿 / 准备 / 抛投（去重）、本地权威快照、
// 断流暂停与恢复、比赛锁定、断线保留位置、回到大厅释放、练习模式、高尔夫隔离、电脑所在游戏转告手机。
const base='http://localhost:5203',dataDir=path.resolve('.local/fishing-integration-'+Date.now());await mkdir(dataDir,{recursive:true});
const server=spawn(process.execPath,['local-gateway/server.js'],{env:{...process.env,PORT:'5203',HTTPS_PORT:'8503',SWINGLINK_DATA_DIR:dataDir},stdio:['ignore','pipe','pipe']});
const sockets=[],stop=setTimeout(()=>{server.kill();console.error('Fishing integration timed out');process.exit(1);},60000);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 await new Promise((resolve,reject)=>{server.stdout.on('data',b=>{if(b.toString().includes('本机地址：'))resolve();});server.once('exit',code=>reject(Error('Server exited '+code)));});
 const config=await fetch(base+'/api/config').then(r=>r.json());
 for(const file of ['/shared/fishing/rules.js','/shared/fishing/angler.js','/shared/fishing/match.js','/shared/fishing/input.js','/screen-web/fishing.js','/screen-web/fishing-renderer.js','/screen-web/fishing.css','/screen-web/fishing-sfx.js','/phone-web/fishing-controller.js','/phone-web/fishing-entry.js','/phone-web/fishing.css'])assert.equal((await fetch(base+file)).status,200,file);
 async function connect(role,id){const ws=new WebSocket(`${base.replace('http','ws')}/ws?token=${config.token}`,{origin:base});sockets.push(ws);ws.queue=[];ws.on('message',m=>ws.queue.push(JSON.parse(m)));await once(ws,'open');ws.send(JSON.stringify({type:'hello',role,clientId:id,protocolVersion:1}));await wait(ws,m=>m.type==='ready');return ws;}
 async function wait(ws,predicate,limit=4000){const end=Date.now()+limit;while(Date.now()<end){const i=ws.queue.findIndex(predicate);if(i>=0)return ws.queue.splice(i,1)[0];await sleep(10);}throw Error('Missing packet '+predicate+'; '+JSON.stringify(ws.queue.slice(-5)).slice(0,600));}
 const send=(ws,m)=>ws.send(JSON.stringify(m));
 const screen=await connect('screen','fish-pc'),phones=[];for(let i=0;i<7;i++)phones.push(await connect('phone','fish-phone-'+i));
 send(phones[0],{type:'fish_join',join:true});assert.match((await wait(phones[0],m=>m.type==='error')).message,/还没有打开/);
 send(screen,{type:'fish_view',active:true});await wait(screen,m=>m.type==='fish_host'&&m.host);for(const p of phones)assert.equal((await wait(p,m=>m.type==='fish_subscription'&&m.active)).joined,false);
 send(screen,{type:'screen_view',game:'fishing',view:'fishing'});assert.equal((await wait(phones[0],m=>m.type==='screen_view'&&m.game==='fishing')).view,'fishing');
 for(let i=0;i<6;i++){send(phones[i],{type:'fish_join',join:true});assert.equal((await wait(phones[i],m=>m.type==='fish_subscription'&&m.joined)).slot,i);}
 send(phones[6],{type:'fish_join',join:true});assert.match((await wait(phones[6],m=>m.type==='error')).message,/已满/);send(screen,{type:'fish_keyboard',join:true});assert.match((await wait(screen,m=>m.type==='error')).message,/已满/);
 send(screen,{type:'fish_kick',slot:5});await wait(phones[5],m=>m.type==='fish_subscription'&&!m.joined);send(screen,{type:'fish_keyboard',join:true});let roster=await wait(screen,m=>m.type==='fish_roster'&&m.slots[5]?.kind==='keyboard');assert.equal(roster.allReady,false);
 send(phones[6],{type:'fish_pose',pitch:1,roll:1,seq:1});send(phones[6],{type:'fish_arm'});assert.match((await wait(phones[6],m=>m.type==='error')).message,/加入钓鱼/);
 send(screen,{type:'fish_setup',mode:'match',roundSeconds:60});assert.equal((await wait(screen,m=>m.type==='fish_roster'&&m.setup.roundSeconds===60)).setup.mode,'match');
 for(let i=0;i<5;i++)send(phones[i],{type:'fish_ready',ready:true,source:i===4?'touch':'motion'});roster=await wait(screen,m=>m.type==='fish_roster'&&m.allReady);assert.equal(roster.slots[4].source,'touch');
 // 竿姿流：每台手机约 30 Hz。
 let seq=10,streaming=true;const pump=(async()=>{while(streaming){seq++;for(let i=0;i<5;i++)if(phones[i].readyState===1&&!phones[i].silent)send(phones[i],{type:'fish_pose',pitch:0,roll:i===0?-12:0,seq});await sleep(33);}})();
 send(phones[0],{type:'fish_command',action:'start'});let st=await wait(screen,m=>m.type==='fish_state'&&m.state?.phase==='countdown');assert.equal(st.state.anglers.length,6);assert.deepEqual(st.state.open,['shallow','reeds']);assert.equal(st.state.roundSeconds,60);
 const personal=await wait(phones[2],m=>m.type==='fish_personal'&&m.state?.you);assert.equal(personal.state.you.slot,2);assert.equal(personal.state.players,6);
 send(phones[6],{type:'fish_join',join:true});assert.match((await wait(phones[6],m=>m.type==='error')).message,/本局进行中/);send(phones[1],{type:'fish_join',join:false});assert.match((await wait(phones[1],m=>m.type==='error')).message,/不能退出/);
 st=await wait(screen,m=>m.type==='fish_state'&&m.events?.some(e=>e.kind==='go'),6000);assert.equal(st.state.phase,'playing');
 send(phones[0],{type:'fish_arm'});await wait(phones[0],m=>m.type==='fish_personal'&&m.events?.some(e=>e.kind==='armed'));
 send(phones[0],{type:'fish_cast',power:.17,dir:0,aimRoll:-12,eventId:'c1'});send(phones[0],{type:'fish_cast',power:.9,dir:0,eventId:'c1'});
 const cast=await wait(screen,m=>m.type==='fish_state'&&m.events?.some(e=>e.kind==='cast'&&e.id==='fish-phone-0'));const ce=cast.events.find(e=>e.kind==='cast');assert.ok(ce.distance<11,'同一事件编号只抛一次（用第一次的力量）');assert.ok(ce.angle<0,'瞄准取后引前的左右倾');
 const splash=await wait(screen,m=>m.type==='fish_state'&&m.events?.some(e=>e.kind==='splash'&&e.id==='fish-phone-0'),3000);assert.equal(splash.events.find(e=>e.kind==='splash').zone,'shallow');
 st=await wait(screen,m=>m.type==='fish_state'&&m.state.anglers[0].phase==='lure');assert.ok(st.state.anglers[0].bobber);
 send(phones[0],{type:'fish_cast',power:2,eventId:'bad'});assert.match((await wait(phones[0],m=>m.type==='error')).message,/抛投数据无效/);send(phones[0],{type:'fish_pose',pitch:200,roll:0,seq:99999});assert.match((await wait(phones[0],m=>m.type==='error')).message,/竿姿数据无效/);
 // 高尔夫隔离：钓鱼时手机的挥杆包被忽略。
 phones[3].queue.length=0;send(phones[3],{type:'practice_arm',armed:true});await sleep(150);assert.ok(!phones[3].queue.some(m=>m.type==='error'));
 // 断流：手机 2 停发竿姿 → 全场暂停；没就绪不能继续；恢复后可以继续。
 phones[2].silent=true;st=await wait(screen,m=>m.type==='fish_state'&&m.state?.phase==='paused'&&m.state.pauseReason==='stream_gap',3000);assert.equal(st.state.pauseSlot,2);assert.deepEqual(st.state.waiting,[2]);
 const left=st.state.timeLeft;await sleep(300);send(screen,{type:'fish_command',action:'resume'});assert.match((await wait(screen,m=>m.type==='error')).message,/3P/);
 phones[2].silent=false;send(phones[2],{type:'fish_ready',ready:true,source:'motion'});await wait(screen,m=>m.type==='fish_roster'&&m.allReady);send(phones[2],{type:'fish_command',action:'resume'});st=await wait(screen,m=>m.type==='fish_state'&&m.state?.phase==='resuming');assert.ok(Math.abs(st.state.timeLeft-left)<.05,'暂停时不计时');await wait(screen,m=>m.type==='fish_state'&&m.state?.phase==='playing',3000);
 // 断线：比赛中保留位置并暂停；回到大厅时释放。
 phones[1].close();st=await wait(screen,m=>m.type==='fish_state'&&m.state?.phase==='paused'&&m.state.pauseReason==='controller_offline',3000);roster=await wait(screen,m=>m.type==='fish_roster'&&m.slots[1]&&!m.slots[1].connected);
 send(screen,{type:'fish_command',action:'lobby'});await wait(screen,m=>m.type==='fish_state'&&m.state===null);roster=await wait(screen,m=>m.type==='fish_roster'&&m.phase==='lobby'&&!m.slots[1]);
 // 练习模式：不限时，深水开放。
 send(screen,{type:'fish_setup',mode:'practice'});await wait(screen,m=>m.type==='fish_roster'&&m.setup.mode==='practice');send(screen,{type:'fish_command',action:'start'});st=await wait(screen,m=>m.type==='fish_state'&&m.state?.mode==='practice');assert.equal(st.state.timeLeft,null);assert.deepEqual(st.state.open,['shallow','reeds','deep']);
 send(screen,{type:'fish_input',kind:'pose',pitch:0,roll:0});send(screen,{type:'fish_command',action:'lobby'});await wait(screen,m=>m.type==='fish_state'&&m.state===null);
 // 离开钓鱼页面：手机不再显示钓鱼。
 send(screen,{type:'fish_view',active:false});assert.equal((await wait(phones[0],m=>m.type==='fish_subscription'&&!m.active)).active,false);
 streaming=false;await pump;
 console.log('Fishing integration passed: assets, host, 6 slots / full / keyboard slot / kick, setup, ready sources, start from phone, authoritative snapshots + personal state, match lock, arm / cast dedupe / pre-swing aim, splash into zone, input validation, golf isolation, stream-gap pause + resume gate, offline slot keep + lobby release, practice mode, view exit.');
}finally{for(const ws of sockets)ws.terminate();clearTimeout(stop);const ended=once(server,'exit');server.kill('SIGTERM');await ended;}
