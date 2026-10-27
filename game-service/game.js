import {MAX_PLAYERS} from '../shared/players.js';
import {randomBytes} from 'node:crypto';
import {COURSES,makeHole} from '../shared/courses.js';
import {simulateShot} from './physics.js';
export class Game {
 constructor(saved=null){this.state=saved?.protocolVersion===1?structuredClone(saved):{protocolVersion:1,stateVersion:0,phase:'lobby',courseId:'sunny',mode:3,holeIndex:0,strokes:0,scores:[],ball:{x:0,z:0},aim:0,seed:1};this.sequences=new Map();this.state.armed=false;this.state.shotHistory??=[];if(!this.state.players?.length){this.state.players=[{id:'solo',deviceId:null,name:'单人球手',number:0,style:'sage',ball:{...this.state.ball},strokes:this.state.strokes,scores:this.state.scores,aim:this.state.aim,holeDone:['hole_complete','finished'].includes(this.state.phase)}];this.state.activePlayerId='solo';this.state.multiplayer=false;}if(this.state.phase==='animating')this.settle();}
 get hole(){return makeHole(this.state.courseId,this.state.holeIndex,this.state.seed);}
 get player(){return this.state.players.find(p=>p.id===this.state.activePlayerId)||this.state.players[0];}
 savePlayer(){Object.assign(this.player,{ball:{...this.state.ball},strokes:this.state.strokes,scores:[...this.state.scores],aim:this.state.aim});}
 selectPlayer(id){this.state.activePlayerId=id;const p=this.player;Object.assign(this.state,{ball:{...p.ball},strokes:p.strokes,scores:[...p.scores],aim:p.aim||0,armed:false});}
 snapshot(){return {...this.state,hole:this.hole};}
 bump(){this.state.stateVersion++;return this.snapshot();}
 start(courseId,mode,roster=[]){
  if(!COURSES.some(c=>c.id===courseId)||![3,9].includes(mode))throw Error('请选择球场，以及 3 洞或 9 洞赛制。');
  if(roster.length>MAX_PLAYERS||new Set(roster.map(p=>p.id)).size!==roster.length)throw Error(`对战最多支持 ${MAX_PLAYERS} 位不同球手。`);
  const players=(roster.length?roster:[{id:'solo',deviceId:null,name:'单人球手',number:0,style:'sage'}]).map(p=>({...p,ball:{x:0,z:0},strokes:0,scores:[],aim:0,holeDone:false}));
  this.state={protocolVersion:1,stateVersion:this.state.stateVersion,phase:'playing',armed:false,courseId,mode,holeIndex:0,strokes:0,scores:[],ball:{x:0,z:0},aim:0,seed:randomBytes(4).readUInt32LE(),players,activePlayerId:players[0].id,multiplayer:players.length>1,shotHistory:[]};return this.bump();
 }
 updateProfile(profile){const p=this.state.players.find(p=>p.deviceId===profile.id);if(p){Object.assign(p,{name:profile.name,style:profile.style,number:profile.number});this.bump();}}
 setAim(aim){if(this.state.phase!=='playing')return this.snapshot();if(!Number.isFinite(aim))throw Error('瞄准方向无效。');this.state.aim=Math.max(-80,Math.min(80,aim));this.savePlayer();return this.bump();}
 setArmed(armed){if(typeof armed!=='boolean')throw Error('准备状态无效。');if(this.state.phase!=='playing')throw Error('请等待球完全停稳。');this.state.armed=armed;return this.bump();}
 validateSwing(input,client){const {power,dir,seq,stateVersion}=input;if(!Number.isFinite(power)||power<=0||power>1||!Number.isFinite(dir)||Math.abs(dir)>1||!Number.isSafeInteger(seq)||seq<0)throw Error('挥杆数据无效。');if((this.sequences.get(client)??-1)>=seq)throw Error('这次挥杆已经收到，请勿重复发送。');if(this.state.phase!=='playing')throw Error('请等待球完全停稳。');if(stateVersion!==this.state.stateVersion)throw Error('球局状态已更新，请重试。');}
 remember(input,client){this.sequences.set(client,input.seq);if(this.sequences.size>500)this.sequences.delete(this.sequences.keys().next().value);}
 rehearse(input,client){this.validateSwing(input,client);const shot=simulateShot(this.hole,this.state.ball,input.power,input.dir,this.state.aim);this.remember(input,client);return {...shot,playerId:this.player.id,playerName:this.player.name};}
 stroke(input,client,meta={}){
  this.validateSwing(input,client);if(!this.state.armed)throw Error('请先点击“准备击球”。');this.remember(input,client);this.savePlayer();const player=this.player,aim=this.state.aim;this.state.armed=false;
  const shot=simulateShot(this.hole,this.state.ball,input.power,input.dir,aim),added=1+(shot.penalty?1:0);this.state.ball=shot.to;this.state.strokes=Math.min(12,this.state.strokes+added);this.state.aim=0;
  if(shot.holed||this.state.strokes>=12){this.state.scores.push({hole:this.state.holeIndex+1,par:this.hole.par,strokes:this.state.strokes,capped:!shot.holed});player.holeDone=true;}this.savePlayer();
  const allDone=this.state.players.every(p=>p.holeDone);this.state.pendingPhase=allDone?(this.state.holeIndex+1===this.state.mode?'finished':'hole_complete'):'playing';
  const index=this.state.players.indexOf(player);this.state.pendingNextPlayerId=player.id;if(!allDone)for(let offset=1;offset<=this.state.players.length;offset++){const next=this.state.players[(index+offset)%this.state.players.length];if(!next.holeDone){this.state.pendingNextPlayerId=next.id;break;}}
  const record={id:this.state.stateVersion+1,time:new Date().toISOString(),playerId:player.id,playerName:player.name,deviceId:player.deviceId,phoneNumber:player.number,source:meta.source||'screen',inputDeviceId:meta.source==='phone'?client:null,hole:this.state.holeIndex+1,stroke:this.state.strokes,power:input.power,dir:input.dir,seq:input.seq,peak:Number.isFinite(input.peak)?input.peak:null,backswingMs:Number.isFinite(input.backswingMs)?input.backswingMs:null,downswingMs:Number.isFinite(input.downswingMs)?input.downswingMs:null,inputSettings:meta.inputSettings||null,aim,club:shot.club,from:shot.from,to:shot.to,travel:shot.travel,penalty:shot.penalty,holed:shot.holed,calibration:meta.calibration||null};this.state.shotHistory.push(record);this.state.shotHistory=this.state.shotHistory.slice(-500);
  this.state.phase='animating';this.bump();return {...shot,playerId:player.id,playerName:player.name,stateVersion:this.state.stateVersion};
 }
 settle(){if(this.state.phase==='animating'){this.state.phase=this.state.pendingPhase||'playing';if(this.state.pendingNextPlayerId)this.selectPlayer(this.state.pendingNextPlayerId);delete this.state.pendingPhase;delete this.state.pendingNextPlayerId;this.bump();}return this.snapshot();}
 next(){if(this.state.phase!=='hole_complete')throw Error('请先完成当前球洞。');this.state.holeIndex++;for(const p of this.state.players)Object.assign(p,{strokes:0,ball:{x:0,z:0},aim:0,holeDone:false});this.selectPlayer(this.state.players[0].id);this.state.phase='playing';return this.bump();}
 lobby(){if(this.state.phase==='animating')throw Error('请等待球完全停稳。');this.state.phase='lobby';this.state.armed=false;return this.bump();}
}
