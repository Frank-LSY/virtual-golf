// 0.21 配乐：一首主题，多种变奏。游戏大厅、高尔夫各页面、云端滚球地图与三个章节各有一段变奏，
// 离线编曲渲染成 MP3（见 scripts/soundtrack），这里按清单里的循环点无缝循环。过关、进洞时播放短曲，同时短暂压低循环音乐。
// 0.26 无缝切换：不再简单交叉淡入淡出——等旧曲走到下一个小节线，新曲的“进场”过门（渐强滚奏 / 刮奏）在这之前响起，
// 重音正好落在小节线上；新曲同时从某个乐段开头进入，旧曲在最后一拍里收暗退场。切换点之前又切回原场景时，
// 旧曲原样接着放，没有中断。回到某首曲子时从上次停下位置所在乐段的开头接上。
// 加时赛《星海加时》带一条对齐的“紧张层”，按崩塌速度推上（setIntensity），不再靠加速播放（会变调失真）。
// 所有声音共用一个 AudioContext：主输出下分“音乐 / 音效 / 环境声”三路母线，击球避让只作用于音乐母线。
import {MUSIC_CHOICES,SCENES,CHAPTER_CUES} from './sound-settings.js';

export const MUSIC_TRACK={title:'Butterfly Waltz',artist:'Brian Crain',source:'https://briancrain.bandcamp.com/track/butterfly-waltz-3'};
export const MANIFEST_URL='/screen-web/assets/music/soundtrack.json';

export class SoundSystem{
 constructor(contextFactory=()=>new AudioContext()){this.contextFactory=contextFactory;this.gains={music:0,effects:1,ambience:1};this.duck=1;}
 get context(){if(!this.c){this.c=this.contextFactory();this.build();}return this.c;}
 build(){
  const c=this.c,gain=v=>{const n=c.createGain();n.gain.value=v;return n;};
  this.master=gain(1);this.master.connect(c.destination);this.buses={};
  for(const name of ['music','effects','ambience']){this.buses[name]=gain(this.gains[name]);this.buses[name].connect(this.master);}
  this.duckGain=gain(this.duck);this.duckGain.connect(this.buses.music);
 }
 output(name){this.context;return name==='music'?this.duckGain:this.buses[name];}
 apply(gains){this.gains={...this.gains,...gains};if(!this.c)return;const t=this.c.currentTime;for(const [name,v] of Object.entries(gains))this.buses[name]?.gain.setTargetAtTime(v,t,.06);}
 setDuck(value){const v=Math.max(0,Math.min(1,value));if(Math.abs(v-this.duck)<.002)return;this.duck=v;if(this.c)this.duckGain.gain.setTargetAtTime(v,this.c.currentTime,.03);}
 resume(){try{return this.context.resume?.();}catch{return undefined;}}
}

// 解码后的音频缓存：同一首只下载、解码一次。
export class BufferBank{
 constructor(system,{fetcher=(...a)=>fetch(...a)}={}){this.system=system;this.fetcher=fetcher;this.cache=new Map();}
 get(src){
  if(!this.cache.has(src))this.cache.set(src,this.fetcher(src).then(r=>{if(!r.ok)throw Error('missing '+src);return r.arrayBuffer();}).then(data=>this.system.context.decodeAudioData(data)).catch(e=>{this.cache.delete(src);throw e;}));
  return this.cache.get(src);
 }
}

