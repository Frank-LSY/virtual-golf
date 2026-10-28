// 原创生成音乐：大厅「晴空」与练习室「节拍」。
// 不使用任何录音或采样：所有声音都由 Web Audio 振荡器与噪声实时合成。
// 作曲器（composeCycle）是纯函数，只依赖种子，可在 Node 中测试；合成器既能实时播放，也能用 OfflineAudioContext 离线渲染试听。

export const STEPS=16;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const pc=m=>((m%12)+12)%12;
export const mtof=m=>440*2**((m-69)/12);
export function rng(seed){let a=seed>>>0;return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
const pick=(r,list)=>list[Math.min(list.length-1,Math.floor(r()*list.length))];
function weighted(r,list){let total=0;for(const [,w] of list)total+=w;let x=r()*total;for(const [item,w] of list)if((x-=w)<0)return item;return list[list.length-1][0];}

// 和弦：voicing 为钢琴/电钢中音区排列，tones 为和弦音（旋律强拍落点），scale 为旋律可用音级。
export const CHORDS=Object.freeze({
 Fmaj9:{bass:41,voicing:[57,60,64,67],tones:[5,9,0,4,7],scale:[0,2,4,7,9]},
 Em7:{bass:40,voicing:[55,59,62,64],tones:[4,7,11,2],scale:[2,4,7,9,11]},
 Dm9:{bass:38,voicing:[53,57,60,64],tones:[2,5,9,0,4],scale:[0,2,4,5,7,9]},
 Cmaj9:{bass:36,voicing:[52,55,59,62],tones:[0,4,7,11,2],scale:[0,2,4,7,9]},
 G13:{bass:43,voicing:[53,57,59,64],tones:[7,11,2,4,9],scale:[2,4,7,9,11]},
 A9:{bass:45,voicing:[55,59,61,64],tones:[9,1,4,7,11],scale:[1,4,7,9,11]},
 Am9:{bass:45,voicing:[55,59,60,64],tones:[9,0,4,7,11],scale:[0,2,4,7,9]},
 Fmaj9b:{bass:41,voicing:[55,57,60,64],tones:[5,9,0,4,7],scale:[0,2,4,7,9]},
 G9sus:{bass:43,voicing:[53,57,60,62],tones:[7,0,2,5,9],scale:[0,2,5,7,9]}
});

const BRIGHT_CELLS=[[[0,3],[3,3],[6,2],[8,4]],[[2,2],[4,2],[6,4],[12,2],[14,2]],[[0,2],[2,2],[4,4],[10,2],[12,4]],[[0,6],[6,2],[8,2],[10,6]],[[4,2],[6,2],[8,2],[10,2],[12,4]],[[0,4],[6,2],[8,8]],[[0,2],[3,1],[4,2],[8,2],[11,1],[12,4]]];
const BRIGHT_CADENCE=[[[0,4],[4,12]],[[0,2],[2,2],[4,12]],[[2,2],[4,4],[8,8]],[[0,12]]];
const CALM_CELLS=[[[0,8],[8,8]],[[4,4],[8,8]],[[0,6],[6,2],[8,8]],[[0,12],[12,4]],[[8,8]],[[2,2],[4,12]],[[0,4],[4,4],[8,8]]];
const CALM_CADENCE=[[[0,16]],[[0,8],[8,8]],[[4,12]]];

export const TRACKS=Object.freeze({
 sunny:{
  id:'sunny',title:'晴空',detail:'原创 Lo-Fi · 轻快明亮',bpm:86,swing:.58,seed:20261028,gain:.86,
  keys:'epiano',drums:'boom',
  progressions:{A:['Fmaj9','Em7','Dm9','Cmaj9'],B:['Dm9','G13','Em7','A9','Dm9','G13','Cmaj9','Cmaj9']},
  lead:{inst:'marimba',range:[69,88],cells:BRIGHT_CELLS,cadence:BRIGHT_CADENCE,plan:['M','V','N','C','m','V','n','F'],vel:.82},
  form:[
   {id:'intro',bars:4,prog:'A',keys:'hold',pad:.55,bell:'last',filter:[900,7600],vinyl:1.4},
   {id:'a',bars:8,prog:'A',keys:'comp',drums:'main',bass:'P1'},
   {id:'a2',bars:8,prog:'A',keys:'comp',drums:'main',bass:'P1',lead:true},
   {id:'b',bars:8,prog:'B',keys:'comp2',drums:'b',bass:'P2',lead:true,pad:.4,shaker:true},
   {id:'break',bars:4,prog:'A',keys:'hold',drums:'light',bass:'P0',pad:.6,bell:'all',filter:[2600,7600],vinyl:1.3},
   {id:'a3',bars:8,prog:'A',keys:'comp',drums:'main',bass:'P3',lead:true,theme:'a2',double:true,shaker:true}
  ],loopFrom:1,
  mix:{keys:.51,bass:.09,lead:.8,pad:.53,drums:.49,bell:.64},send:{keys:.22,lead:.32,pad:.45,drums:.07,bell:.55,bass:0},
  tone:{lowpass:7600,drums:8500,drive:.3,reverb:.3,vinyl:.44,wow:[.55,5],pump:.26}
 },
 practice:{
  id:'practice',title:'节拍',detail:'原创钢琴 Lo-Fi · 稳定律动',bpm:74,swing:.55,seed:20261029,gain:.81,
  keys:'piano',drums:'brush',
  progressions:{A:['Dm9','G13','Cmaj9','Am9'],B:['Fmaj9b','Em7','Dm9','G9sus']},
  lead:{inst:'piano',range:[67,84],cells:CALM_CELLS,cadence:CALM_CADENCE,plan:['M','R','N','C','m','E','n','F'],vel:.7},
  form:[
   {id:'intro',bars:4,prog:'A',keys:'arpC',pad:.35,filter:[1400,6400],vinyl:1.3},
   {id:'a',bars:8,prog:'A',keys:'arp',drums:'brush',bass:'W1'},
   {id:'a2',bars:8,prog:'A',keys:'arp',drums:'brush',bass:'W1',lead:true},
   {id:'b',bars:8,prog:'B',keys:'arpB',drums:'brush2',bass:'W2',lead:true,pad:.35},
   {id:'a3',bars:8,prog:'A',keys:'arp',drums:'brush2',bass:'W2',lead:true,theme:'a2'},
   {id:'break',bars:4,prog:'B',keys:'hold',drums:'tick',bass:'W0',pad:.45,filter:[6400,3600],vinyl:1.2}
  ],loopFrom:1,
  mix:{keys:.83,bass:.15,lead:.97,pad:.64,drums:.54,bell:.3},send:{keys:.3,lead:.4,pad:.45,drums:.1,bell:.5,bass:0},
  tone:{lowpass:6400,drums:7000,drive:.22,reverb:.34,vinyl:.43,wow:[.42,6],pump:.12}
 }
});

// 十六分音符位置 → 小节内秒数（含摇摆：每对十六分音符的后一个推迟）。
export function stepTime(step,barDuration,swing=.5){
 const d=barDuration/STEPS,pair=Math.floor(step/2)*2,w=step-pair;
 return (pair+(w<=1?w*2*swing:2*swing+(w-1)*(2-2*swing)))*d;
}

// ---------- 作曲 ----------
function melodyNotes(chord,range){const out=[];for(let m=range[0];m<=range[1];m++)if(chord.scale.includes(pc(m)))out.push(m);return out;}
function toneNotes(chord,range){const list=melodyNotes(chord,range).filter(m=>chord.tones.includes(pc(m)));return list.length?list:melodyNotes(chord,range);}
const nearest=(list,p)=>list.reduce((best,m)=>Math.abs(m-p)<Math.abs(best-p)?m:best,list[0]);
function chooseTone(chord,range,p,r){const sorted=[...toneNotes(chord,range)].sort((a,b)=>Math.abs(a-p)-Math.abs(b-p));return r()<.72?sorted[0]:sorted[Math.min(1,sorted.length-1)];}
function moveScale(chord,range,p,steps){const list=melodyNotes(chord,range),n=list.length-1;let i=list.indexOf(nearest(list,p))+steps;if(i<0)i=-i;if(i>n)i=2*n-i;return list[clamp(i,0,n)];}
function snapTone(chord,range,p){const t=nearest(toneNotes(chord,range),p);return Math.abs(t-p)<=2?t:p;}

function makeMotif(cell,r){
 const shape=pick(r,['up','arch','down','arch']),moves=[];
 for(let i=1;i<cell.length;i++){
  const rising=shape==='up'?r()<.75:shape==='down'?r()<.25:(i<cell.length/2?r()<.72:r()<.28);
  moves.push((rising?1:-1)*weighted(r,[[1,6],[2,3],[0,.5]]));
 }
 return {cell,moves};
}
function realize(motif,chord,range,start,r){
 let p=chooseTone(chord,range,start,r);const notes=[];
 motif.cell.forEach(([step,dur],i)=>{if(i>0){p=moveScale(chord,range,p,motif.moves[i-1]);if(step%8===0)p=snapTone(chord,range,p);}notes.push({step,dur,midi:p});});
 return notes;
}
function vary(motif,r){const moves=motif.moves.map(m=>r()<.25?-m:m);return {cell:motif.cell,moves};}
function cadence(cell,chord,range,prev,r,final){
 const prefer=final?[chord.tones[0],chord.tones[1]]:[chord.tones[1],chord.tones[2]],tones=toneNotes(chord,range),targets=tones.filter(m=>prefer.includes(pc(m))),target=nearest(targets.length?targets:tones,prev),dir=r()<.6?1:-1;
 return cell.map(([step,dur],i)=>({step,dur,midi:i===cell.length-1?target:moveScale(chord,range,target,dir*(cell.length-1-i))}));
}

function composeLead(track,bars,r,state,themeFrom){
 const L=track.lead,range=L.range,theme=themeFrom?state.themes[themeFrom]:null;
 let motif=theme?vary(theme.motif,r):null,answer=null,anchor=theme?.anchor??state.prev,last=[];
 const saved={motif:null,anchor:null};
 bars.forEach((bar,i)=>{
  const chord=CHORDS[bar.chord],kind=L.plan[i%L.plan.length];let notes=[];
  if(kind==='M'||kind==='m'||(kind==='V'&&!motif)){motif??=makeMotif(pick(r,L.cells),r);notes=realize(motif,chord,range,kind==='m'?anchor:state.prev,r);if(kind==='M')anchor=notes[0]?.midi??anchor;}
  else if(kind==='V')notes=realize(vary(motif,r),chord,range,(last[0]?.midi??state.prev)+(r()<.5?-2:2),r);
  else if(kind==='N'||kind==='n'){if(kind==='N'||!answer)answer=makeMotif(pick(r,L.cells),r);notes=realize(kind==='n'?vary(answer,r):answer,chord,range,state.prev+(r()<.6?3:-2),r);}
  else if(kind==='C'||kind==='F')notes=cadence(pick(r,L.cadence),chord,range,state.prev,r,kind==='F');
  else if(kind==='E')notes=last.slice(-2).map((n,k)=>({step:8+k*4,dur:k?4:4,midi:snapTone(chord,range,n.midi),echo:true}));
  for(const n of notes){
   const accent=n.step%8===0?1:n.step%4===0?.9:.78;
   bar.events.push({inst:L.inst,bus:'lead',step:n.step,dur:n.dur,midi:n.midi,vel:L.vel*accent*(n.echo?.55:1)*(.92+r()*.14),nudge:(r()-.5)*14});
   if(bar.spec.double&&n.step%4===0)bar.events.push({inst:'bell',bus:'bell',step:n.step,dur:n.dur,midi:n.midi+12,vel:.32*(.9+r()*.2),nudge:0});
  }
  if(notes.length){state.prev=notes[notes.length-1].midi;last=notes;}
 });
 saved.motif=motif;saved.anchor=anchor;return saved;
}

const EP_COMP={hold:[[0,16,.85]],push:[[0,9,.9],[10,6,.6]],skip:[[0,5,.9],[6,4,.55],[12,4,.68]],stab:[[0,3,.9],[3,3,.5],[8,6,.75],[14,2,.5]],lay:[[0,7,.85],[7,9,.58]]};
const PIANO_ARP={
 arpA:[[0,'c',16,.6],[6,3,4,.4],[8,2,4,.36],[12,3,4,.38]],
 arpB:[[0,'c',8,.6],[4,1,4,.34],[8,'c',8,.46],[12,2,4,.34]],
 arpC:[[0,'c',16,.55],[10,'t',6,.3]],
 arpD:[[0,'c',12,.58],[4,2,2,.3],[6,3,6,.36],[12,1,4,.3]],
 hold:[[0,'c',16,.52]]
};
function composeKeys(track,bar,r){
 const chord=CHORDS[bar.chord],style=bar.spec.keys,j=()=>.92+r()*.14;
 if(track.keys==='epiano'){
  let name=style==='hold'?'hold':style==='comp2'?weighted(r,[['stab',3],['push',3],['skip',2]]):weighted(r,[['push',4],['skip',3],['hold',2],['lay',2]]);
  if(style!=='hold'&&bar.index===bar.count-1)name='push';
  EP_COMP[name].forEach(([step,dur,vel],k)=>bar.events.push({inst:'epiano',bus:'keys',step,dur,notes:k?chord.voicing.slice(1):chord.voicing,vel:vel*j(),strum:.01+r()*.012,nudge:(r()-.5)*10}));
  return;
 }
 const name=style==='arp'?weighted(r,[['arpA',3],['arpB',2],['arpD',2]]):style==='arpB'?weighted(r,[['arpB',3],['arpD',2]]):style==='arpC'?'arpC':'hold';
 for(const [step,which,dur,vel] of PIANO_ARP[name]){
  const notes=which==='c'?[chord.bass+12,...chord.voicing]:which==='t'?[chord.voicing[3]+12]:[chord.voicing[which]];
  bar.events.push({inst:'piano',bus:'keys',step,dur,notes,vel:vel*j(),strum:which==='c'?.016+r()*.01:0,thump:which==='c',nudge:(r()-.5)*12});
 }
}

const BASS={P0:[[0,16,'R',.8]],P1:[[0,6,'R',.9],[10,4,'R',.7],[14,2,'A',.6]],P2:[[0,8,'R',.9],[8,3,'5',.62],[12,4,'8',.56]],P3:[[0,10,'R',.9],[11,3,'R',.55],[14,2,'A',.6]],W0:[[0,16,'R',.6]],W1:[[0,14,'R',.7]],W2:[[0,8,'R',.7],[8,6,'5',.5],[14,2,'A',.45]]};
function composeBass(bar,r){
 const style=bar.spec.bass;if(!style)return;const chord=CHORDS[bar.chord],next=CHORDS[bar.next].bass,root=chord.bass;
 const pattern=style==='P1'&&r()<.25?BASS.P3:BASS[style];
 for(const [step,dur,degree,vel] of pattern){
  const midi=degree==='R'?root:degree==='5'?root+7:degree==='8'?root+12:Math.abs(next-root)<=1?root+7:next+(next>root?-1:1);
  bar.events.push({inst:'bass',bus:'bass',step,dur,midi,vel:vel*(.94+r()*.1),nudge:(r()-.5)*6});
 }
}

function composeDrums(track,bar,r){
 const style=bar.spec.drums;if(!style)return;
 const hit=(inst,step,vel)=>bar.events.push({inst,bus:'drums',step,dur:1,vel:vel*(.9+r()*.16),nudge:(r()-.5)*4});
 const fill=bar.count>=8&&bar.index===bar.count-1,last=bar.index===bar.count-1;
 if(track.drums==='boom'){
  if(style==='light'){for(let i=0;i<16;i+=2)hit('hat',i,i%4?.32:.46);for(let i=1;i<16;i+=2)hit('shaker',i,.36);if(last){hit('kick',12,.45);hit('snare',14,.3);hit('snare',15,.45);}return;}
  hit('kick',0,1);if(style==='b'){hit('kick',6,.5);hit('kick',10,.8);}else{if(r()<.6)hit('kick',7,.48);hit('kick',10,.85);}
  hit('snare',4,.9);hit('snare',12,.95);if(r()<.3)hit('snare',7,.16);
  if(fill){hit('snare',13,.28);hit('snare',14,.42);hit('snare',15,.58);}
  for(let i=0;i<16;i+=2){if(fill&&i===14){hit('ohat',14,.42);continue;}if(style==='b'&&i===6&&bar.index%2){hit('ohat',6,.32);continue;}hit('hat',i,i%4===0?.6:.4);}
  if(r()<.35)hit('hat',15,.22);if(r()<.2)hit('hat',11,.2);
  if(bar.spec.shaker)for(let i=1;i<16;i+=2)hit('shaker',i,.32);
  return;
 }
 if(style==='tick'){for(let i=0;i<16;i+=2)hit('tick',i,i%4?.22:.32);return;}
 hit('kick',0,.8);hit('kick',8,.6);if(r()<.3)hit('kick',10,.32);
 hit('brush',4,.6);hit('brush',12,.66);if(r()<.5)hit('brush',7,.16);if(r()<.4)hit('brush',15,.18);
 for(let i=0;i<16;i+=2)hit('tick',i,i%4===0?.34:.24);
 if(style==='brush2'&&bar.index%2)hit('rim',14,.3);
 if(fill){hit('brush',14,.32);hit('rim',15,.24);}
}

function composeBell(bar,r){
 const mode=bar.spec.bell;if(!mode||(mode==='last'&&bar.index!==bar.count-1)||(mode==='all'&&bar.index%2===0))return;
 const tones=toneNotes(CHORDS[bar.chord],[81,98]),start=Math.floor(r()*Math.max(1,tones.length-4));
 tones.slice(start,start+4).forEach((midi,k)=>bar.events.push({inst:'bell',bus:'bell',step:8+k*2,dur:2,midi,vel:(.5-k*.05)*(.9+r()*.2),nudge:(r()-.5)*8}));
}

// 生成一个循环：第 0 轮从前奏开始，之后从 loopFrom 段落循环，每一轮的旋律、伴奏型和鼓点细节都会变化。
export function composeCycle(track,cycle=0,seed=track.seed){
 const sections=cycle===0?track.form:track.form.slice(track.loopFrom),r=rng((seed^Math.imul(cycle+1,0x9E3779B1))>>>0);
 const bars=[];
 for(const spec of sections){const prog=track.progressions[spec.prog];for(let i=0;i<spec.bars;i++){const [f0,f1]=spec.filter||[track.tone.lowpass,track.tone.lowpass];bars.push({section:spec.id,index:i,count:spec.bars,chord:prog[i%prog.length],spec,events:[],filter:[f0+(f1-f0)*i/spec.bars,f0+(f1-f0)*(i+1)/spec.bars],vinyl:spec.vinyl??1});}}
 const loopChord=track.progressions[track.form[track.loopFrom].prog][0];bars.forEach((b,i)=>b.next=bars[i+1]?.chord??loopChord);
 const state={prev:Math.round((track.lead.range[0]+track.lead.range[1])/2),themes:{}};let at=0;
 for(const spec of sections){
  const slice=bars.slice(at,at+spec.bars);at+=spec.bars;
  for(const bar of slice){composeKeys(track,bar,r);composeBass(bar,r);composeDrums(track,bar,r);composeBell(bar,r);if(spec.pad)bar.events.push({inst:'pad',bus:'pad',step:0,dur:16,notes:CHORDS[bar.chord].voicing,vel:spec.pad,nudge:0});}
  if(spec.lead)state.themes[spec.id]=composeLead(track,slice,r,state,spec.theme);
 }
 for(const bar of bars)bar.events.sort((a,b)=>a.step-b.step);
 return bars;
}

// ---------- 合成 ----------
const caches=new WeakMap();
function cached(c,key,make){let map=caches.get(c);if(!map)caches.set(c,map=new Map());if(!map.has(key))map.set(key,make());return map.get(key);}
function noiseBuffer(c){return cached(c,'noise',()=>{const b=c.createBuffer(1,c.sampleRate*2,c.sampleRate),d=b.getChannelData(0),r=rng(7);for(let i=0;i<d.length;i++)d[i]=r()*2-1;return b;});}
function impulseBuffer(c){return cached(c,'impulse',()=>{const len=Math.floor(c.sampleRate*2.4),b=c.createBuffer(2,len,c.sampleRate),r=rng(99);for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch);let lp=0;for(let i=0;i<len;i++){const t=i/c.sampleRate;lp+=((r()*2-1)-lp)*(.5-.38*Math.min(1,t/2.4));d[i]=t<.014?0:lp*Math.exp(-t/.62);}}return b;});}
function vinylBuffer(c){return cached(c,'vinyl',()=>{
 const len=c.sampleRate*7,b=c.createBuffer(2,len,c.sampleRate),r=rng(4242);
 for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch);let lp=0;for(let i=0;i<len;i++){const n=r()*2-1;lp+=(n-lp)*.03;d[i]=(n-lp)*.018+lp*.012;}}
 for(let k=0;k<70;k++){const at=Math.floor(r()*len),pop=r()<.1,amp=(pop?.42:.08+r()*.18)*(r()<.5?-1:1),width=pop?36:2+Math.floor(r()*5),spread=.65+r()*.35;
  for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch),g=ch?spread:1;for(let j=0;j<width*5&&at+j<len;j++)d[at+j]+=amp*g*Math.exp(-j/width)*(j%2?-.55:1);}}
 return b;});}
