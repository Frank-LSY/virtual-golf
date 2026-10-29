import {motionSample,INPUT_DEFAULTS} from '../shared/training.js';

// 正式球局只消费一次准备；传感器订阅与准备状态相互独立。
export class RoundChannel {
 constructor(game,clients,send,training,{state,shot}){Object.assign(this,{game,clients,send,training,onState:state,onShot:shot});}
 observers(){return [...this.clients].filter(c=>c.role==='screen'&&c.roundView);}
 phone(){const id=this.game.player.deviceId;return id?[...this.clients].find(c=>c.role==='phone'&&c.clientId===id):this.training.phone();}
 active(){return !!this.observers().length&&!this.training.observers().length&&this.game.state.phase!=='lobby';}
 sync(){
  const active=this.active(),phone=this.phone();let changed=false;
  if(this.game.state.armed&&(!active||(this.lastPhoneId&&this.lastPhoneId!==phone?.clientId)||(this.lastCalibrated&&!phone?.calibrated))){this.game.setArmed(false);changed=true;}
  this.lastPhoneId=phone?.clientId;this.lastCalibrated=!!phone?.calibrated;
  for(const c of this.clients)if(c.role==='phone')this.send(c,{type:'round_subscription',active,stream:active&&c===phone,canControl:active&&c===phone&&this.game.state.phase==='playing',transferring:this.game.state.phase==='transferring',playerId:this.game.player.id,playerName:this.game.player.name,phoneNumber:this.game.player.number,multiplayer:!!this.game.state.multiplayer,armed:active&&c===phone&&!!this.game.state.armed});
  return changed;
 }
 handle(ws,m){
  if(m.type==='round_view'&&ws.role==='screen'){ws.roundView=m.active===true;this.onState();return true;}
  if(m.type==='round_arm'||m.type==='swing'||m.type==='round_club'){
   if(!this.active()||(ws.role==='screen'&&!ws.roundView))throw Error('请先在电脑上打开正式球局。');
   if(ws.role==='phone'&&((!ws.calibrated&&m.type!=='round_club')||ws!==this.phone()))throw Error('还未轮到这台手机，或这台手机尚未启用体感。');
   if(m.type==='round_club'){this.game.setClub(m.clubId,m.stateVersion);this.onState();return true;}
   if(this.game.state.multiplayer&&m.type==='swing'&&ws.role!=='phone')throw Error('多人对战请使用当前球手绑定的手机挥杆。');
   if(this.game.state.multiplayer&&!this.phone()?.calibrated)throw Error('请等待当前球手的手机连接并启用体感。');
   if(m.type==='round_arm'){this.game.setArmed(m.armed);this.onState();return true;}
   const dry=!this.game.state.armed,shot=dry?this.game.rehearse(m,ws.clientId):this.game.stroke(m,ws.clientId,{source:ws.role,calibration:ws.calibration,inputSettings:ws.inputSettings});
   if(dry){for(const c of this.observers())this.send(c,{type:'round_rehearsal',shot,source:ws.role});}
   else {this.onShot(shot,ws.role);this.onState();}
   this.send(ws,{type:dry?'rehearsal_ack':'ack',seq:m.seq,travel:shot.travel,club:shot.club,playerId:this.game.player.id,playerName:this.game.player.name});return true;
  }
  if(m.type==='sensor_sample'&&ws.role==='phone'){
   const now=Date.now();if(!this.active()||ws!==this.phone()||now-(ws.lastRoundTelemetry||0)<30)return true;
   const sample=motionSample(m.sample);ws.lastRoundTelemetry=now;
   for(const c of this.observers())this.send(c,{type:'sensor_sample',scope:'round',phoneId:ws.clientId,receivedAt:now,sample,settings:ws.inputSettings||INPUT_DEFAULTS});return true;
  }
  return false;
 }
}