// 一段可循环的变奏：AudioBufferSourceNode 在 loopStart–loopEnd 之间循环；停止时淡出并记住位置。
// 0.26：清单里有拍数 / 每小节拍数 / 乐段起点时，这段音乐“知道自己的小节线”——可以算出下一个小节线的时刻、
// 在指定时刻从某个乐段开头进入，或在小节线上收暗退出（leave），切换点之前还能反悔（stay）。
// 叠层（layers，例如加时的“紧张层”）与主轨同时开始、逐个采样对齐，用 setIntensity 推上 / 拉下。
export class LoopTrack{
 constructor(system,cue,bank,{timers=globalThis}={}){this.system=system;this.cue=cue;this.bank=bank;this.timers=timers;this.id=cue.id;this.playing=false;this.failed=false;this.position=cue.loopStart??0;this.intensity=0;this.layers=[];this.onError=()=>{};}
 get length(){return (this.cue.loopEnd??0)-(this.cue.loopStart??0);}
 get beat(){const b=this.cue.beats;return b>0&&this.length>0?this.length/b:null;}
 get bar(){return this.beat?this.beat*(this.cue.bpb||4):null;}
 get musical(){return !!this.beat;}
 wrap(p){const a=this.cue.loopStart??0,L=this.length;return L>0&&p>=a+L?a+((p-a)%L):p;}
 // 进入点：从上次停下位置所在乐段的开头进入（乐句对齐）；从没放过就从头。
 entry(){
  const a=this.cue.loopStart??0,p=this.wrap(this.position),secs=this.cue.sections;if(!this.beat||!secs?.length||p<=a+1e-3)return Math.max(a,Math.min(p,a));
  const beat=(p-a)/this.beat;let best=0;for(const s of secs)if(s.beat<=beat+1e-6)best=s.beat;return a+best*this.beat;
 }
 prepare(){return Promise.all([this.bank.get(this.cue.src),...Object.values(this.cue.layers||{}).map(l=>this.bank.get(l.src))]);}
 async start(fade=1.2,{at=null,offset=null}={}){
  this.playing=true;const token=this.startToken=Symbol();let buffer,layerBuffers;
  try{[buffer,...layerBuffers]=await this.prepare();}catch{if(this.startToken===token){this.failed=true;this.playing=false;this.onError();}return false;}
  if(!this.playing||this.startToken!==token)return false;const c=this.system.context;
  this.gain=c.createGain();this.gain.gain.value=0;this.filter=c.createBiquadFilter?.()||null;this.duckNode=c.createGain();this.duckNode.gain.value=1;
  if(this.filter){this.filter.type='lowpass';this.filter.frequency.value=20000;this.filter.Q.value=.5;this.gain.connect(this.filter);this.filter.connect(this.duckNode);}else this.gain.connect(this.duckNode);
  this.duckNode.connect(this.system.output('music'));
  const make=(buf,dest)=>{const src=c.createBufferSource();src.buffer=buf;src.loop=true;src.loopStart=this.cue.loopStart??0;src.loopEnd=this.cue.loopEnd??buf.duration;src.connect(dest);return src;};
  const src=make(buffer,this.gain),t=Math.max(c.currentTime+.03,at??0),off=this.wrap(offset??this.position);src.start(t,off);this.src=src;this.startedAt=t;this.startOffset=off;
  this.layers=layerBuffers.map(buf=>{const g=c.createGain();g.gain.value=this.intensity;g.connect(this.gain);const s=make(buf,g);s.start(t,off);return {src:s,gain:g};});
  this.gain.gain.setValueAtTime(0,t);this.gain.gain.linearRampToValueAtTime(1,t+Math.max(.01,fade));this.failed=false;return true;
 }
 now(){return this.positionAt(this.system.context.currentTime);}
 positionAt(time){if(!this.src)return this.position;return this.wrap(this.startOffset+Math.max(0,time-this.startedAt));}
 // 下一个小节线（小节超过 2.4 秒时取半小节）的时刻，至少在 lead 秒之后。
 nextBoundary(lead=.3){
  if(!this.src||!this.beat)return null;const c=this.system.context,a=this.cue.loopStart??0,unit=this.bar>2.4&&(this.cue.bpb||4)%2===0?this.bar/2:this.bar;
  const t0=Math.max(c.currentTime,this.startedAt)+lead,rel=this.positionAt(t0)-a,k=Math.ceil(rel/unit-1e-6);return t0+(k*unit-rel);
 }
 // 在 at 时刻（小节线）退出：之前 before 秒开始收暗（低通下扫）减弱，之后 after 秒静音；记住 at 时的位置。
 leave(at,{before=.5,after=.3}={}){
  if(!this.src){this.playing=false;return;}
  const c=this.system.context,t=c.currentTime,s=Math.max(t,at-before),g=this.gain.gain,f=this.filter?.frequency;this.playing=false;this.position=this.positionAt(at);
  g.cancelScheduledValues(t);g.setValueAtTime(g.value,t);g.setValueAtTime(g.value,s);g.linearRampToValueAtTime(.5,at);g.linearRampToValueAtTime(0,at+after);
  if(f){f.cancelScheduledValues(t);f.setValueAtTime(20000,s);f.exponentialRampToValueAtTime(900,at);f.exponentialRampToValueAtTime(400,at+after);}
  const nodes={src:this.src,layers:this.layers,gain:this.gain,filter:this.filter,duck:this.duckNode,at};this.leaving=nodes;this.src=null;this.layers=[];
  this.timers.clearTimeout?.(this.leaveTimer);this.leaveTimer=this.timers.setTimeout?.(()=>this.release(nodes),Math.max(0,(at+after-t)*1000+120));
 }
 release(n){if(this.leaving===n)this.leaving=null;for(const x of [n.src,...n.layers.map(l=>l.src)])try{x.stop();}catch{}try{n.gain.disconnect();n.filter?.disconnect();n.duck.disconnect();}catch{}}
 // 切换点之前改了主意：撤销退出，接着放（同一个声源，没有任何中断）。
 stay(){
  const n=this.leaving,c=this.system.context;if(!n||c.currentTime>=n.at)return false;this.timers.clearTimeout?.(this.leaveTimer);this.leaving=null;
  const t=c.currentTime,g=n.gain.gain,f=n.filter?.frequency;g.cancelScheduledValues(t);g.setValueAtTime(g.value,t);g.linearRampToValueAtTime(1,t+.15);if(f){f.cancelScheduledValues(t);f.setValueAtTime(20000,t);}
  Object.assign(this,{src:n.src,layers:n.layers,gain:n.gain,filter:n.filter,duckNode:n.duck,playing:true});return true;
 }
 // 还没开始的预定进入：取消。
 cancel(){this.startToken=null;this.playing=false;if(!this.src)return;for(const x of [this.src,...this.layers.map(l=>l.src)])try{x.stop();}catch{}try{this.gain.disconnect();this.filter?.disconnect();this.duckNode.disconnect();}catch{}this.src=null;this.layers=[];}
 setIntensity(x){const v=Math.max(0,Math.min(1,Number(x)||0));this.intensity=v;if(!this.layers.length)return;const t=this.system.context.currentTime;for(const l of this.layers)l.gain.gain.setTargetAtTime(v,t,.6);}
 stop(fade=1){
  this.startToken=null;if(this.leaving&&!this.src){this.playing=false;return;}
  if(!this.playing&&!this.src)return;this.playing=false;if(!this.src)return;
  const c=this.system.context,t=c.currentTime,g=this.gain.gain;this.position=this.wrap(this.now()+fade*.5);
  g.cancelScheduledValues(t);g.setValueAtTime(g.value,t);g.linearRampToValueAtTime(0,t+fade);
  const src=this.src,layers=this.layers,gain=this.gain,filter=this.filter,duck=this.duckNode;this.src=null;this.layers=[];for(const x of [src,...layers.map(l=>l.src)])try{x.stop(t+fade+.05);}catch{}
  src.onended=()=>{try{gain.disconnect();filter?.disconnect();duck.disconnect();}catch{}};
 }
 // 短曲期间压低：快速降到 level，duration 秒后用 1.2 秒回到原音量。
 duck(level,duration){if(!this.duckNode)return;const c=this.system.context,t=c.currentTime,g=this.duckNode.gain;g.cancelScheduledValues(t);g.setValueAtTime(g.value,t);g.linearRampToValueAtTime(level,t+.12);g.setValueAtTime(level,t+duration);g.linearRampToValueAtTime(1,t+duration+1.2);}
}

