export class Connection extends EventTarget {
 constructor(role){super();this.role=role;this.retry=500;this.stopped=false;const store=role==='phone'?localStorage:sessionStorage,key=role==='phone'?'swinglink-phone-id':'swinglink-id';this.id=store.getItem(key)||crypto.randomUUID();store.setItem(key,this.id);}
 async connect(){
  try{this.config=await fetch('/api/config').then(r=>r.json());const supplied=new URLSearchParams(location.search).get('token');
   this.ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws?token=${supplied||this.config.token}`);
   this.ws.onopen=()=>{this.retry=500;this.send({type:'hello',role:this.role,clientId:this.id,protocolVersion:1});};
   this.ws.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch{return;}this.dispatchEvent(new CustomEvent('message',{detail:m}));};
   this.ws.onclose=e=>{if(e.code===4001){this.stopped=true;this.dispatchEvent(new CustomEvent('message',{detail:{type:'error',message:'这台手机已在另一个页面接入。请只保留一个手柄页面。'}}));}this.dispatchEvent(new CustomEvent('offline'));if(!this.stopped)setTimeout(()=>this.connect(),this.retry=Math.min(this.retry*1.5,5000));};
   this.ws.onerror=()=>this.ws.close();
  }catch{if(!this.stopped)setTimeout(()=>this.connect(),2000);}
 }
 send(m){if(this.ws?.readyState===WebSocket.OPEN){this.ws.send(JSON.stringify(m));return true;}return false;}
}
