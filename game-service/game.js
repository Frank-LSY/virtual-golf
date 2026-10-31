import {holeTransfer} from '../shared/course-tour.js';
import {puttingRead} from '../shared/putting.js';
import {movementPlan} from '../shared/travel.js';
import {selectedClub,validClub} from '../shared/clubs.js';
import {MAX_PLAYERS} from '../shared/players.js';
import {randomBytes} from 'node:crypto';
import {COURSES,makeHole} from '../shared/courses.js';
import {simulateShot} from './physics.js';
import {terrainAdvice} from '../shared/terrain.js';
import {swingKin} from '../shared/training.js';
export const FORECAST_POWERS=Object.freeze([.1,.25,.4,.55,.7,.85,1]);
export class Game {
 constructor(saved=null){this.state=saved?.protocolVersion===1?structuredClone(saved):{protocolVersion:1,stateVersion:0,phase:'lobby',courseId:'sunny',mode:3,holeIndex:0,strokes:0,scores:[],ball:{x:0,z:0},aim:0,seed:1};this.sequences=new Map();this.state.armed=false;this.state.shotHistory??=[];if(!this.state.players?.length){this.state.players=[{id:'solo',deviceId:null,name:'单人球手',number:0,style:'sage',ball:{...this.state.ball},strokes:this.state.strokes,scores:this.state.scores,aim:this.state.aim,holeDone:['hole_complete','finished'].includes(this.state.phase)}];this.state.activePlayerId='solo';this.state.multiplayer=false;}this.state.clubId??='auto';for(const p of this.state.players)p.clubId??='auto';if(this.state.phase==='animating')this.settle();if(this.state.phase==='transferring'&&this.state.transfer)this.arrive(this.state.transfer.id,true);}
 get hole(){return makeHole(this.state.courseId,this.state.holeIndex,this.state.seed);}
 get player(){return this.state.players.find(p=>p.id===this.state.activePlayerId)||this.state.players[0];}
 savePlayer(){Object.assign(this.player,{ball:{...this.state.ball},strokes:this.state.strokes,scores:[...this.state.scores],aim:this.state.aim,clubId:this.state.clubId||'auto'});}
 selectPlayer(id){this.state.activePlayerId=id;const p=this.player;Object.assign(this.state,{ball:{...p.ball},strokes:p.strokes,scores:[...p.scores],aim:p.aim||0,clubId:p.clubId||'auto',armed:false});}
 snapshot(){const hole=this.hole,club=selectedClub(hole,this.state.ball,this.state.clubId);return {...this.state,hole,selectedClub:club,forecast:this.forecast(hole,club),recommendedClub:selectedClub(hole,this.state.ball),putting:club.id==='putter'?puttingRead(hole,this.state.ball,this.state.aim):null,terrain:terrainAdvice(hole,this.state.ball,club)};}
 // 预判：同一球杆、球位与瞄准下若干力度的落点和停球点，只用于大屏显示，不参与裁定。
 // landing / end 为无风结果；windLanding / windEnd 是同一杆在当前风下的落点（0.22 起在画面上以“风偏”箭头提示）。
 forecast(hole,club){
  if(this.state.phase!=='playing')return null;const b=this.state.ball,key=[this.state.courseId,this.state.holeIndex,this.state.seed,b.x,b.z,b.sandDepth||0,club.id,this.state.aim].join('|');
  if(this.forecastKey!==key){const calm={...hole,wind:{x:0,z:0,speed:0}},round=p=>({x:+p.x.toFixed(2),z:+p.z.toFixed(2)});this.forecastKey=key;this.forecastCache={clubId:club.id,aim:this.state.aim,wind:{x:hole.wind.x,z:hole.wind.z,speed:hole.wind.speed},marks:FORECAST_POWERS.map(power=>{const s=simulateShot(calm,b,power,0,this.state.aim,{club,capture:false}),end=s.path.at(-1),landing=s.landing||{x:end.x,z:end.z},w=club.id==='putter'||!hole.wind.speed?null:simulateShot(hole,b,power,0,this.state.aim,{club,capture:false}),wEnd=w?.path.at(-1),wLanding=w?(w.landing||{x:wEnd.x,z:wEnd.z}):landing;return {power,landing:round(landing),end:round(end),windLanding:round(wLanding),windEnd:round(wEnd||end),carry:+s.carry.toFixed(1),total:+s.travel.toFixed(1),apex:+s.apex.toFixed(1),penalty:s.penalty||null};})};}
  return this.forecastCache;
 }
 bump(){this.state.stateVersion++;return this.snapshot();}
 start(courseId,mode,roster=[]){
  if(!COURSES.some(c=>c.id===courseId)||![3,9].includes(mode))throw Error('请选择球场，以及 3 洞或 9 洞赛制。');
  if(roster.length>MAX_PLAYERS||new Set(roster.map(p=>p.id)).size!==roster.length)throw Error(`对战最多支持 ${MAX_PLAYERS} 位不同球手。`);
  const players=(roster.length?roster:[{id:'solo',deviceId:null,name:'单人球手',number:0,style:'sage'}]).map(p=>({...p,ball:{x:0,z:0},strokes:0,scores:[],aim:0,clubId:'auto',holeDone:false}));
  this.state={protocolVersion:1,stateVersion:this.state.stateVersion,phase:'playing',armed:false,courseId,mode,holeIndex:0,strokes:0,scores:[],ball:{x:0,z:0},aim:0,seed:randomBytes(4).readUInt32LE(),players,activePlayerId:players[0].id,multiplayer:players.length>1,shotHistory:[],clubId:'auto'};return this.bump();
 }
 updateProfile(profile){const p=this.state.players.find(p=>p.deviceId===profile.id);if(p){Object.assign(p,{name:profile.name,style:profile.style,number:profile.number});this.bump();}}
 setAim(aim){if(this.state.phase!=='playing')return this.snapshot();if(!Number.isFinite(aim))throw Error('瞄准方向无效。');this.state.aim=Math.max(-80,Math.min(80,aim));this.savePlayer();return this.bump();}
 setClub(id,version){if(this.state.phase!=='playing')throw Error('请等球停稳后再选杆。');if(version!==this.state.stateVersion)throw Error('球手或球局已变化，请重新选杆。');if(!validClub(id))throw Error('请选择有效球杆。');if(id===this.state.clubId)return this.snapshot();this.state.clubId=id;this.state.armed=false;this.savePlayer();return this.bump();}
 setArmed(armed){if(typeof armed!=='boolean')throw Error('准备状态无效。');if(this.state.phase!=='playing')throw Error('请等待球完全停稳。');this.state.armed=armed;return this.bump();}
 validateSwing(input,client){const {power,dir,seq,stateVersion}=input;if(!Number.isFinite(power)||power<=0||power>1||!Number.isFinite(dir)||Math.abs(dir)>1||!Number.isSafeInteger(seq)||seq<0)throw Error('挥杆数据无效。');if((this.sequences.get(client)??-1)>=seq)throw Error('这次挥杆已经收到，请勿重复发送。');if(this.state.phase!=='playing')throw Error('请等待球完全停稳。');if(stateVersion!==this.state.stateVersion)throw Error('球局状态已更新，请重试。');}
 remember(input,client){this.sequences.set(client,input.seq);if(this.sequences.size>500)this.sequences.delete(this.sequences.keys().next().value);}
 rehearse(input,client){this.validateSwing(input,client);const shot=simulateShot(this.hole,this.state.ball,input.power,input.dir,this.state.aim,{club:selectedClub(this.hole,this.state.ball,this.state.clubId)});this.remember(input,client);return {...shot,playerId:this.player.id,playerName:this.player.name,kin:swingKin(input.kin)};}
 // meta.direct：电脑上按力度条直接击球（0.22 起电脑端不再试挥）；meta.aim 随击球一起送达，免去先同步方向再击球。
 stroke(input,client,meta={}){
  this.validateSwing(input,client);if(!this.state.armed&&!meta.direct)throw Error('请先点击“准备击球”。');if(meta.aim!==undefined){if(!Number.isFinite(meta.aim))throw Error('瞄准方向无效。');this.state.aim=Math.max(-80,Math.min(80,meta.aim));}
  this.remember(input,client);this.savePlayer();const player=this.player,aim=this.state.aim,clubSelection=this.state.clubId||'auto';this.state.armed=false;
  const shot=simulateShot(this.hole,this.state.ball,input.power,input.dir,aim,{club:selectedClub(this.hole,this.state.ball,clubSelection)}),added=1+(shot.penalty?1:0);this.state.ball=shot.to;this.state.strokes=Math.min(12,this.state.strokes+added);this.state.aim=0;this.state.clubId='auto';
  if(shot.holed||this.state.strokes>=12){this.state.scores.push({hole:this.state.holeIndex+1,par:this.hole.par,strokes:this.state.strokes,capped:!shot.holed});player.holeDone=true;}this.savePlayer();
  const allDone=this.state.players.every(p=>p.holeDone);this.state.pendingPhase=allDone?(this.state.holeIndex+1===this.state.mode?'finished':'hole_complete'):'playing';
  const index=this.state.players.indexOf(player);this.state.pendingNextPlayerId=player.id;if(!allDone)for(let offset=1;offset<=this.state.players.length;offset++){const next=this.state.players[(index+offset)%this.state.players.length];if(!next.holeDone){this.state.pendingNextPlayerId=next.id;break;}}
  const record={id:this.state.stateVersion+1,time:new Date().toISOString(),playerId:player.id,playerName:player.name,deviceId:player.deviceId,phoneNumber:player.number,source:meta.source||'screen',inputDeviceId:meta.source==='phone'?client:null,hole:this.state.holeIndex+1,stroke:this.state.strokes,power:input.power,dir:input.dir,seq:input.seq,peak:Number.isFinite(input.peak)?input.peak:null,backswingMs:Number.isFinite(input.backswingMs)?input.backswingMs:null,downswingMs:Number.isFinite(input.downswingMs)?input.downswingMs:null,detector:meta.source==='phone'?(input.detector==='model'?'model':'rule'):null,ml:input.detector==='model'&&input.ml&&typeof input.ml==='object'?{label:typeof input.ml.label==='string'?input.ml.label.slice(0,12):null,confidence:Number.isFinite(input.ml.confidence)?input.ml.confidence:null,learned:!!input.ml.learned}:null,inputSettings:meta.inputSettings||null,aim,club:shot.club,clubId:shot.clubId,clubSelection,from:shot.from,to:shot.to,travel:shot.travel,penalty:shot.penalty,holed:shot.holed,impacts:shot.impacts,terrain:shot.terrain,endSurface:shot.endSurface,roll:shot.roll,carry:shot.carry,ballSpeed:shot.ballSpeed,calibration:meta.calibration||null};this.state.shotHistory.push(record);this.state.shotHistory=this.state.shotHistory.slice(-500);
  shot.movement=movementPlan(this.hole,shot.from,shot.to,shot.holed);this.state.phase='animating';this.bump();return {...shot,playerId:player.id,playerName:player.name,stateVersion:this.state.stateVersion,kin:meta.source==='phone'?swingKin(input.kin):null};
 }
 settle(){if(this.state.phase==='animating'){this.state.phase=this.state.pendingPhase||'playing';if(this.state.pendingNextPlayerId)this.selectPlayer(this.state.pendingNextPlayerId);delete this.state.pendingPhase;delete this.state.pendingNextPlayerId;this.bump();}return this.snapshot();}
 transfer(destination='next',now=Date.now()){
  const clubhouse=destination==='clubhouse';if(clubhouse?this.state.phase!=='finished':this.state.phase!=='hole_complete')throw Error('请先完成当前球洞。');
  const trip=holeTransfer(this.state.courseId,this.state.seed,this.state.holeIndex,clubhouse?null:this.state.holeIndex+1);
  this.state.transfer={...trip,id:`${this.state.seed}:${this.state.stateVersion+1}:${this.state.holeIndex}`,startedAt:now};this.state.phase='transferring';this.state.armed=false;return this.bump();
 }
 arrive(id,skip=false,now=Date.now()){
  const t=this.state.transfer;if(this.state.phase!=='transferring'||!t||t.id!==id)return this.snapshot();if(!skip&&now<t.startedAt+t.duration)return this.snapshot();
  delete this.state.transfer;if(t.toIndex===null){this.state.phase='finished';this.state.returnedToClubhouse=true;this.state.clubhouseVisit={...t,startedAt:now-t.duration};return this.bump();}
  this.state.phase='hole_complete';return this.next();
 }
 next(){if(this.state.phase!=='hole_complete')throw Error('请先完成当前球洞。');this.state.holeIndex++;for(const p of this.state.players)Object.assign(p,{strokes:0,ball:{x:0,z:0},aim:0,clubId:'auto',holeDone:false});this.selectPlayer(this.state.players[0].id);this.state.phase='playing';return this.bump();}
 lobby(){if(['animating','transferring'].includes(this.state.phase))throw Error('请等待球停稳或球车到站。');this.state.phase='lobby';this.state.armed=false;return this.bump();}
}
