const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function ambienceLevels(wind,duck=1){
 const focus=.22+.78*clamp(duck,0,1);
 return {wind:(.012+clamp(wind,0,8)*.006)*focus,bird:.028*focus};
}
export function birdPhrase(random=Math.random){
 const base=2200+random()*1400,count=2+Math.floor(random()*3),notes=[];let delay=0;
 for(let i=0;i<count;i++){const duration=.10+random()*.11;notes.push({delay,duration,start:base*(.9+random()*.2),peak:base*(1.13+random()*.23),end:base*(.8+random()*.15)});delay+=duration+.06+random()*.09;}
 return {notes,pan:(random()-.5)*1.4,next:6+random()*8};
}
export class CourseAmbience {
 constructor(contextFactory,{enabled=true,random=Math.random,output}={}){this.contextFactory=contextFactory;this.output=output;this.random=random;this.enabled=enabled;this.visible=true;this.windSpeed=1;this.voices=new Set();this.nextBird=0;this.unlocked=false;}
 unlock(){
  if(!this.enabled)return;
  try{this.context??=this.contextFactory();this.context.resume();this.unlocked=true;if(!this.windSource)this.createWind();if(!this.nextBird)this.nextBird=this.context.currentTime+2+this.random()*2;}catch{}
 }
 createWind(){
  const c=this.context,buffer=c.createBuffer(1,c.sampleRate*12,c.sampleRate),samples=buffer.getChannelData(0);let brown=0;
  for(let i=0;i<samples.length;i++){brown=(brown+.03*(this.random()*2-1))/1.025;samples[i]=brown*3.5;}
  this.windSource=c.createBufferSource();this.windSource.buffer=buffer;this.windSource.loop=true;
  this.low=c.createBiquadFilter();this.low.type='lowpass';this.low.frequency.value=1350;this.low.Q.value=.4;
  this.high=c.createBiquadFilter();this.high.type='highpass';this.high.frequency.value=100;
  this.windGain=c.createGain();this.windGain.gain.value=0;this.windSource.connect(this.high);this.high.connect(this.low);this.low.connect(this.windGain);this.windGain.connect(this.destination());this.windSource.start();
 }
 destination(){return this.output?.()||this.context.destination;}
 setWeather(speed){this.windSpeed=clamp(Number(speed)||0,0,8);}
 setEnabled(enabled){this.enabled=!!enabled;if(!enabled)this.quiet();else if(this.unlocked)this.unlock();}
 setVisible(visible){this.visible=!!visible;if(!visible)this.quiet();else if(this.context)this.nextBird=this.context.currentTime+3;}
 quiet(){if(!this.context)return;const now=this.context.currentTime;this.windGain?.gain.setTargetAtTime(0,now,.12);for(const v of this.voices){v.gain.gain.cancelScheduledValues(now);v.gain.gain.setTargetAtTime(0,now,.015);try{v.osc.stop(now+.08);}catch{}}}
 chirp(level){
  const c=this.context,phrase=birdPhrase(this.random),start=c.currentTime;
  for(const note of phrase.notes){
   const osc=c.createOscillator(),gain=c.createGain(),pan=c.createStereoPanner?.(),t=start+note.delay;
   osc.type='sine';osc.frequency.setValueAtTime(note.start,t);osc.frequency.exponentialRampToValueAtTime(note.peak,t+note.duration*.35);osc.frequency.exponentialRampToValueAtTime(note.end,t+note.duration);
   gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(level,t+.018);gain.gain.exponentialRampToValueAtTime(.0001,t+note.duration);
   osc.connect(gain);const out=this.destination();if(pan){pan.pan.value=phrase.pan;gain.connect(pan);pan.connect(out);}else gain.connect(out);
   const voice={osc,gain,pan};this.voices.add(voice);osc.onended=()=>{osc.disconnect();gain.disconnect();pan?.disconnect();this.voices.delete(voice);};osc.start(t);osc.stop(t+note.duration+.025);
  }
  this.nextBird=start+phrase.next;
 }
 update(duck=1){
  if(!this.context||!this.unlocked||!this.enabled||!this.visible)return;
  const t=this.context.currentTime,levels=ambienceLevels(this.windSpeed,duck),gust=.76+.16*Math.sin(t*.39)+.08*Math.sin(t*.13+1);
  this.windGain.gain.setTargetAtTime(levels.wind*gust,t,.18);this.low.frequency.setTargetAtTime(650+this.windSpeed*100+gust*200,t,.6);
  // 击球期间暂不开始新的鸟鸣，避免盖住触球声；已发出的声音柔和收尾。
  if(t>=this.nextBird&&duck>.8&&this.voices.size===0)this.chirp(levels.bird);
  if(duck<.8)for(const v of this.voices){v.gain.gain.cancelScheduledValues(t);v.gain.gain.setTargetAtTime(.0001,t,.04);}
 }
 dispose(){this.quiet();try{this.windSource?.stop();}catch{}this.windSource?.disconnect();this.low?.disconnect();this.high?.disconnect();this.windGain?.disconnect();this.windSource=null;}
}
