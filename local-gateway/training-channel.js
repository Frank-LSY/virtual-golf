import {Training} from '../game-service/training.js';
import {inputSettings,INPUT_DEFAULTS,motionSample} from '../shared/training.js';

// 原始传感器只转发给正在观看练习室的屏幕，不写入磁盘。
export class TrainingChannel {
 constructor(clients,send,{players=null,saved=null,persist=()=>{}}={}){this.clients=clients;this.send=send;this.players=players;this.persist=persist;this.selectedId=null;this.sessions=new Map();for(const item of saved?.sessions||[]){const t=new Training();t.settings=item.settings;t.history=(item.history||[]).slice(0,50);t.version=item.version||0;this.sessions.set(item.id,t);}}
 get range(){const id=this.selectedId||'desktop';if(!this.sessions.has(id))this.sessions.set(id,new Training());return this.sessions.get(id);}
 saved(){return {sessions:[...this.sessions].map(([id,t])=>({id,settings:t.settings,history:t.history,version:t.version}))};}
 owner(){return this.players?.profiles.get(this.selectedId)||{id:this.selectedId||'desktop',name:'电脑试打',number:0,style:'sage'};}
 roster(){return this.players?this.players.snapshot(this.clients):[...this.clients].filter(c=>c.role==='phone').map(c=>({id:c.clientId,name:c.clientId,connected:true,calibrated:!!c.calibrated}));}
 observers(){return [...this.clients].filter(c=>c.role==='screen'&&c.practiceView);}
 phone(){const phones=[...this.clients].filter(c=>c.role==='phone');if(!this.selectedId&&phones.length)this.selectedId=phones[0].clientId;return phones.find(c=>c.clientId===this.selectedId);}
 publish(data){for(const c of this.observers())this.send(c,data);}
 snapshot(ws){this.send(ws,{type:'practice_state',owner:this.owner(),...this.range.snapshot()});}
 changed(){
  const previous=this.lastOwnerId,phone=this.phone(),active=this.observers().length>0;this.lastOwnerId=this.owner().id;if(previous!==this.lastOwnerId)for(const c of this.observers())this.snapshot(c);
  if(!active||(this.lastPhoneId&&this.lastPhoneId!==phone?.clientId)||(this.lastPhoneCalibrated&&!phone?.calibrated))this.range.armed=false;this.lastPhoneId=phone?.clientId;this.lastPhoneCalibrated=!!phone?.calibrated;
  this.publish({type:'practice_control',armed:this.range.armed,busyMs:Math.max(0,this.range.busyUntil-Date.now())});
  this.publish({type:'practice_controller',selectedId:this.selectedId||'desktop',owner:this.owner(),phones:this.roster(),phone:phone?{...this.owner(),id:phone.clientId,calibrated:!!phone.calibrated,calibration:phone.calibration||null,settings:phone.inputSettings||INPUT_DEFAULTS}:null});
  for(const c of this.clients)if(c.role==='phone')this.send(c,{type:'practice_subscription',active,selected:active&&c===phone,owner:this.owner(),stream:active&&c===phone,armed:active&&c===phone&&this.range.armed,settings:this.range.settings,busyMs:Math.max(0,this.range.busyUntil-Date.now())});
 }
 handle(ws,m){
  if(m.type==='practice_view'&&ws.role==='screen'){
   ws.practiceView=m.active===true;this.phone();if(ws.practiceView)this.snapshot(ws);this.changed();return true;
  }
  if(m.type==='practice_select'&&ws.role==='screen'){
   if(!ws.practiceView)throw Error('请先打开挥杆练习室。');if(Date.now()<this.range.busyUntil)throw Error('请等训练球停稳后切换手机。');
   if(m.phoneId!=='desktop'&&!this.roster().some(p=>p.id===m.phoneId))throw Error('未找到这台手机。');this.range.armed=false;this.selectedId=m.phoneId;this.range.armed=false;for(const c of this.observers())this.snapshot(c);this.changed();return true;
  }
  if(m.type==='request_calibration'&&ws.role==='screen'){
   const phone=this.phone();if(!ws.practiceView||!phone||m.phoneId!==phone.clientId)throw Error('请先选择已连接的手机。');this.range.armed=false;this.send(phone,{type:'calibration_request',mode:m.mode==='zero'?'zero':'full'});this.changed();return true;
  }
  if(m.type==='input_settings'&&ws.role==='phone'){
   ws.inputSettings=inputSettings(m.settings);
   if(ws===this.phone())this.publish({type:'input_settings_applied',phoneId:ws.clientId,settings:ws.inputSettings,requestId:typeof m.requestId==='string'?m.requestId.slice(0,100):null});
   return true;
  }
  if(m.type==='set_input_settings'&&ws.role==='screen'){
   const settings=inputSettings(m.settings),phone=this.phone();
   if(!ws.practiceView||!phone||phone.clientId!==m.phoneId)throw Error('手机连接已变化，请重新选择参数。');
   if(typeof m.requestId!=='string'||m.requestId.length>100)throw Error('参数请求无效。');
   this.send(phone,{type:'input_settings_request',settings,requestId:m.requestId});return true;
  }
  if(m.type==='sensor_sample'&&ws.role==='phone'){
   if(!this.observers().length)return false;
   const now=Date.now();if(ws!==this.phone()||now-(ws.lastTelemetry||0)<65)return true;
   const sample=motionSample(m.sample);ws.lastTelemetry=now;
   this.publish({type:'sensor_sample',phoneId:ws.clientId,receivedAt:now,sample});return true;
  }
  if(m.type==='practice_config'&&ws.role==='screen'){
   if(!ws.practiceView)throw Error('请先打开挥杆练习室。');this.range.configure(m.settings);this.persist();for(const c of this.observers())this.snapshot(c);this.changed();return true;
  }
  if(m.type==='practice_arm'){
   if(typeof m.armed!=='boolean'||!this.observers().length||(ws.role==='screen'&&!ws.practiceView)||(ws.role==='phone'&&(!ws.calibrated||ws!==this.phone())))throw Error('请连接并完成校准后，在训练场准备击球。');
   if(Date.now()<this.range.busyUntil)throw Error('请等球停稳后再准备下一杆。');this.range.armed=m.armed;this.changed();return true;
  }
  if((m.type==='test_swing'&&ws.role==='phone')||(['practice_shot','practice_rehearse'].includes(m.type)&&ws.role==='screen')){
   if(ws.role==='phone'&&(!ws.calibrated||ws!==this.phone()))throw Error('请先完成当前手机的校准。');
   if(ws.role==='screen'&&!ws.practiceView)throw Error('请先打开挥杆练习室。');
   const rehearsal=m.type==='practice_rehearse'||(ws.role==='phone'&&!this.range.armed);
   if(!rehearsal&&!this.range.armed)throw Error('请先点击“准备击球”，或先试挥找手感。');
   const result=this.range.stroke(m,ws.clientId,ws.role,ws.inputSettings||INPUT_DEFAULTS,Date.now(),rehearsal);
   Object.assign(result.report,{playerId:this.owner().id,playerName:this.owner().name,phoneNumber:this.owner().number,inputDeviceId:ws.role==='phone'?ws.clientId:null,calibration:ws.calibration||null});if(!rehearsal)this.persist();
   this.publish({type:rehearsal?'practice_rehearsal':'practice_result',...result});this.send(ws,{type:rehearsal?'practice_rehearsal_ack':'practice_ack',seq:m.seq,...result.report,busyUntil:this.range.busyUntil});
   // 保留旧版诊断接收端；正式球局状态不会改变。
   for(const c of this.clients)this.send(c,{type:'swing_feedback',power:m.power,dir:m.dir,peak:m.peak});
   for(const c of this.observers())this.snapshot(c);
   this.changed();return true;
  }
  if(m.type==='swing'&&ws.role==='phone'&&this.observers().length)throw Error('电脑已打开训练场，请使用练习模式挥杆。');
  return false;
 }
}
