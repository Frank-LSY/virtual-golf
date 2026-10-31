import {LEVELS} from '../shared/maze/levels.js';
import {ENDLESS,VERSUS_COLORS} from '../shared/maze/endless.js';
// A separate continuous-input channel. Golf never consumes maze packets.
// 单人：电脑选一台手机当手柄（原有逻辑）。
// 多人对战（0.24）：电脑切到 versus 模式后，所有连着的手机都显示“加入对战”；最多 4 个位置（含一个可选的键盘玩家）。
// 每台加入的手机各自就绪、各自发送输入，网关带上位置编号转给电脑；电脑是裁判，比赛状态由电脑发来，再转给每台手机。
const VS_PHASES=['lobby','countdown','playing','paused','over'];
const STALE_MS=550;
export class MazeChannel {
  constructor(clients,send,{now=()=>Date.now(),players=null}={}){this.clients=clients;this.send=send;this.now=now;this.players=players;this.host=null;this.selectedId=null;this.usingPhone=false;this.lastInput=0;this.stale=false;this.info={phase:'ready',level:1,elapsed:0,falls:0,checkpoint:-1,checkpointCount:0};this.mode='solo';this.slots=Array(ENDLESS.maxPlayers).fill(null);this.vs={phase:'lobby',state:null};}
  phones(){return [...this.clients].filter(c=>c.role==='phone');}
  phone(){return this.phones().find(c=>c.clientId===this.selectedId)||null;}
  active(){return !!this.host&&this.clients.has(this.host)&&this.host.mazeView;}
  versus(){return this.active()&&this.mode==='versus';}
  // 这台手机此刻是否在当滚球手柄（用于屏蔽高尔夫挥杆包）。
  controls(ws){return this.active()&&ws.role==='phone'&&(this.mode==='versus'||ws===this.phone());}
  sendHost(data){if(this.active())this.send(this.host,data);}
  pause(reason,extra={}){this.sendHost({type:'maze_pause',reason,...extra});}
  // ---------- 多人对战：位置 ----------
  slotOf(id){return this.slots.findIndex(s=>s?.id===id);}
  socket(id){return this.phones().find(c=>c.clientId===id)||null;}
  locked(){return ['countdown','playing','paused'].includes(this.vs.phase);}
  joined(){return this.slots.filter(Boolean).length;}
  roster(){return this.slots.map((s,slot)=>{if(!s)return null;const color=VERSUS_COLORS[slot];if(s.kind==='keyboard')return {slot,id:s.id,kind:'keyboard',name:'键盘玩家',number:null,connected:true,ready:true,source:'keyboard',color:color.color};const ws=this.socket(s.id),profile=this.players?.profiles?.get(s.id);return {slot,id:s.id,kind:'phone',name:profile?.name||'手机玩家',number:profile?.number??null,connected:!!ws,ready:!!ws?.mazeReady,source:ws?.mazeSource||null,color:color.color};});}
  allReady(){const list=this.roster().filter(Boolean);return list.length>0&&list.every(p=>p.connected&&p.ready);}
  release(slot){const s=this.slots[slot];if(!s)return;this.slots[slot]=null;const ws=s.kind==='phone'&&this.socket(s.id);if(ws){ws.mazeReady=false;ws.mazeLast=0;}}
  publish(){
    const active=this.active(),phone=this.phone(),versus=this.mode==='versus';
    this.sendHost({type:'maze_controller',phoneId:phone?.clientId||this.selectedId,connected:!!phone,ready:!!phone?.mazeReady,source:phone?.mazeSource||null});
    this.sendHost({type:'maze_roster',mode:this.mode,phase:this.vs.phase,slots:this.roster(),allReady:this.allReady(),phones:this.phones().length});
    const count=this.joined(),full=count>=ENDLESS.maxPlayers,locked=this.locked(),allReady=this.allReady();
    for(const p of this.phones()){
      if(versus){const slot=this.slotOf(p.clientId);this.send(p,{type:'maze_subscription',active,owner:active&&slot>=0,mode:'versus',slot:slot>=0?slot:null,joined:slot>=0,full,locked,count,allReady,game:this.info,versus:this.vs.state});}
      else this.send(p,{type:'maze_subscription',active:active&&p===phone,owner:active&&p===phone,mode:'solo',game:this.info});
    }
  }
  connected(ws){if(ws.role==='phone'){ws.mazeReady=false;if(this.active()&&!this.versus()&&(!this.selectedId||!this.phone()&&!this.usingPhone))this.selectedId=ws.clientId;this.publish();}}
  disconnected(ws){
    if(ws===this.host){this.host=null;this.usingPhone=false;this.publish();}
    if(ws.role!=='phone')return;
    const slot=this.slotOf(ws.clientId);
    if(slot>=0){if(this.locked())this.pause('controller_offline',{slot,phoneId:ws.clientId});else this.release(slot);this.publish();}
    if(ws.clientId===this.selectedId&&!this.versus()){this.lastInput=0;this.pause('controller_offline');this.publish();}
  }
  tick(){
    if(!this.active())return;
    if(this.versus()){
      for(const [slot,s] of this.slots.entries()){if(s?.kind!=='phone')continue;const ws=this.socket(s.id);if(ws?.mazeReady&&ws.mazeLast&&!ws.mazeStale&&this.now()-ws.mazeLast>STALE_MS){ws.mazeStale=true;ws.mazeReady=false;this.pause('stream_gap',{slot,phoneId:s.id});this.publish();}}
      return;
    }
    if(this.usingPhone&&this.lastInput&&!this.stale&&this.now()-this.lastInput>STALE_MS){this.stale=true;const p=this.phone();if(p)p.mazeReady=false;this.pause('stream_gap');this.publish();}
  }
  // 校验并转发电脑发来的对战状态：每台手机都会收到，自己的位置记在 you。
  versusState(m){
    if(!VS_PHASES.includes(m.phase)||!Array.isArray(m.players)||m.players.length>ENDLESS.maxPlayers||!Number.isFinite(m.elapsed)||m.elapsed<0)throw Error('对战状态无效。');
    const players=m.players.map(p=>{if(!Number.isInteger(p?.slot)||p.slot<0||p.slot>=ENDLESS.maxPlayers||typeof p.alive!=='boolean'||!Number.isFinite(p.distance)||p.distance<0||p.distance>1e6||(p.rank!==null&&p.rank!==undefined&&(!Number.isInteger(p.rank)||p.rank<1||p.rank>ENDLESS.maxPlayers))||(p.gap!==null&&p.gap!==undefined&&!Number.isFinite(p.gap)))throw Error('对战状态无效。');return {slot:p.slot,alive:p.alive,rank:p.rank??null,distance:Math.round(p.distance),gap:p.gap===null||p.gap===undefined?null:Math.round(p.gap*10)/10};});
    const winner=m.winner===null||m.winner===undefined?null:m.winner;if(winner!==null&&(!Number.isInteger(winner)||winner<0||winner>=ENDLESS.maxPlayers))throw Error('对战状态无效。');
    const speed=Number.isFinite(m.speed)?Math.max(0,Math.min(20,m.speed)):0,countdown=Number.isFinite(m.countdown)?Math.max(0,Math.min(9,m.countdown)):null;
    const changed=m.phase!==this.vs.phase;const stage=Number.isInteger(m.stage)&&m.stage>=0&&m.stage<=3?m.stage:0;this.vs={phase:m.phase,state:{phase:m.phase,elapsed:Math.min(m.elapsed,86400),speed,countdown,solo:m.solo===true,winner,stage,round:Number.isInteger(m.round)?m.round:0,players,record:Number.isFinite(m.record)?Math.round(m.record):null}};
    // 回到大厅 / 结算后，比赛中断线没回来的手机让出位置。
    let freed=false;if(!this.locked())for(const [i,slot] of this.slots.entries())if(slot?.kind==='phone'&&!this.socket(slot.id)){this.release(i);freed=true;}
    for(const p of this.phones()){const slot=this.slotOf(p.clientId);this.send(p,{type:'maze_versus_state',...this.vs.state,you:slot>=0?slot:null});}
    if(changed||freed)this.publish();
  }
  handle(ws,m){
    if(!m.type?.startsWith?.('maze_'))return false;
    if(m.type==='maze_view'&&ws.role==='screen'){
      if(m.active===true){
        if(this.active()&&this.host!==ws){if(m.takeover!==true){this.send(ws,{type:'maze_host',host:false});return true;}const previous=this.host;previous.mazeView=false;this.send(previous,{type:'maze_host',host:false});const phone=this.phone();if(phone){phone.mazeReady=false;this.send(phone,{type:'maze_rezero'});}}
        this.host=ws;ws.mazeView=true;if(!this.selectedId)this.selectedId=this.phones()[0]?.clientId||null;this.usingPhone=false;this.send(ws,{type:'maze_host',host:true});
      }else if(ws===this.host){ws.mazeView=false;this.host=null;this.usingPhone=false;}
      this.publish();return true;
    }
    if(ws.role==='screen'){
      if(!this.active()||ws!==this.host)throw Error('请先在当前窗口打开云端滚球。');
      if(m.type==='maze_mode'){
        const mode=m.mode==='versus'?'versus':'solo';if(mode!==this.mode){this.mode=mode;for(const p of this.phones()){p.mazeReady=false;p.mazeLast=0;p.mazeStale=false;}if(mode==='solo'&&!this.locked())this.vs={phase:'lobby',state:null};}
        this.publish();return true;
      }
      if(m.type==='maze_versus_keyboard'){
        if(this.mode!=='versus')throw Error('请先打开多人对战。');if(this.locked())throw Error('本局进行中，下一局再调整人数。');
        const slot=this.slotOf('keyboard');if(m.join===true&&slot<0){const free=this.slots.indexOf(null);if(free<0)throw Error('对战人数已满（最多 4 人）。');this.slots[free]={id:'keyboard',kind:'keyboard'};}if(m.join!==true&&slot>=0)this.release(slot);
        this.publish();return true;
      }
      if(m.type==='maze_versus_kick'){if(this.locked())throw Error('本局进行中，不能移出球手。');if(!Number.isInteger(m.slot)||m.slot<0||m.slot>=ENDLESS.maxPlayers)throw Error('位置无效。');this.release(m.slot);this.publish();return true;}
      if(m.type==='maze_versus_state'){if(this.mode!=='versus')throw Error('请先打开多人对战。');this.versusState(m);return true;}
      if(m.type==='maze_select'){
        if(!this.phones().some(p=>p.clientId===m.phoneId))throw Error('这台手机尚未连接。');
        if(m.phoneId!==this.selectedId){const old=this.phone();if(old)old.mazeReady=false;this.selectedId=m.phoneId;this.lastInput=0;this.pause('controller_change');}this.publish();return true;
      }
      if(m.type==='maze_input_mode'){this.usingPhone=m.phone===true;this.lastInput=this.usingPhone?this.now():0;this.stale=false;return true;}
      if(m.type==='maze_rezero'){
        if(this.versus()){for(const s of this.slots){const p=s?.kind==='phone'&&this.socket(s.id);if(p){p.mazeReady=false;this.send(p,{type:'maze_rezero'});}}this.publish();return true;}
        const p=this.phone();if(p){p.mazeReady=false;this.send(p,{type:'maze_rezero'});}this.pause('recenter');this.publish();return true;
      }
      if(m.type==='maze_state'){
        const valid=['ready','playing','paused','countdown','falling','won','complete'].includes(m.phase);
        if(!valid||!Number.isInteger(m.level)||m.level<1||m.level>LEVELS.length||!Number.isFinite(m.elapsed)||m.elapsed<0||!Number.isInteger(m.falls)||m.falls<0)throw Error('滚球状态无效。');
        const checkpoint=m.checkpoint??-1,checkpointCount=m.checkpointCount??0;if(!Number.isInteger(checkpointCount)||checkpointCount<0||checkpointCount>8||!Number.isInteger(checkpoint)||checkpoint< -1||checkpoint>=checkpointCount)throw Error('检查点状态无效。');
        this.info={checkpoint,checkpointCount,phase:m.phase,level:m.level,elapsed:Math.min(m.elapsed,86400),falls:Math.min(m.falls,99999)};
        const p=this.phone();if(p&&!this.versus())this.send(p,{type:'maze_game_state',...this.info});return true;
      }
    }
    if(ws.role==='phone'&&this.versus())return this.versusPhone(ws,m);
    if(ws.role==='phone'){
      if(!this.active()||ws!==this.phone())throw Error('这台手机不是当前滚球手柄。');
      if(m.type==='maze_ready'){
        ws.mazeReady=m.ready===true;ws.mazeSource=m.source==='tilt'?'tilt':'joystick';this.lastInput=this.now();this.stale=false;if(!ws.mazeReady)this.pause('recenter');this.publish();return true;
      }
      if(m.type==='maze_input'){
        if(!ws.mazeReady)return true;
        if(!this.validInput(ws,m))return true;this.lastInput=this.now();this.stale=false;
        if(this.now()-(ws.mazeSentAt??-Infinity)<20)return true;ws.mazeSentAt=this.now();
        const length=Math.max(1,Math.hypot(m.x,m.y));this.sendHost({type:'maze_input',x:m.x/length,y:m.y/length,source:ws.mazeSource,seq:m.seq});return true;
      }
      if(m.type==='maze_pause'){this.pause('phone_hidden');return true;}
      if(m.type==='maze_command'&&['pause','resume','retry','next'].includes(m.action)){this.sendHost({type:'maze_command',action:m.action});return true;}
    }
    throw Error('无法识别滚球操作。');
  }
  validInput(ws,m){if(![m.x,m.y].every(v=>Number.isFinite(v)&&Math.abs(v)<=1.01)||!Number.isSafeInteger(m.seq)||m.seq<0)throw Error('滚球输入无效。');if(m.seq<=(ws.mazeSeq??-1))return false;ws.mazeSeq=m.seq;return true;}
  // 多人对战：手机加入 / 退出、就绪、输入、暂停与命令。
  versusPhone(ws,m){
    let slot=this.slotOf(ws.clientId);
    if(m.type==='maze_join'){
      if(m.join===false){if(slot<0)return true;if(this.locked())throw Error('比赛中不能退出，等这一局结束。');this.release(slot);this.publish();return true;}
      if(slot>=0){this.publish();return true;}
      if(this.locked())throw Error('本局进行中，下一局再加入。');
      const free=this.slots.indexOf(null);if(free<0)throw Error('对战人数已满（最多 4 人）。');
      this.slots[free]={id:ws.clientId,kind:'phone'};ws.mazeReady=false;ws.mazeLast=0;ws.mazeStale=false;this.publish();return true;
    }
    if(slot<0){if(m.type==='maze_input'||m.type==='maze_pause'||m.type==='maze_ready')return true;throw Error('请先在手机上点“加入对战”。');}
    if(m.type==='maze_ready'){ws.mazeReady=m.ready===true;ws.mazeSource=m.source==='tilt'?'tilt':'joystick';ws.mazeLast=this.now();ws.mazeStale=false;if(!ws.mazeReady)this.pause('recenter',{slot,phoneId:ws.clientId});this.publish();return true;}
    if(m.type==='maze_input'){
      // 网络短暂卡顿被判为断流后，手机又恢复发送：直接恢复就绪，不用重新归零。
      if(!ws.mazeReady&&ws.mazeStale&&Number.isFinite(m.x)){ws.mazeReady=true;ws.mazeStale=false;this.publish();}
      if(!ws.mazeReady||!this.validInput(ws,m))return true;ws.mazeLast=this.now();ws.mazeStale=false;
      if(this.now()-(ws.mazeSentAt??-Infinity)<20)return true;ws.mazeSentAt=this.now();
      const length=Math.max(1,Math.hypot(m.x,m.y));this.sendHost({type:'maze_input',phoneId:ws.clientId,slot,x:m.x/length,y:m.y/length,source:ws.mazeSource,seq:m.seq});return true;
    }
    if(m.type==='maze_pause'){this.pause('phone_hidden',{slot,phoneId:ws.clientId});return true;}
    if(m.type==='maze_command'&&['start','pause','resume','rematch','lobby'].includes(m.action)){this.sendHost({type:'maze_command',action:m.action,slot,phoneId:ws.clientId});return true;}
    throw Error('无法识别滚球操作。');
  }
}
