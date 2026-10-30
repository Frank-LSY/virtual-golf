// 云端滚球音效：全部实时合成的卡通音色，接入共用的“音效”母线（受音效开关与音量控制）。
// 撞栏“咚”、弹射柱“啵嘤”、加速带“咻”、检查点双音、坠落滑音、复活“啵”、风车横杆“咔”、上浮台“嘟”；
// 另有随速度、路面变化的滚动声（低频滚动 + 细碎颗粒 + 转动节奏）。
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
 // 滚动声（0.21.1 重做）：真实滚球的声音不是一片“沙沙”的噪声，而是三层叠在一起——
 //  · 低频滚动隆隆声：窄带共振（约 90–220 赫兹），音高随速度升高；
 //  · 细碎颗粒声：球面与跑道上的细小凹凸逐个碰撞，形成随速度变密的“咯咯”声；
 //  · 转动节奏：球每转一圈轻微起伏一次（频率 = 速度 / 球周长）。
 // 冰面更亮、更轻滑，云絮更闷、更软；速度越快越响。
 ensureRoll(){
  if(this.rollOut)return;const c=this.c,sr=c.sampleRate,len=Math.floor(sr*4);
  // 低频底噪：多生成一小段，再与开头交叉，循环接缝处没有跳变（否则每圈会“咚”一下）。
  const fadeN=Math.floor(sr*.08),raw=new Float32Array(len+fadeN);let v=0;for(let i=0;i<raw.length;i++){v=(v+(Math.random()*2-1)*.02)*.998;raw[i]=v;}
  const brown=c.createBuffer(1,len,sr),b=brown.getChannelData(0);let peak=0;for(let i=0;i<len;i++){b[i]=i<fadeN?raw[i]*(i/fadeN)+raw[len+i]*(1-i/fadeN):raw[i];peak=Math.max(peak,Math.abs(b[i]));}for(let i=0;i<len;i++)b[i]/=peak||1;
  // 颗粒：泊松分布的短促碰撞，每个约 1–2 毫秒，振幅随机；首尾无缝衔接。
  const grit=c.createBuffer(1,len,sr),g=grit.getChannelData(0);let t=0;while(t<len){t+=Math.floor(-Math.log(1-Math.random())*sr/220);if(t>=len)break;const a=(.25+Math.random()*.75)*(Math.random()<.12?1.8:1),decay=sr*(.0008+Math.random()*.0012);for(let k=0;k<decay*5&&t+k<len;k++)g[(t+k)%len]+=a*Math.exp(-k/decay)*(Math.random()*2-1);}
  let gp=0;for(let i=0;i<len;i++)gp=Math.max(gp,Math.abs(g[i]));for(let i=0;i<len;i++)g[i]/=gp||1;
  const out=this.rollOut=c.createGain();out.gain.value=0;out.connect(this.output());
  const rumble=c.createBufferSource();rumble.buffer=brown;rumble.loop=true;this.rumbleBP=c.createBiquadFilter();this.rumbleBP.type='bandpass';this.rumbleBP.Q.value=2.4;const rumbleLP=c.createBiquadFilter();rumbleLP.type='lowpass';rumbleLP.frequency.value=420;
  this.rumbleAM=c.createGain();this.rumbleAM.gain.value=1;this.rumbleGain=c.createGain();this.rumbleGain.gain.value=0;rumble.connect(this.rumbleBP);this.rumbleBP.connect(rumbleLP);rumbleLP.connect(this.rumbleAM);this.rumbleAM.connect(this.rumbleGain);this.rumbleGain.connect(out);
  this.spin=c.createOscillator();this.spin.frequency.value=1;const depth=c.createGain();depth.gain.value=.3;this.spin.connect(depth);depth.connect(this.rumbleAM.gain);
  this.gritSrc=c.createBufferSource();this.gritSrc.buffer=grit;this.gritSrc.loop=true;this.gritBP=c.createBiquadFilter();this.gritBP.type='bandpass';this.gritBP.Q.value=1.3;this.gritGain=c.createGain();this.gritGain.gain.value=0;this.gritSrc.connect(this.gritBP);this.gritBP.connect(this.gritGain);this.gritGain.connect(out);
  rumble.start();this.spin.start();this.gritSrc.start();
 }
 static rollParams(speed,surface='normal'){
  const v=Math.max(0,Math.min(1,speed/8)),k={normal:{pitch:1,rumble:1,grit:1,gritHz:1300,density:1},ice:{pitch:1.5,rumble:.45,grit:.55,gritHz:3200,density:1.7},fluff:{pitch:.7,rumble:.4,grit:.18,gritHz:650,density:.6}}[surface]||{pitch:1,rumble:1,grit:1,gritHz:1300,density:1};
  return {level:speed<.15?0:Math.min(1,(speed-.15)/.6),rumbleHz:(85+130*v)*k.pitch,rumbleGain:.42*Math.pow(v,.8)*k.rumble,spinHz:Math.max(.2,speed/(2*Math.PI*.48)),gritRate:(.35+1.9*v)*k.density,gritHz:k.gritHz*(.8+.5*v),gritGain:.34*Math.pow(v,.9)*k.grit};
 }
 roll(speed,surface='normal',active=true){
  try{
   if(!this.enabled()||!active||document.hidden||speed<.15){if(this.rollOut)this.rollOut.gain.setTargetAtTime(0,this.c.currentTime,.06);return;}
   this.ensureRoll();const c=this.c,t=c.currentTime,p=SkyrollSfx.rollParams(speed,surface);
   this.rollOut.gain.setTargetAtTime(p.level,t,.05);this.rumbleBP.frequency.setTargetAtTime(p.rumbleHz,t,.08);this.rumbleGain.gain.setTargetAtTime(p.rumbleGain,t,.08);this.spin.frequency.setTargetAtTime(p.spinHz,t,.1);
   this.gritSrc.playbackRate.setTargetAtTime(p.gritRate,t,.08);this.gritBP.frequency.setTargetAtTime(p.gritHz,t,.08);this.gritGain.gain.setTargetAtTime(p.gritGain,t,.08);
  }catch{}
 }
 stop(){try{this.rollOut?.gain.setTargetAtTime(0,this.c.currentTime,.05);}catch{}}
}