// 旧版配乐 Butterfly Waltz（可选）：经 MediaElementSource 接入音乐母线；停止时淡出再暂停，保留播放位置。
export class MediaTrack{
 constructor(system,source,{element=new Audio(),timers=globalThis}={}){
  this.system=system;this.source=source;this.el=element;this.timers=timers;this.el.loop=true;this.el.preload='none';this.playing=false;this.failed=false;this.onError=()=>{};this.id='waltz';
  this.el.addEventListener?.('error',()=>{this.failed=true;this.onError();});
 }
 connect(){
  if(this.gain)return;const c=this.system.context;this.gain=c.createGain();this.gain.gain.value=0;this.gain.connect(this.system.output('music'));
  try{this.node=c.createMediaElementSource(this.el);this.node.connect(this.gain);}catch{this.node=null;}
 }
 async start(fade=1.5){
  this.playing=true;this.timers.clearTimeout?.(this.pauseTimer);
  try{if(!this.el.src)this.el.src=await this.source();}catch{this.failed=true;this.onError();return false;}
  if(!this.playing)return false;this.connect();const t=this.system.context.currentTime,g=this.gain.gain;g.cancelScheduledValues(t);g.setValueAtTime(g.value,t);g.linearRampToValueAtTime(1,t+fade);
  try{await this.el.play();this.failed=false;return true;}catch(e){if(e?.name!=='AbortError'){this.failed=e?.name!=='NotAllowedError';this.blocked=e?.name==='NotAllowedError';this.onError();}return false;}
 }
 stop(fade=1){
  this.playing=false;if(!this.gain){this.el.pause?.();return;}
  const t=this.system.context.currentTime,g=this.gain.gain;g.cancelScheduledValues(t);g.setValueAtTime(g.value,t);g.linearRampToValueAtTime(0,t+fade);
  this.timers.clearTimeout?.(this.pauseTimer);this.pauseTimer=this.timers.setTimeout?.(()=>{if(!this.playing)this.el.pause?.();},fade*1000+60);
 }
 duck(){}
}