function pianoWave(c){return cached(c,'piano',()=>{const imag=new Float32Array([0,1,.46,.24,.15,.09,.055,.032,.02,.012]);return c.createPeriodicWave(new Float32Array(imag.length),imag);});}
function driveCurve(amount){const n=2048,curve=new Float32Array(n),k=1+amount*3;for(let i=0;i<n;i++){const x=i/(n-1)*2-1;curve[i]=Math.tanh(k*x)/k;}return curve;}

class Synth{
 constructor(c,track,{stems}={}){
  this.c=c;this.track=track;const g=v=>{const n=c.createGain();n.gain.value=v;return n;},t=track.tone;
  this.out=g(0);this.level=g(track.gain);
  this.comp=c.createDynamicsCompressor();this.comp.threshold.value=-20;this.comp.knee.value=12;this.comp.ratio.value=3;this.comp.attack.value=.012;this.comp.release.value=.22;
  this.drive=c.createWaveShaper();this.drive.curve=driveCurve(t.drive);this.drive.oversample='2x';
  this.tone=c.createBiquadFilter();this.tone.type='lowpass';this.tone.Q.value=.7;this.tone.frequency.value=t.lowpass;this.presence=c.createBiquadFilter();this.presence.type='peaking';this.presence.frequency.value=1600;this.presence.Q.value=.6;this.presence.gain.value=t.presence??4.5;
  this.sub=c.createBiquadFilter();this.sub.type='highpass';this.sub.frequency.value=32;this.sub.Q.value=.6;
  this.mix=g(1);this.mix.connect(this.sub);this.sub.connect(this.presence);this.presence.connect(this.tone);this.tone.connect(this.drive);this.drive.connect(this.comp);this.comp.connect(this.level);this.level.connect(this.out);
  this.verb=c.createConvolver();this.verb.buffer=impulseBuffer(c);this.verbIn=g(1);this.verbOut=g(t.reverb);const verbHP=c.createBiquadFilter();verbHP.type='highpass';verbHP.frequency.value=200;this.verbIn.connect(this.verb);this.verb.connect(verbHP);verbHP.connect(this.verbOut);this.verbOut.connect(this.mix);
  this.pump=g(1);this.pump.connect(this.mix);this.keysHP=c.createBiquadFilter();this.keysHP.type='highpass';this.keysHP.frequency.value=95;this.keysHP.Q.value=.6;this.keysHP.connect(this.pump);
  this.drumTone=c.createBiquadFilter();this.drumTone.type='lowpass';this.drumTone.frequency.value=t.drums;this.drumTone.connect(this.mix);
  this.bus={};
  for(const name of ['keys','bass','lead','pad','drums','bell']){
   const level=stems&&!stems.includes(name)?0:track.mix[name],bus=g(level);this.bus[name]=bus;
   bus.connect(name==='drums'?this.drumTone:name==='keys'||name==='pad'?this.keysHP:this.mix);
   if(track.send[name]){const send=g(track.send[name]);bus.connect(send);send.connect(this.verbIn);}
  }
  this.noise=noiseBuffer(c);this.wave=pianoWave(c);
  this.lfo=c.createOscillator();this.lfo.frequency.value=t.wow[0];this.wow=g(t.wow[1]);this.lfo.connect(this.wow);
  this.vinylGain=g(stems&&!stems.includes('vinyl')?0:t.vinyl);this.vinyl=c.createBufferSource();this.vinyl.buffer=vinylBuffer(c);this.vinyl.loop=true;this.vinyl.connect(this.vinylGain);this.vinylGain.connect(this.mix);
  this.vinylLevel=stems&&!stems.includes('vinyl')?0:t.vinyl;
 }
 connect(destination){this.out.connect(destination);}
 start(t){this.lfo.start(t);this.vinyl.start(t,Math.random()*6);}
 dispose(){for(const n of [this.lfo,this.vinyl])try{n.stop();}catch{}try{this.out.disconnect();}catch{}}
 clean(source,nodes,wobble){source.onended=()=>{if(wobble)try{this.wow.disconnect(wobble);}catch{}source.disconnect();for(const n of nodes)n.disconnect();};}
 automate(bar,t0,duration){
  const f=this.tone.frequency;f.setValueAtTime(bar.filter[0],t0);f.exponentialRampToValueAtTime(Math.max(200,bar.filter[1]),t0+duration);
  this.vinylGain.gain.setTargetAtTime(this.vinylLevel*bar.vinyl,t0,.6);
 }
 duckOnKick(t,vel){const depth=this.track.tone.pump*vel,g=this.pump.gain;g.setTargetAtTime(1-depth,t,.006);g.setTargetAtTime(1,t+.045,.13);}
 play(ev,t,duration){
  const bus=this.bus[ev.bus]||this.mix;
  switch(ev.inst){
   case 'epiano':ev.notes.forEach((m,k)=>this.epiano(t+k*ev.strum,m,duration-k*ev.strum,ev.vel*(k===ev.notes.length-1?1.08:.92),bus));break;
   case 'piano':{const notes=ev.notes||[ev.midi];notes.forEach((m,k)=>this.piano(t+k*(ev.strum||0),m,duration,ev.vel*(notes.length===1?1:k===0?.8:k===notes.length-1?1.06:.9),bus,ev.thump&&k===0));break;}
   case 'bass':this.bass(t,ev.midi,duration,ev.vel,bus);break;
   case 'marimba':this.marimba(t,ev.midi,duration,ev.vel,bus);break;
   case 'bell':this.bell(t,ev.midi,ev.vel,bus);break;
   case 'pad':this.pad(t,ev.notes,duration,ev.vel,bus);break;
   case 'kick':this.kick(t,ev.vel,bus);this.duckOnKick(t,ev.vel);break;
   default:this.drum(ev.inst,t,ev.vel,bus);
  }
 }
 osc(type,f,t,stop,detune=0,wobble=false){const o=this.c.createOscillator();o.type=type;o.frequency.value=f;o.detune.value=detune;if(wobble)this.wow.connect(o.detune);o.start(t);o.stop(stop);return o;}
 epiano(t,m,dur,vel,bus){
  const c=this.c,f=mtof(m),stop=t+Math.max(.1,dur)+.9,car=this.osc('sine',f,t,stop,(Math.random()-.5)*6,true),mod=this.osc('sine',f,t,stop),tine=this.osc('sine',f*14,t,t+.12),mg=c.createGain(),tg=c.createGain(),amp=c.createGain();
  mod.connect(mg);mg.connect(car.frequency);tine.connect(tg);tg.connect(car.frequency);car.connect(amp);amp.connect(bus);
  mg.gain.setValueAtTime(f*(.8+1.8*vel),t);mg.gain.setTargetAtTime(f*.55,t,.4);tg.gain.setValueAtTime(f*1.2*vel,t);tg.gain.setTargetAtTime(0,t,.018);this.clean(tine,[tg]);
  const peak=.15*vel*(m>70?.82:1),end=t+Math.max(.1,dur);amp.gain.setValueAtTime(0,t);amp.gain.linearRampToValueAtTime(peak,t+.005);amp.gain.setTargetAtTime(peak*.3,t+.005,.8);amp.gain.setTargetAtTime(0,end,.16);
  this.clean(car,[mod,mg,amp],car.detune);
 }
 piano(t,m,dur,vel,bus,thump){
  const c=this.c,f=mtof(m),tail=clamp(2.7-(m-48)*.045,.8,2.7),end=t+Math.max(.12,dur),stop=end+1.3,o1=this.osc('sine',f,t,stop,-2.6,true),o2=this.osc('sine',f,t,stop,2.6+(Math.random()-.5)*1.2,true),lp=c.createBiquadFilter(),amp=c.createGain();
  o1.setPeriodicWave(this.wave);o2.setPeriodicWave(this.wave);lp.type='lowpass';lp.Q.value=.3;
  const bright=Math.min(9000,f*(2.2+5*vel)+400);lp.frequency.setValueAtTime(bright,t);lp.frequency.setTargetAtTime(Math.min(bright,f*1.6+260),t+.01,.35+.4*(1-vel));
  o1.connect(lp);o2.connect(lp);lp.connect(amp);amp.connect(bus);
  const peak=.11*vel,second=Math.min(t+.35,end);amp.gain.setValueAtTime(0,t);amp.gain.linearRampToValueAtTime(peak,t+.004);amp.gain.setTargetAtTime(peak*.5,t+.004,.12);amp.gain.setTargetAtTime(0,second,tail);if(end>second)amp.gain.setTargetAtTime(0,end,.22);
  this.clean(o1,[lp,amp],o1.detune);this.clean(o2,[],o2.detune);
  if(thump){const n=c.createBufferSource(),nl=c.createBiquadFilter(),ng=c.createGain();n.buffer=this.noise;nl.type='lowpass';nl.frequency.value=900;n.connect(nl);nl.connect(ng);ng.connect(bus);ng.gain.setValueAtTime(.05*vel,t);ng.gain.setTargetAtTime(0,t+.002,.014);n.start(t,Math.random()*1.5);n.stop(t+.12);this.clean(n,[nl,ng]);}
 }
 bass(t,m,dur,vel,bus){
  const c=this.c,f=mtof(m),end=t+Math.max(.1,dur),stop=end+.4,o1=this.osc('triangle',f,t,stop),o2=this.osc('sine',f,t,stop),lp=c.createBiquadFilter(),amp=c.createGain();
  lp.type='lowpass';lp.Q.value=.7;lp.frequency.setValueAtTime(180+vel*520,t);lp.frequency.setTargetAtTime(150+f*1.3,t,.2);
  o1.connect(lp);o2.connect(lp);lp.connect(amp);amp.connect(bus);
  amp.gain.setValueAtTime(0,t);amp.gain.linearRampToValueAtTime(.34*vel,t+.01);amp.gain.setTargetAtTime(.24*vel,t+.01,.28);amp.gain.setTargetAtTime(0,end,.05);
  this.clean(o1,[lp,amp]);this.clean(o2,[]);
 }
 marimba(t,m,dur,vel,bus){
  const c=this.c,f=mtof(m),stop=t+1.8,o1=this.osc('sine',f,t,stop,0,true),o2=this.osc('sine',f*4,t,t+.25),a1=c.createGain(),a2=c.createGain();
  o1.connect(a1);o2.connect(a2);a1.connect(bus);a2.connect(bus);
  a1.gain.setValueAtTime(0,t);a1.gain.linearRampToValueAtTime(.22*vel,t+.003);a1.gain.setTargetAtTime(0,t+.003,clamp(.42-(m-70)*.008,.16,.42));
  if(dur<.9)a1.gain.setTargetAtTime(0,t+Math.max(.08,dur),.14);
  a2.gain.setValueAtTime(0,t);a2.gain.linearRampToValueAtTime(.1*vel,t+.002);a2.gain.setTargetAtTime(0,t+.002,.05);
  this.clean(o1,[a1],o1.detune);this.clean(o2,[a2]);
 }
 bell(t,m,vel,bus){
  const c=this.c,f=mtof(m),o1=this.osc('sine',f,t,t+3.4),o2=this.osc('sine',f*2.76,t,t+1),o3=this.osc('sine',f*5.4,t,t+.3),a1=c.createGain(),a2=c.createGain(),a3=c.createGain();
  o1.connect(a1);o2.connect(a2);o3.connect(a3);for(const a of [a1,a2,a3])a.connect(bus);
  for(const [a,level,tau] of [[a1,.11,.85],[a2,.035,.22],[a3,.015,.05]]){a.gain.setValueAtTime(0,t);a.gain.linearRampToValueAtTime(level*vel,t+.002);a.gain.setTargetAtTime(0,t+.002,tau);}
  this.clean(o1,[a1]);this.clean(o2,[a2]);this.clean(o3,[a3]);
 }
 pad(t,notes,dur,level,bus){
  const c=this.c,lp=c.createBiquadFilter(),amp=c.createGain(),end=t+dur,stop=end+3;lp.type='lowpass';lp.frequency.value=950;lp.Q.value=.4;lp.connect(amp);amp.connect(bus);
  amp.gain.setValueAtTime(0,t);amp.gain.linearRampToValueAtTime(.05*level,t+.9);amp.gain.setValueAtTime(.05*level,end);amp.gain.setTargetAtTime(0,end,.6);
  const oscs=[];for(const m of notes)for(const d of [-7,7]){const o=this.osc('sawtooth',mtof(m),t,stop,d,true);o.connect(lp);oscs.push(o);}
  oscs.forEach((o,k)=>this.clean(o,k?[]:[lp,amp],o.detune));
 }
 kick(t,vel,bus){
  const c=this.c,o=this.osc('sine',160,t,t+.5),a=c.createGain();o.frequency.setValueAtTime(160,t);o.frequency.exponentialRampToValueAtTime(56,t+.1);
  o.connect(a);a.connect(bus);a.gain.setValueAtTime(0,t);a.gain.linearRampToValueAtTime(.72*vel,t+.004);a.gain.setTargetAtTime(0,t+.03,.075);this.clean(o,[a]);
  this.noiseHit(t,vel*.12,'highpass',1600,.004,.008,bus);
 }
 noiseHit(t,level,type,freq,attack,tau,bus,q=.7){
  const c=this.c,n=c.createBufferSource(),f=c.createBiquadFilter(),a=c.createGain();n.buffer=this.noise;f.type=type;f.frequency.value=freq;f.Q.value=q;
  n.connect(f);f.connect(a);a.connect(bus);a.gain.setValueAtTime(0,t);a.gain.linearRampToValueAtTime(level,t+attack);a.gain.setTargetAtTime(0,t+attack,tau);
  n.start(t,Math.random()*1.5);n.stop(t+attack+tau*7+.02);this.clean(n,[f,a]);
 }
 drum(kind,t,vel,bus){
  if(kind==='snare'){this.noiseHit(t,.42*vel,'bandpass',1900,.002,.06,bus,.8);const o=this.osc('triangle',185,t,t+.3),a=this.c.createGain();o.frequency.setValueAtTime(185,t);o.frequency.exponentialRampToValueAtTime(150,t+.08);o.connect(a);a.connect(bus);a.gain.setValueAtTime(0,t);a.gain.linearRampToValueAtTime(.22*vel,t+.002);a.gain.setTargetAtTime(0,t+.002,.04);this.clean(o,[a]);}
  else if(kind==='hat')this.noiseHit(t,.14*vel,'highpass',5600,.001,.02,bus);
  else if(kind==='ohat')this.noiseHit(t,.09*vel,'highpass',5000,.002,.12,bus);
  else if(kind==='shaker')this.noiseHit(t,.07*vel,'bandpass',4600,.012,.03,bus,1.6);
  else if(kind==='brush')this.noiseHit(t,.2*vel,'bandpass',2600,.028,.09,bus,.6);
  else if(kind==='tick')this.noiseHit(t,.085*vel,'bandpass',5800,.001,.014,bus,1.1);
  else if(kind==='rim'){this.noiseHit(t,.12*vel,'bandpass',3200,.001,.008,bus,2);const o=this.osc('triangle',820,t,t+.12),a=this.c.createGain();o.connect(a);a.connect(bus);a.gain.setValueAtTime(0,t);a.gain.linearRampToValueAtTime(.12*vel,t+.001);a.gain.setTargetAtTime(0,t+.001,.016);this.clean(o,[a]);}
 }
}

