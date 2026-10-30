import {MazeChannel} from './maze-channel.js';
import {sendAudio} from './audio-response.js';
import {roundAnimationMs} from '../shared/travel.js';
import {MAX_PLAYERS} from '../shared/players.js';
import http from 'node:http';
import https from 'node:https';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {networkInterfaces} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomBytes,X509Certificate,createHash} from 'node:crypto';
import {WebSocketServer,WebSocket} from 'ws';
import QRCode from 'qrcode';
import {Game} from '../game-service/game.js';
import {TrainingChannel} from './training-channel.js';
import {RoundChannel} from './round-channel.js';
import {Players} from './players.js';
import {MLChannel} from './ml-channel.js';

const ROOT=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const port=Number(process.env.PORT||5173),tlsPort=Number(process.env.HTTPS_PORT||8443);
const token=randomBytes(24).toString('hex');
const dataDir=process.env.SWINGLINK_DATA_DIR||path.join(ROOT,'.local');
const certDir=process.env.SWINGLINK_CERT_DIR||path.join(ROOT,'certs');
const addresses=Object.entries(networkInterfaces()).flatMap(([name,items])=>items.filter(n=>n.family==='IPv4'&&!n.internal&&!/virtual|vEthernet|WSL|docker/i.test(name)).map(n=>n.address));
const secure=existsSync(path.join(certDir,'server-key.pem'))&&existsSync(path.join(certDir,'server.pem'));
let caName='挥杆之间 本地证书';try{caName=new X509Certificate(await readFile(path.join(certDir,'rootCA.pem'))).subject.split('\n').find(s=>s.startsWith('CN='))?.slice(3)||caName;}catch{}
let saved;try{saved=JSON.parse(await readFile(path.join(dataDir,'game.json'),'utf8'));}catch{}
let profileData,practiceData;try{profileData=JSON.parse(await readFile(path.join(dataDir,'players.json'),'utf8'));}catch{}try{practiceData=JSON.parse(await readFile(path.join(dataDir,'practice.json'),'utf8'));}catch{}
let rounds=[];try{rounds=JSON.parse(await readFile(path.join(dataDir,'rounds.json'),'utf8'));}catch{}
const players=new Players(profileData);
const game=new Game(saved),clients=new Set();let timer,heartbeat,writing=Promise.resolve();
function persist(){const data=JSON.stringify(game.state);writing=writing.then(async()=>{await mkdir(dataDir,{recursive:true});await writeFile(path.join(dataDir,'game.tmp'),data);await rename(path.join(dataDir,'game.tmp'),path.join(dataDir,'game.json'));}).catch(e=>console.error('无法保存本局进度：',e.message));}
function persistExtra(name,value){const data=JSON.stringify(value);writing=writing.then(async()=>{await mkdir(dataDir,{recursive:true});await writeFile(path.join(dataDir,name+'.tmp'),data);await rename(path.join(dataDir,name+'.tmp'),path.join(dataDir,name+'.json'));}).catch(e=>console.error('无法保存记录：',e.message));}
function send(ws,data){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data));}
function broadcast(data){for(const c of clients)send(c,data);}
function controller(){const phones=[...clients].filter(c=>c.role==='phone');return {connected:phones.length>0,calibrated:phones.some(c=>c.calibrated),count:phones.length,phones:players.snapshot(clients)};}
const maze=new MazeChannel(clients,send);
let screenView={game:'hub',view:'hub'};
const mazeTimer=setInterval(()=>maze.tick(),100);
const training=new TrainingChannel(clients,send,{players,saved:practiceData,persist:()=>persistExtra('practice',training.saved())});
const ml=await new MLChannel(clients,send,{dir:path.join(dataDir,'ml'),training,players}).load();
const round=new RoundChannel(game,clients,send,training,{state,shot:(shot,source)=>{broadcast({type:'shot_result',shot,source});clearTimeout(timer);timer=setTimeout(()=>{game.settle();state();},roundAnimationMs(shot,source));}});
function status(){broadcast({type:'controller_status',...controller()});training.changed();ml.changed();if(round.sync())state();}
function state(){round.sync();broadcast({type:'room_state',state:game.snapshot()});broadcast({type:'input_lock',locked:game.state.phase!=='playing'});persist();}
const mimes={'.webp':'image/webp','.mp3':'audio/mpeg','.m4a':'audio/mp4','.ogg':'audio/ogg','.wav':'audio/wav','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.cer':'application/x-x509-ca-cert'};
async function handler(req,res){
 try{
  const url=new URL(req.url,'http://localhost');
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/api/health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:true,app:'swinglink',version:'0.21.0'}));}
  if(url.pathname==='/api/config'){
   const host=addresses[0]||'localhost',phoneUrl=`${secure?'https':'http'}://${host}:${secure?tlsPort:port}/phone?token=${token}`;
   res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({token,secure,caName,phoneUrl,addresses,port,tlsPort,qr:await QRCode.toString(phoneUrl,{type:'svg',margin:1,color:{dark:'#244d3e',light:'#ffffff'}})}));
  }
  let rel=url.pathname==='/'||url.pathname==='/screen.html'?'screen-web/index.html':url.pathname==='/phone'||url.pathname==='/phone.html'?'phone-web/index.html':url.pathname.slice(1);
  if(rel==='local-ca.cer'){const body=await readFile(path.join(certDir,'rootCA.cer'));res.writeHead(200,{'Content-Type':mimes['.cer']});return res.end(body);}
  else if(rel.startsWith('vendor/three/'))rel='node_modules/three/build/'+rel.slice('vendor/three/'.length);
  else if(!/^(screen-web|phone-web|shared)\//.test(rel)&&!['screen-web/index.html','phone-web/index.html'].includes(rel)){res.writeHead(404);return res.end('未找到页面');}
  const file=path.resolve(ROOT,rel);
  if(!file.startsWith(ROOT+path.sep)||file.endsWith('key.pem')){res.writeHead(403);return res.end('禁止访问');}
  const body=await readFile(file),mime=mimes[path.extname(file)]||'application/octet-stream';if(mime.startsWith('audio/'))return sendAudio(req,res,body,mime);
  if(/^screen-web\/assets\/environment\/[a-z0-9-]+-v\d+\.webp$/.test(rel)){
   const etag='"'+createHash('sha256').update(body).digest('hex').slice(0,24)+'"';res.setHeader('Cache-Control','public, max-age=31536000, immutable');res.setHeader('ETag',etag);
   if(req.headers['if-none-match']===etag){res.writeHead(304);return res.end();}
  }
  res.writeHead(200,{'Content-Type':mime,'Content-Length':body.length});res.end(req.method==='HEAD'?undefined:body);
 }catch{res.writeHead(404);res.end('未找到页面');}
}
function attach(server){
 const wss=new WebSocketServer({noServer:true,maxPayload:16384});
 server.on('upgrade',(req,socket,head)=>{
  const url=new URL(req.url,'http://localhost');
  let validOrigin=false;try{validOrigin=new URL(req.headers.origin).host===req.headers.host;}catch{}
  if(url.pathname!=='/ws'||url.searchParams.get('token')!==token||!validOrigin){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');return socket.destroy();}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
 });
 wss.on('connection',ws=>{
  ws.alive=true;ws.on('pong',()=>ws.alive=true);clients.add(ws);
  ws.on('message',raw=>{
   try{
    const m=JSON.parse(raw.toString());
    if(m.type==='hello'){
     if(ws.role)throw Error('已经连接。');
     if(!['screen','phone'].includes(m.role)||typeof m.clientId!=='string'||m.clientId.length>100||m.protocolVersion!==1)throw Error('请刷新页面后重新连接。');
     for(const old of clients)if(old!==ws&&old.role===m.role&&old.clientId===m.clientId){clients.delete(old);old.close(4001,'同一手柄已重新接入');}
     ws.role=m.role;ws.clientId=m.clientId;if(ws.role==='phone'){send(ws,{type:'player_identity',player:players.ensure(ws.clientId)});persistExtra('players',players.saved());}send(ws,{type:'ready',protocolVersion:1});send(ws,{type:'room_state',state:game.snapshot()});send(ws,{type:'input_lock',locked:game.state.phase!=='playing'});ml.connected(ws);maze.connected(ws);if(ws.role==='phone')send(ws,{type:'screen_view',...screenView});status();return;
    }
    if(!ws.role)throw Error('请先连接。');
    if(m.type==='player_profile'&&ws.role==='phone'){const profile=players.update(ws.clientId,m);game.updateProfile(profile);send(ws,{type:'player_identity',player:profile});ml.pushProfile(ws.clientId);persistExtra('players',players.saved());status();state();return;}
    if(m.type==='calibration_progress'&&ws.role==='phone'){const now=Date.now();if(now-(ws.lastCalProgress||0)<150)return;ws.lastCalProgress=now;ws.calibrationProgress={step:String(m.step||'').slice(0,40),hint:String(m.hint||'').slice(0,180),progress:Math.max(0,Math.min(1,Number(m.progress)||0))};status();return;}
    // 电脑当前所在的游戏（大厅 / 高尔夫 / 云端滚球），转告手机，让手机顶部显示对应的游戏。
    if(m.type==='screen_view'&&ws.role==='screen'){screenView={game:['hub','golf','skyroll'].includes(m.game)?m.game:'hub',view:String(m.view||'').slice(0,12)};for(const c of clients)if(c.role==='phone')send(c,{type:'screen_view',...screenView});return;}
    if(maze.handle(ws,m))return;
    if(ws.role==='phone'&&maze.active()&&ws===maze.phone()&&['swing','test_swing','round_arm','practice_arm'].includes(m.type))return;
    if(ml.handle(ws,m))return;
    if(training.handle(ws,m)){if(round.sync())state();return;}
    if(round.handle(ws,m))return;
    if(m.type==='calibrated'&&ws.role==='phone'){
     if(!Number.isFinite(m.peakMax)||m.peakMax<80||!Number.isFinite(m.dirZero))throw Error('请在手机上启用体感。');ws.calibrated=true;ws.calibrationProgress=null;ws.calibration={axis:['alpha','beta','gamma','auto'].includes(m.axis)?m.axis:'beta',peakMax:m.peakMax,dirZero:m.dirZero,noise:Number.isFinite(m.noise)?m.noise:0,verified:!!m.verified,quality:Number.isFinite(m.quality)?m.quality:null,mode:['model','auto'].includes(m.mode)?m.mode:'guided',time:new Date().toISOString()};status();return;
    }
    if(m.type==='uncalibrated'&&ws.role==='phone'){ws.calibrated=false;status();return;}
    if(ws.role!=='screen')throw Error('请在电脑上设置本局。');
    if(m.type==='round_records'){send(ws,{type:'round_records',rounds,current:game.snapshot()});return;}
    if(m.type==='start_round'){if(['animating','transferring'].includes(game.state.phase))throw Error('请等待球停稳或球车到站。');let roster=[];if(m.multiplayer){if(!Array.isArray(m.playerIds)||m.playerIds.length<2||m.playerIds.length>MAX_PLAYERS||new Set(m.playerIds).size!==m.playerIds.length||(m.playerCount!==undefined&&m.playerCount!==m.playerIds.length))throw Error(`请按选定人数勾选 2–${MAX_PLAYERS} 台不同手机参加对战。`);roster=m.playerIds.map(id=>{if(![...clients].some(c=>c.role==='phone'&&c.clientId===id))throw Error('有参赛手机已离线，请重新选择。');return {...players.ensure(id),deviceId:id};});}else{const phone=training.phone();if(phone)roster=[{...players.ensure(phone.clientId),deviceId:phone.clientId}];}const previous=structuredClone(game.state);game.start(m.courseId,m.mode,roster);if(previous.shotHistory?.length){rounds.push(previous);rounds=rounds.slice(-20);persistExtra('rounds',rounds);}state();}
    else if(m.type==='aim'){game.setAim(m.aim);state();}
    else if(m.type==='next_hole'||m.type==='return_clubhouse'){game.transfer(m.type==='next_hole'?'next':'clubhouse');clearTimeout(timer);const trip=game.state.transfer;timer=setTimeout(()=>{game.arrive(trip.id);state();},trip.duration+20);state();}
    else if(m.type==='skip_transfer'){if(m.transferId!==game.state.transfer?.id||m.stateVersion!==game.state.stateVersion)throw Error('接驳状态已更新，请重试。');clearTimeout(timer);game.arrive(m.transferId,true);state();}
    else if(m.type==='lobby'){game.lobby();state();}
    else throw Error('无法识别此操作。');
   }catch(e){send(ws,{type:'error',message:e instanceof SyntaxError?'消息格式无效，请刷新页面后重试。':e.message});}
  });
  ws.on('close',()=>{clients.delete(ws);ml.disconnected(ws);maze.disconnected(ws);status();});ws.on('error',()=>{});
 });
 return wss;
}
function listenError(error){console.error(error.code==='EADDRINUSE'?'启动失败：端口已被占用。请先关闭旧版游戏的启动窗口，再重新打开。':'本地服务无法启动，请检查网络与文件权限。错误代码：'+error.code);shutdown(1);}
const server=http.createServer(handler);server.on('error',listenError);attach(server);server.listen(port,'0.0.0.0',()=>console.log(`挥杆之间 · 本机地址： http://localhost:${port}`));
let tlsServer;
if(secure){tlsServer=https.createServer({key:await readFile(path.join(certDir,'server-key.pem')),cert:await readFile(path.join(certDir,'server.pem'))},handler);tlsServer.on('error',listenError);attach(tlsServer);tlsServer.listen(tlsPort,'0.0.0.0',()=>console.log(`手机手柄 · https://${addresses[0]||'localhost'}:${tlsPort}/phone`));}
heartbeat=setInterval(()=>{for(const c of clients){if(!c.alive){c.terminate();clients.delete(c);continue;}c.alive=false;c.ping();}},15000);
function shutdown(code=0){clearInterval(heartbeat);clearInterval(mazeTimer);clearTimeout(timer);ml.cancel();for(const c of clients)c.close();server.close();tlsServer?.close();Promise.all([writing,ml.store.flush()]).finally(()=>process.exit(code));}
process.on('SIGINT',()=>shutdown());process.on('SIGTERM',()=>shutdown());