const waltzSource=()=>fetch('/screen-web/assets/music/track.json').then(r=>{if(!r.ok)throw Error('missing');return r.json();}).then(t=>{if(!t.src)throw Error('missing');return t.src;});
const loadManifest=()=>fetch(MANIFEST_URL).then(r=>{if(!r.ok)throw Error('missing');return r.json();});

export class MusicDirector{
 constructor(system,settings,{createPlayer,manifest=loadManifest,source=waltzSource,bank,timers=globalThis}={}){
  this.system=system;this.settings=settings;this.scene='hub';this.chapter=0;this.unlocked=false;this.visible=true;this.current=null;this.pending=null;this.intensity=0;this.failed=new Set();this.listeners=new Set();this.players=new Map();this.cues=null;this.timers=timers;
  this.bank=bank||new BufferBank(system);
  this.createPlayer=createPlayer||(id=>{
   if(id==='waltz'){this.media??=new MediaTrack(system,source);return this.media;}
   const cue=this.cues?.[id];if(!cue)return null;return new LoopTrack(system,cue,this.bank,{timers});
  });
  this.ready=Promise.resolve(typeof manifest==='function'?manifest():manifest).then(m=>{this.cues=m?.cues||{};this.sync();}).catch(()=>{this.cues={};this.manifestFailed=true;this.sync();});
 }
 on(fn){this.listeners.add(fn);return ()=>this.listeners.delete(fn);}
 emit(){const s=this.status();for(const fn of this.listeners)fn(s);}
 get choice(){return this.settings.value.scenes[this.scene]??'auto';}
 // 场景设置 → 实际曲目：auto 用本场景的变奏；滚球关卡按章节选择。
 resolve(scene=this.scene){const choice=this.settings.value.scenes[scene]??'auto';if(choice!=='auto')return choice;const auto=SCENES[scene]?.auto;return auto==='chapter'?CHAPTER_CUES[this.chapter]||CHAPTER_CUES[0]:auto||'off';}
 desired(){const s=this.settings.value;return !this.unlocked||!this.visible||s.muted||!s.music.on||s.music.volume<=0?'off':this.resolve();}
 status(){
  const s=this.settings.value,id=this.resolve(),info=MUSIC_CHOICES[id]||MUSIC_CHOICES.off,playing=this.current?.id??null;
  const code=s.muted?'muted':!s.music.on?'paused':s.music.volume<=0?'zero':id==='off'?'scene-off':!this.unlocked?'locked':!this.visible?'hidden':this.failed.has(id)?'failed':'';
  const reason={muted:'已全部静音',paused:'音乐已暂停',zero:'音乐音量为 0',['scene-off']:'这个场景设为不播放音乐',locked:'点击页面任意位置后开始播放（浏览器要求先有一次操作）',hidden:'页面在后台，音乐已暂停',failed:`${info.title} 暂时无法播放`}[code]||'';
  return {scene:this.scene,sceneName:SCENES[this.scene]?.name||'',choice:this.choice,cue:id,title:info.title,detail:info.detail,kind:info.kind,playing,code,reason};
 }
 setScene(scene,chapter=this.chapter){if(this.scene===scene&&this.chapter===chapter)return;this.scene=scene;this.chapter=chapter;this.sync();}
 setChapter(chapter){this.setScene(this.scene,chapter);}
 // 叠层强度（0–1）：目前只有《星海加时》的紧张层；别的曲目没有叠层，忽略。
 setIntensity(x=0){const v=Math.max(0,Math.min(1,Number(x)||0));if(Math.abs(v-this.intensity)<.01)return;this.intensity=v;this.current?.player.setIntensity?.(v);}
 unlock(){if(this.unlocked)return;this.unlocked=true;this.system.resume();this.sync();}
 setVisible(visible){if(this.visible===!!visible)return;this.visible=!!visible;this.sync();}
 player(id){if(!this.players.has(id)){const p=this.createPlayer(id);if(!p)return null;p.onError=()=>{if(p.failed)this.failed.add(id);this.emit();};this.players.set(id,p);}return this.players.get(id);}
 sync(){
  const want=this.cues===null&&this.desired()!=='waltz'&&this.desired()!=='off'?'pending':this.desired();
  if(want==='pending'){this.emit();return;}
  if(this.pending){if(want===this.pending.to){this.emit();return;}this.abort();}
  if(want!==(this.current?.id??'off')){
   const from=this.current;
   if(want==='off'){from?.player.stop(.8);this.current=null;this.emit();return;}
   const player=this.player(want);if(!player){from?.player.stop(1.4);this.current=null;this.failed.add(want);this.emit();return;}
   player.setIntensity?.(this.intensity);this.failed.delete(want);
   if(from&&this.musical(from.player,player))this.transition(from,want,player);
   else{from?.player.stop(1.4);this.current={id:want,player};const started=player.start(want==='waltz'?1.5:1.4);if(started?.then)started.then(()=>this.emit());}
  }
  this.emit();
 }
 // 两首都是“知道小节线”的循环、旧曲正在放：可以做小节线上的无缝切换；否则退回淡入淡出。
 musical(a,b){return !!(a?.musical&&b?.musical&&a.src&&a.nextBoundary&&b.leave&&this.unlocked&&this.visible);}
 lead(id){const l=this.cues?.[id]?.lead;return l?.src?this.bank.get(l.src).then(buffer=>({buffer,pickup:Number(l.pickup)||0})).catch(()=>null):Promise.resolve(null);}
 async transition(from,id,player){
  const token=Symbol(),p={from,to:id,player,token,at:null,lead:null};this.pending=p;this.current={id,player};
  let lead=null;try{[,lead]=await Promise.all([player.prepare(),this.lead(id)]);}catch{}
  if(this.pending!==p)return;
  const c=this.system.context,now=c.currentTime,pickup=lead?.pickup||0,at=from.player.nextBoundary(Math.max(.25,Math.min(1.8,pickup+.05)));
  if(at===null){this.pending=null;from.player.stop(1.2);const started=player.start(1.2);if(started?.then)started.then(()=>this.emit());this.emit();return;}
  if(lead){const src=c.createBufferSource(),g=c.createGain();src.buffer=lead.buffer;g.gain.value=.9;src.connect(g);g.connect(this.system.output('music'));const when=Math.max(now+.02,at-pickup);src.start(when,Math.max(0,when-(at-pickup)));src.onended=()=>{try{g.disconnect();}catch{}};p.lead=src;}
  from.player.leave(at,{before:Math.min(from.player.beat||.5,Math.max(.25,pickup)),after:.3});
  p.at=at;const started=player.start(.06,{at,offset:player.entry()});if(started?.then)started.then(()=>this.emit());
  this.timers.setTimeout?.(()=>{if(this.pending===p)this.pending=null;},Math.max(0,(at-now)*1000+60));this.emit();
 }
 // 切换点之前改了主意：取消新曲的预定进入和过门，旧曲撤销退场接着放。
 abort(){
  const p=this.pending;if(!p)return;this.pending=null;const c=this.system.context;
  if(p.at===null){this.current=p.from;p.player.cancel?.();return;}
  if(c.currentTime>=p.at)return;
  p.player.cancel?.();try{p.lead?.stop();}catch{}
  if(p.from.player.stay?.())this.current=p.from;else{this.current=p.from;p.from.player.start(.4);}
 }
 // 短曲：过关、进洞。音乐关闭或静音时不播放；播放期间循环音乐压低到 15%。
 async sting(id){
  const s=this.settings.value,cue=this.cues?.[id];if(!cue||!this.unlocked||!this.visible||s.muted||!s.music.on||s.music.volume<=0)return false;
  let buffer;try{buffer=await this.bank.get(cue.src);}catch{return false;}
  const c=this.system.context,src=c.createBufferSource(),g=c.createGain();src.buffer=buffer;g.gain.value=.95;src.connect(g);g.connect(this.system.output('music'));src.start(c.currentTime+.02);src.onended=()=>{try{g.disconnect();}catch{}};
  for(const p of new Set([this.current?.player,this.pending?.from?.player]))p?.duck?.(.15,Math.max(1.5,(cue.duration||3)-2));return true;
 }
 // 预先下载并解码某些曲目（例如进入滚球地图时预取三个章节）。
 preload(ids){return Promise.all(ids.flatMap(id=>{const c=this.cues?.[id];if(!c)return [];return [c.src,c.lead?.src,...Object.values(c.layers||{}).map(l=>l.src)].filter(Boolean).map(src=>this.bank.get(src).catch(()=>null));}));}
 reshuffle(){return false;}
}
