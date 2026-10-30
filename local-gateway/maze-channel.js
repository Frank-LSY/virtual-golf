// A separate continuous-input channel. Golf never consumes maze packets.
export class MazeChannel {
  constructor(clients,send,{now=()=>Date.now()}={}){this.clients=clients;this.send=send;this.now=now;this.host=null;this.selectedId=null;this.usingPhone=false;this.lastInput=0;this.stale=false;this.info={phase:'ready',level:1,elapsed:0,falls:0};}
  phones(){return [...this.clients].filter(c=>c.role==='phone');}
  phone(){return this.phones().find(c=>c.clientId===this.selectedId)||null;}
  active(){return !!this.host&&this.clients.has(this.host)&&this.host.mazeView;}
  sendHost(data){if(this.active())this.send(this.host,data);}
  pause(reason){this.sendHost({type:'maze_pause',reason});}
  publish(){
    const active=this.active(),phone=this.phone();
    this.sendHost({type:'maze_controller',phoneId:phone?.clientId||this.selectedId,connected:!!phone,ready:!!phone?.mazeReady,source:phone?.mazeSource||null});
    for(const p of this.phones())this.send(p,{type:'maze_subscription',active:active&&p===phone,owner:active&&p===phone,game:this.info});
  }
  connected(ws){if(ws.role==='phone'){ws.mazeReady=false;if(this.active()&&(!this.selectedId||!this.phone()&&!this.usingPhone))this.selectedId=ws.clientId;this.publish();}}
  disconnected(ws){
    if(ws===this.host){this.host=null;this.usingPhone=false;this.publish();}
    if(ws.role==='phone'&&ws.clientId===this.selectedId){this.lastInput=0;this.pause('controller_offline');this.publish();}
  }
  tick(){if(this.active()&&this.usingPhone&&this.lastInput&&!this.stale&&this.now()-this.lastInput>550){this.stale=true;const p=this.phone();if(p)p.mazeReady=false;this.pause('stream_gap');this.publish();}}
  handle(ws,m){
    if(!m.type?.startsWith?.('maze_'))return false;
    if(m.type==='maze_view'&&ws.role==='screen'){
      if(m.active===true){
        if(this.active()&&this.host!==ws){this.send(ws,{type:'maze_host',host:false});return true;}
        this.host=ws;ws.mazeView=true;if(!this.selectedId)this.selectedId=this.phones()[0]?.clientId||null;this.usingPhone=false;this.send(ws,{type:'maze_host',host:true});
      }else if(ws===this.host){ws.mazeView=false;this.host=null;this.usingPhone=false;}
      this.publish();return true;
    }
    if(ws.role==='screen'){
      if(!this.active()||ws!==this.host)throw Error('请先在当前窗口打开八卦滚球。');
      if(m.type==='maze_select'){
        if(!this.phones().some(p=>p.clientId===m.phoneId))throw Error('这台手机尚未连接。');
        if(m.phoneId!==this.selectedId){const old=this.phone();if(old)old.mazeReady=false;this.selectedId=m.phoneId;this.lastInput=0;this.pause('controller_change');}this.publish();return true;
      }
      if(m.type==='maze_input_mode'){this.usingPhone=m.phone===true;this.lastInput=this.usingPhone?this.now():0;this.stale=false;return true;}
      if(m.type==='maze_rezero'){const p=this.phone();if(p){p.mazeReady=false;this.send(p,{type:'maze_rezero'});}this.pause('recenter');this.publish();return true;}
      if(m.type==='maze_state'){
        const valid=['ready','playing','paused','countdown','falling','won','complete'].includes(m.phase);
        if(!valid||!Number.isInteger(m.level)||m.level<1||m.level>3||!Number.isFinite(m.elapsed)||m.elapsed<0||!Number.isInteger(m.falls)||m.falls<0)throw Error('滚球状态无效。');
        this.info={phase:m.phase,level:m.level,elapsed:Math.min(m.elapsed,86400),falls:Math.min(m.falls,99999)};
        const p=this.phone();if(p)this.send(p,{type:'maze_game_state',...this.info});return true;
      }
    }
    if(ws.role==='phone'){
      if(!this.active()||ws!==this.phone())throw Error('这台手机不是当前滚球手柄。');
      if(m.type==='maze_ready'){
        ws.mazeReady=m.ready===true;ws.mazeSource=m.source==='tilt'?'tilt':'joystick';this.lastInput=this.now();this.stale=false;if(!ws.mazeReady)this.pause('recenter');this.publish();return true;
      }
      if(m.type==='maze_input'){
        if(!ws.mazeReady)return true;
        if(![m.x,m.y].every(v=>Number.isFinite(v)&&Math.abs(v)<=1.01)||!Number.isSafeInteger(m.seq)||m.seq<0)throw Error('滚球输入无效。');
        if(m.seq<=(ws.mazeSeq??-1))return true;ws.mazeSeq=m.seq;this.lastInput=this.now();this.stale=false;
        if(this.now()-(ws.mazeSentAt??-Infinity)<20)return true;ws.mazeSentAt=this.now();
        const length=Math.max(1,Math.hypot(m.x,m.y));this.sendHost({type:'maze_input',x:m.x/length,y:m.y/length,source:ws.mazeSource,seq:m.seq});return true;
      }
      if(m.type==='maze_pause'){this.pause('phone_hidden');return true;}
      if(m.type==='maze_command'&&['pause','resume','retry','next'].includes(m.action)){this.sendHost({type:'maze_command',action:m.action});return true;}
    }
    throw Error('无法识别滚球操作。');
  }
}
