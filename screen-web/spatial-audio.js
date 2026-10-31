const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const CLUB_SOUND=Object.freeze({
 driver:{name:'木杆',body:155,end:85,ring:2350,decay:.14,click:3300,gain:.21},
 iron:{name:'铁杆',body:1550,end:1120,ring:2850,decay:.085,click:5200,gain:.16},
 wedge:{name:'挖起杆',body:1800,end:1250,ring:3200,decay:.065,click:5800,gain:.14},
 sand:{name:'沙坑杆',body:1350,end:900,ring:2400,decay:.07,click:4200,gain:.14},
 chip:{name:'劈起杆',body:1150,end:720,ring:2100,decay:.06,click:3700,gain:.12},
 putter:{name:'推杆',body:480,end:300,ring:1150,decay:.04,click:1900,gain:.09}
});
export const LIE_SOUND=Object.freeze({
 tee:{body:1,brush:.018,filter:3200,duration:.055},fairway:{body:.94,brush:.035,filter:2400,duration:.09},
 green:{body:1,brush:.009,filter:1100,duration:.04},rough:{body:.7,brush:.09,filter:3300,duration:.27},
 sand:{body:.44,brush:.16,filter:1650,duration:.33}
});
export function spatialParameters(frame){
 if(!frame)return {gain:1,pan:0,cutoff:16000,distance:0};
 const {source,listener,right,forward}=frame,delta={x:source.x-listener.x,y:source.y-listener.y,z:source.z-listener.z},d=Math.hypot(delta.x,delta.y,delta.z),dot=v=>(delta.x*v.x+delta.y*v.y+delta.z*v.z)/(d||1),front=clamp(dot(forward),-1,1),behind=1+Math.min(0,front)*.16;
 return {distance:d,pan:clamp(dot(right)*.93,-.93,.93),gain:clamp((1+Math.max(0,d-6)/20)**-.85*behind,.025,1),cutoff:clamp(16000/(1+d/95)*(1+Math.min(0,front)*.28),1400,16000)};
}
export function strikeLayers(clubId,surface,power){
 const c=CLUB_SOUND[clubId]||CLUB_SOUND.iron,s=LIE_SOUND[surface]||LIE_SOUND.fairway,p=.32+.68*Math.sqrt(clamp(Number(power)||0,0,1));
 return [
  {wave:clubId==='driver'?'triangle':'sine',frequency:c.body,end:c.end,duration:c.decay,gain:c.gain*s.body*p},
  {wave:'sine',frequency:c.ring,end:c.ring*.82,duration:c.decay*.58,gain:c.gain*.32*s.body*p},
  {noise:true,filter:c.click,duration:.028,gain:c.gain*.64*s.body*p},
  {noise:true,filter:s.filter,duration:s.duration,gain:s.brush*p,delay:.012}
 ];
}
export function impactLayers(event){
 const strength=clamp(.32+Math.sqrt(Math.max(0,event.verticalSpeed??event.speed??1))*.16,.25,1),noise=(filter,duration,gain)=>({noise:true,filter,duration,gain:gain*strength}),tap=(frequency,duration,gain)=>({wave:'sine',frequency,end:frequency*.58,duration,gain:gain*strength});
 if(event.type==='cup')return event.phase==='bottom'?[tap(720,.12,.1),{...tap(1250,.09,.04),delay:.055}]:[tap(event.kind==='roll_over'?1150:1650,.055,.045)];
 if(event.type==='tree')return event.kind==='trunk'?[tap(185,.13,.24),noise(950,.085,.19)]:[noise(3600,.3,.13),tap(340,.06,.05)];
 // 0.22：击中旗杆是清脆的金属“叮”，撞到岩石是硬朗的“咔”。
 if(event.type==='pin')return [{wave:'triangle',frequency:1980,end:1860,duration:.32,gain:.12*strength},{wave:'sine',frequency:3150,end:3050,duration:.22,gain:.05*strength,delay:.004},tap(520,.05,.05)];
 if(event.type==='rock')return [tap(260,.09,.22),noise(2600,.06,.2),{...tap(610,.05,.08),delay:.01}];
 if(event.type==='water')return [noise(1800,.6,.22),{...tap(165,.25,.1),delay:.05}, {...noise(650,.4,.08),delay:.14}];
 if(event.type==='sand')return [noise(1600,event.phase==='roll'?.18:.34,.17),tap(130,.055,.055)];
 if(event.type==='rough')return [noise(3200,event.phase==='roll'?.2:.27,.10),tap(185,.05,.04)];
 if(event.type==='ground')return [tap(event.surface==='green'?420:250,.045,event.surface==='green'?.065:.09),noise(event.surface==='green'?950:2200,.06,.025)];
 return [];
}