// 实时播放：按小节提前调度（默认提前 1.6 秒），每次进入都会换一组种子，旋律不会完全重复。
export class GenerativeTrack{
 constructor(context,destination,track,{seed=track.seed,lookahead=1.6,interval=200,timers=globalThis,stems}={}){
  this.c=context;this.destination=destination;this.track=track;this.seed=seed>>>0;this.lookahead=lookahead;this.interval=interval;this.timers=timers;this.stems=stems;
  this.cycle=0;this.barIndex=0;this.bars=null;this.playing=false;this.scheduled=0;
 }
 get barDuration(){return 240/this.track.bpm;}
 nextBar(){if(!this.bars||this.barIndex>=this.bars.length){if(this.bars)this.cycle++;this.bars=composeCycle(this.track,this.cycle,this.seed);this.barIndex=0;}return this.bars[this.barIndex++];}
 start(at=this.c.currentTime+.05,fade=1.2){
  if(this.playing)return;this.playing=true;this.synth=new Synth(this.c,this.track,{stems:this.stems});this.synth.connect(this.destination);this.synth.start(at);
  const g=this.synth.out.gain;g.setValueAtTime(0,at);g.linearRampToValueAtTime(1,at+Math.max(.01,fade));
  this.nextTime=at;this.pump();if(this.timers?.setInterval)this.timer=this.timers.setInterval(()=>this.pump(),this.interval);
 }
 scheduleUntil(until){while(this.playing&&this.nextTime<until){const bar=this.nextBar();this.scheduleBar(bar,this.nextTime);this.nextTime+=this.barDuration;this.scheduled++;}}
 pump(){if(!this.playing)return;const now=this.c.currentTime;if(this.nextTime<now-.05)this.nextTime=now+.05;this.scheduleUntil(now+this.lookahead);}
 scheduleBar(bar,t0){
  const d=this.barDuration,swing=this.track.swing;this.synth.automate(bar,t0,d);
  for(const ev of bar.events){const t=t0+stepTime(ev.step,d,swing)+(ev.nudge||0)/1000,end=t0+stepTime(ev.step+(ev.dur||1),d,swing);this.synth.play(ev,Math.max(t,0),Math.max(.05,end-t));}
 }
 stop(fade=1.2){
  if(!this.playing)return;this.playing=false;this.timers?.clearInterval?.(this.timer);
  const synth=this.synth,t=this.c.currentTime,g=synth.out.gain;g.cancelScheduledValues(t);g.setValueAtTime(g.value,t);g.linearRampToValueAtTime(0,t+Math.max(.01,fade));
  const done=()=>synth.dispose();if(this.timers?.setTimeout)this.timers.setTimeout(done,(fade+.3)*1000);else done();
 }
}

// 离线渲染：用于试听导出和响度校准（浏览器中运行）。
export async function renderTrack(track,{seconds=60,seed=track.seed,sampleRate=44100,Offline=globalThis.OfflineAudioContext,stems}={}){
 const c=new Offline(2,Math.ceil(seconds*sampleRate),sampleRate),player=new GenerativeTrack(c,c.destination,track,{seed,timers:null,stems});
 player.start(0,.02);player.scheduleUntil(seconds);return c.startRendering();
}
