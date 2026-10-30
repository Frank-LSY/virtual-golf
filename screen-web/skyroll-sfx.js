// 云端滚球音效：全部实时合成的卡通音色，接入共用的“音效”母线（受音效开关与音量控制）。
// 撞栏“咚”、弹射柱“啵嘤”、加速带“咻”、检查点双音、坠落滑音、复活“啵”、风车横杆“咔”、上浮台“嘟”；
// 另有一条随速度变化的滚动底噪。
export class SkyrollSfx{
 constructor(context,output,{enabled=()=>true}={}){this.context=context;this.output=output;this.enabled=enabled;this.last={};}
 get c(){return this.context();}
 ok(kind,gap=.06){if(!this.enabled()||document.hidden)return false;const now=performance.now()/1000;if(now-(this.last[kind]||0)<gap)return false;this.last[kind]=now;return true;}
 node(type,freq){const c=this.c,o=c.createOscillator();o.type=type;o.frequency.value=freq;return o;}
 env(gain,t,a,peak,d){gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(peak,t+a);gain.gain.exponentialRampToValueAtTime(.0001,t+a+d);}
 tone(type,f0,f1,dur,peak=.18,attack=.005,when=0){const c=this.c,t=c.currentTime+when,o=this.node(type,f0),g=c.createGain();o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);this.env(g,t,attack,peak,dur);o.connect(g);g.connect(this.output());o.start(t);o.stop(t+attack+dur+.05);o.onended=()=>{try{g.disconnect();}catch{}};}
 noise(dur,{f0=1200,f1=4000,q=1.2,peak=.12,attack=.01,type='bandpass'}={}){const c=this.c,t=c.currentTime,n=Math.ceil(c.sampleRate*(dur+attack+.05)),b=c.createBuffer(1,n,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.random()*2-1;const s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();s.buffer=b;f.type=type;f.Q.value=q;f.frequency.setValueAtTime(f0,t);f.frequency.exponentialRampToValueAtTime(f1,t+dur);this.env(g,t,attack,peak,dur);s.connect(f);f.connect(g);g.connect(this.output());s.start(t);s.onended=()=>{try{g.disconnect();}catch{}};}
 play(kind,strength=.5){
  try{
   if(kind==='wall'&&this.ok('wall',.09)){this.tone('sine',150+strength*80,60,.16,.12+.22*strength);this.noise(.05,{f0:900,f1:400,peak:.05+.08*strength});}
   else if(kind==='bump'&&this.ok('bump',.1)){this.tone('triangle',260,780,.18,.22);this.tone('sine',520,1300,.22,.08,.005,.04);}
   else if(kind==='boost'&&this.ok('boost',.4)){this.noise(.45,{f0:500,f1:5200,q:2.5,peak:.14,attack:.04});this.tone('sawtooth',220,880,.35,.035,.02);}
   else if(kind==='checkpoint'&&this.ok('checkpoint',.3)){this.tone('triangle',784,784,.18,.16);this.tone('triangle',1175,1175,.32,.16,.005,.11);}
   else if(kind==='fall'&&this.ok('fall',.5)){this.tone('sine',900,180,.85,.16,.02);}
   else if(kind==='respawn'&&this.ok('respawn',.3)){this.tone('sine',420,880,.09,.16);this.noise(.06,{f0:3000,f1:6000,peak:.04});}
   else if(kind==='sweep'&&this.ok('sweep',.15)){this.noise(.07,{f0:2400,f1:1500,q:4,peak:.14});this.tone('square',330,220,.06,.04);}
   else if(kind==='board'&&this.ok('board',.4)){this.tone('sine',392,392,.12,.12);this.tone('sine',523,523,.16,.1,.005,.08);}
   else if(kind==='start'&&this.ok('start',.3)){this.tone('triangle',523,523,.1,.14);this.tone('triangle',784,784,.18,.14,.005,.09);}
   else if(kind==='countdown'&&this.ok('countdown',.5)){this.tone('sine',660,660,.09,.12);}
  }catch{}
 }
 // 滚动底噪：速度越快越响、越亮；冰面更细、云絮更闷。
 roll(speed,surface='normal',active=true){
  try{
   if(!this.enabled()||!active||document.hidden||speed<.15){if(this.rollGain)this.rollGain.gain.setTargetAtTime(0,this.c.currentTime,.08);return;}
   const c=this.c;if(!this.rollSrc){const n=c.sampleRate*2,b=c.createBuffer(1,n,c.sampleRate),d=b.getChannelData(0);let v=0;for(let i=0;i<n;i++){v=v*.97+(Math.random()*2-1)*.03;d[i]=v*6;}this.rollSrc=c.createBufferSource();this.rollSrc.buffer=b;this.rollSrc.loop=true;this.rollFilter=c.createBiquadFilter();this.rollFilter.type='lowpass';this.rollGain=c.createGain();this.rollGain.gain.value=0;this.rollSrc.connect(this.rollFilter);this.rollFilter.connect(this.rollGain);this.rollGain.connect(this.output());this.rollSrc.start();}
   const v=Math.min(1,speed/8),t=c.currentTime,f=surface==='ice'?2200:surface==='fluff'?260:700;
   this.rollFilter.frequency.setTargetAtTime(f*(.6+v),t,.1);this.rollGain.gain.setTargetAtTime((surface==='fluff'?.05:.09)*v,t,.1);
  }catch{}
 }
 stop(){try{this.rollGain?.gain.setTargetAtTime(0,this.c.currentTime,.05);}catch{}}
}
