// 体感钓鱼音效：全部实时合成，接入共用的“音效”母线。抛竿“咻 + 卷线”、入水“扑通”、试探“啵”、真咬“咚 + 铃”、
// 刺中“绷”、冲刺“哗啦 + 出线”、预兆“水涡”、上岸“叮咚”、断线“啪”、脱钩“噗”、水草“沙沙”。多人同时钓时同类声音自动限频。
export class FishingSfx{
 constructor(context,output,{enabled=()=>true}={}){this.context=context;this.output=output;this.enabled=enabled;this.last={};}
 get c(){return this.context();}
 ok(kind,gap=.08){if(!this.enabled()||document.hidden)return false;const now=performance.now()/1000;if(now-(this.last[kind]||0)<gap)return false;this.last[kind]=now;return true;}
 env(g,t,a,peak,d){g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(peak,t+a);g.gain.exponentialRampToValueAtTime(.0001,t+a+d);}
 tone(type,f0,f1,dur,peak=.15,attack=.005,when=0){const c=this.c,t=c.currentTime+when,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);this.env(g,t,attack,peak,dur);o.connect(g);g.connect(this.output());o.start(t);o.stop(t+attack+dur+.05);}
 noise(dur,{f0=1200,f1=3000,q=1,peak=.12,attack=.01,when=0,type='bandpass'}={}){const c=this.c,t=c.currentTime+when,n=Math.ceil(c.sampleRate*(dur+attack+.05)),b=c.createBuffer(1,n,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.random()*2-1;const s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();s.buffer=b;f.type=type;f.Q.value=q;f.frequency.setValueAtTime(f0,t);f.frequency.exponentialRampToValueAtTime(Math.max(40,f1),t+dur);this.env(g,t,attack,peak,dur);s.connect(f);f.connect(g);g.connect(this.output());s.start(t);}
 clicks(n,gap,when=0,peak=.05){for(let i=0;i<n;i++)this.tone('square',2400,1800,.012,peak,.001,when+i*gap);}
 play(kind,strength=.5){
  try{
   if(kind==='cast'&&this.ok('cast',.15)){this.noise(.35,{f0:600,f1:4200,q:2,peak:.12,attack:.05});this.clicks(10,.028,.05,.035);}
   else if(kind==='splash'&&this.ok('splash',.1)){this.noise(.28,{f0:1800,f1:300,q:.8,peak:.16,type:'lowpass'});this.tone('sine',520,180,.12,.08,.003,.03);}
   else if(kind==='nibble'&&this.ok('nibble',.12)){this.tone('sine',900,560,.08,.12);}
   else if(kind==='bite'&&this.ok('bite',.15)){this.tone('sine',300,110,.22,.2);this.tone('triangle',1320,1320,.35,.09,.005,.05);}
   else if(kind==='hook'&&this.ok('hook',.15)){this.tone('sawtooth',180,520,.14,.07);this.tone('triangle',660,990,.18,.08,.005,.02);}
   else if(kind==='dash'&&this.ok('dash',.2)){this.noise(.5,{f0:900,f1:2600,q:.7,peak:.14});this.clicks(16,.02,0,.03);}
   else if(kind==='telegraph'&&this.ok('telegraph',.3)){this.noise(.6,{f0:300,f1:900,q:3,peak:.08,attack:.25,type:'bandpass'});}
   else if(kind==='landed'&&this.ok('landed',.2)){[784,988,1175,1568].forEach((f,i)=>this.tone('triangle',f,f,.22,.13,.005,i*.08));this.noise(.2,{f0:2000,f1:600,peak:.08,type:'lowpass'});}
   else if(kind==='lost'&&this.ok('lost',.2)){if(strength>.7){this.tone('square',1400,200,.12,.1);this.noise(.08,{f0:5000,f1:2000,peak:.08});}else this.tone('sine',420,160,.25,.12);}
   else if(kind==='weed'&&this.ok('weed',.6)){this.noise(.5,{f0:3000,f1:2200,q:2,peak:.06,attack:.1});}
   else if(kind==='reel'&&this.ok('reel',.3)){this.clicks(8,.03,0,.04);}
   else if(kind==='countdown'&&this.ok('countdown',.4)){this.tone('sine',660,660,.09,.12);}
   else if(kind==='go'&&this.ok('go',.4)){this.tone('triangle',523,523,.1,.14);this.tone('triangle',784,784,.22,.14,.005,.1);}
   else if(kind==='timeup'&&this.ok('timeup',.5)){this.tone('square',880,440,.4,.08);}
  }catch{}
 }
 stop(){}
}