// 仅合成一次噪声缓冲；每次接触最多四层，总计最多十二组空间声源。
export class SpatialGolfAudio {
 constructor(contextFactory,frameProvider,{maxVoices=12,output}={}){this.contextFactory=contextFactory;this.frameProvider=frameProvider;this.maxVoices=maxVoices;this.output=output;this.voices=new Set();}
 init(){if(this.context)return;this.context=this.contextFactory();const c=this.context;this.noise=c.createBuffer(1,c.sampleRate,c.sampleRate);const samples=this.noise.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;}
 strike(shot){if(!shot)return;this.play(strikeLayers(shot.clubId,shot.terrain?.surface,shot.power),shot.path?.[0]||shot.from);}
 impact(event){if(event.phase==='launch')return;this.play(impactLayers(event),event.position);}
 play(layers,position){
  if(!layers.length)return;try{this.init();this.context.resume();while(this.voices.size>=this.maxVoices)this.release(this.voices.values().next().value);
   const c=this.context,now=c.currentTime,filter=c.createBiquadFilter(),gain=c.createGain(),pan=c.createStereoPanner?.();filter.type='lowpass';filter.Q.value=.3;filter.connect(gain);const out=this.output?.()||c.destination;if(pan){gain.connect(pan);pan.connect(out);}else gain.connect(out);
   const voice={position:{...position},filter,gain,pan,nodes:[],sources:[],remaining:layers.length};this.voices.add(voice);this.position(voice,true);
   for(const layer of layers){const source=layer.noise?c.createBufferSource():c.createOscillator(),envelope=c.createGain(),start=now+(layer.delay||0),end=start+layer.duration;source.connect(envelope);voice.nodes.push(envelope);voice.sources.push(source);
    if(layer.noise){source.buffer=this.noise;const colour=c.createBiquadFilter();colour.type='bandpass';colour.frequency.value=layer.filter;colour.Q.value=.55;envelope.connect(colour);colour.connect(filter);voice.nodes.push(colour);}else{source.type=layer.wave;source.frequency.setValueAtTime(layer.frequency,start);source.frequency.exponentialRampToValueAtTime(layer.end,end);envelope.connect(filter);}
    envelope.gain.setValueAtTime(0,start);envelope.gain.linearRampToValueAtTime(layer.gain,start+.002);envelope.gain.exponentialRampToValueAtTime(.0001,end);
    source.onended=()=>{if(--voice.remaining===0)this.release(voice);};source.start(start);source.stop(end+.012);
   }
  }catch{}
 }
 position(voice,immediate=false){const p=spatialParameters(this.frameProvider(voice.position)),t=this.context.currentTime,apply=(param,value)=>immediate?param.setValueAtTime(value,t):param.setTargetAtTime(value,t,.045);apply(voice.gain.gain,p.gain);apply(voice.filter.frequency,p.cutoff);if(voice.pan)apply(voice.pan.pan,p.pan);}
 update(){for(const voice of this.voices)this.position(voice);}
 release(voice){if(!this.voices.delete(voice))return;for(const source of voice.sources){source.onended=null;try{source.stop();}catch{}source.disconnect();}for(const node of [...voice.nodes,voice.filter,voice.gain,voice.pan])node?.disconnect();}
 clear(){for(const voice of [...this.voices])this.release(voice);}
}
