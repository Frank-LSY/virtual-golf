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
 // 滚动声（0.21.2）：金属滚珠在金属轨道上滚动——
 //  · 低频滚动嗡声：窄带共振（约 70–190 赫兹），音高随速度升高；
 //  · 金属振铃：球与轨道的细小碰撞激发一组高 Q 的非谐波共振（像钢珠、钢轨的“铮铮”声），速度越快越密、越亮；
 //  · 转动节奏：球每转一圈轻微起伏一次（频率 = 速度 / 球周长）。
 // 整体放在背景音乐之下（约低 12 dB），冰面更清亮，云絮几乎只剩闷闷的滚动。
 static METAL_MODES=[[1,1],[1.62,.62],[2.37,.42],[3.48,.26]];
 ensureRoll(){
  if(this.rollOut)return;const c=this.c,sr=c.sampleRate,len=Math.floor(sr*4);
  // 低频底噪：多生成一小段，再与开头交叉，循环接缝处没有跳变（否则每圈会“咚”一下）。
  const fadeN=Math.floor(sr*.08),raw=new Float32Array(len+fadeN);let v=0;for(let i=0;i<raw.length;i++){v=(v+(Math.random()*2-1)*.02)*.998;raw[i]=v;}
  const brown=c.createBuffer(1,len,sr),b=brown.getChannelData(0);let peak=0;for(let i=0;i<len;i++){b[i]=i<fadeN?raw[i]*(i/fadeN)+raw[len+i]*(1-i/fadeN):raw[i];peak=Math.max(peak,Math.abs(b[i]));}for(let i=0;i<len;i++)b[i]/=peak||1;
  // 激励：泊松分布的极短碰撞（每秒约 140 次，0.3–0.8 毫秒），用来敲响金属共振；首尾无缝衔接。
  const grit=c.createBuffer(1,len,sr),g=grit.getChannelData(0);let t=0;while(t<len){t+=Math.floor(-Math.log(1-Math.random())*sr/140);if(t>=len)break;const a=(.3+Math.random()*.7)*(Math.random()<.1?1.6:1),decay=sr*(.0003+Math.random()*.0005);for(let k=0;k<decay*6;k++)g[(t+k)%len]+=a*Math.exp(-k/decay)*(Math.random()*2-1);}
  let gp=0;for(let i=0;i<len;i++)gp=Math.max(gp,Math.abs(g[i]));for(let i=0;i<len;i++)g[i]/=gp||1;
  const out=this.rollOut=c.createGain();out.gain.value=0;const soft=c.createBiquadFilter();soft.type='lowpass';soft.frequency.value=6500;out.connect(soft);soft.connect(this.output());
  const rumble=c.createBufferSource();rumble.buffer=brown;rumble.loop=true;this.rumbleBP=c.createBiquadFilter();this.rumbleBP.type='bandpass';this.rumbleBP.Q.value=5;const rumbleLP=c.createBiquadFilter();rumbleLP.type='lowpass';rumbleLP.frequency.value=320;
  this.rumbleGain=c.createGain();this.rumbleGain.gain.value=0;const spinAM=c.createGain();spinAM.gain.value=1;rumble.connect(this.rumbleBP);this.rumbleBP.connect(rumbleLP);rumbleLP.connect(this.rumbleGain);this.rumbleGain.connect(spinAM);spinAM.connect(out);
  this.spin=c.createOscillator();this.spin.frequency.value=1;const depth=c.createGain();depth.gain.value=.25;this.spin.connect(depth);depth.connect(spinAM.gain);
  this.gritSrc=c.createBufferSource();this.gritSrc.buffer=grit;this.gritSrc.loop=true;this.metalGain=c.createGain();this.metalGain.gain.value=0;this.metalGain.connect(spinAM);
  this.modes=SkyrollSfx.METAL_MODES.map(([ratio,gain])=>{const f=c.createBiquadFilter();f.type='bandpass';f.Q.value=42;const g=c.createGain();g.gain.value=gain;this.gritSrc.connect(f);f.connect(g);g.connect(this.metalGain);return {f,ratio};});
  rumble.start();this.spin.start();this.gritSrc.start();
 }
 // ROLL_MIX：滚动声相对于其他音效的总音量（0.21.2 起降低，让它在背景音乐之下）。
 static ROLL_MIX=.35;
 static rollParams(speed,surface='normal'){
  const v=Math.max(0,Math.min(1,speed/8)),k={normal:{pitch:1,rumble:1,metal:1,ring:1150,density:1},ice:{pitch:1.35,rumble:.5,metal:1.1,ring:1650,density:1.4},fluff:{pitch:.75,rumble:.55,metal:.08,ring:520,density:.6}}[surface]||{pitch:1,rumble:1,metal:1,ring:1150,density:1};
  return {level:speed<.15?0:Math.min(1,(speed-.15)/.6)*SkyrollSfx.ROLL_MIX,rumbleHz:(70+120*v)*k.pitch,rumbleGain:.4*Math.pow(v,.8)*k.rumble,spinHz:Math.max(.2,speed/(2*Math.PI*.48)),gritRate:(.4+1.6*v)*k.density,ringHz:k.ring*(1+.28*v),metalGain:3.1*Math.pow(v,1.1)*k.metal};
 }
 roll(speed,surface='normal',active=true){
  try{
   if(!this.enabled()||!active||document.hidden||speed<.15){if(this.rollOut)this.rollOut.gain.setTargetAtTime(0,this.c.currentTime,.06);return;}
   this.ensureRoll();const c=this.c,t=c.currentTime,p=SkyrollSfx.rollParams(speed,surface);
   this.rollOut.gain.setTargetAtTime(p.level,t,.05);this.rumbleBP.frequency.setTargetAtTime(p.rumbleHz,t,.08);this.rumbleGain.gain.setTargetAtTime(p.rumbleGain,t,.08);this.spin.frequency.setTargetAtTime(p.spinHz,t,.1);
   this.gritSrc.playbackRate.setTargetAtTime(p.gritRate,t,.08);for(const m of this.modes)m.f.frequency.setTargetAtTime(p.ringHz*m.ratio,t,.08);this.metalGain.gain.setTargetAtTime(p.metalGain,t,.08);
  }catch{}
 }
 stop(){try{this.rollOut?.gain.setTargetAtTime(0,this.c.currentTime,.05);}catch{}}
}
