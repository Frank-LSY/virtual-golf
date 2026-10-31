// 0.21 配乐：一首主题，多种变奏。游戏大厅、高尔夫各页面、云端滚球地图与三个章节各有一段变奏，
// 离线编曲渲染成 MP3（见 scripts/soundtrack），这里按清单里的循环点无缝循环；切换页面时交叉淡入淡出，
// 再回到某个页面会从刚才的位置接着放。过关、进洞时播放短曲，同时短暂压低循环音乐。
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
export class LoopTrack{
 constructor(system,cue,bank){this.system=system;this.cue=cue;this.bank=bank;this.id=cue.id;this.playing=false;this.failed=false;this.position=cue.loopStart??0;this.onError=()=>{};}
 get length(){return (this.cue.loopEnd??0)-(this.cue.loopStart??0);}
 wrap(p){const a=this.cue.loopStart??0,L=this.length;return L>0&&p>=a+L?a+((p-a)%L):p;}
 async start(fade=1.2){
  this.playing=true;let buffer;
  try{buffer=await this.bank.get(this.cue.src);}catch{this.failed=true;this.playing=false;this.onError();return false;}
  if(!this.playing)return false;const c=this.system.context;
  this.gain=c.createGain();this.gain.gain.value=0;this.duckNode=c.createGain();this.duckNode.gain.value=1;this.gain.connect(this.duckNode);this.duckNode.connect(this.system.output('music'));
  const src=c.createBufferSource();src.buffer=buffer;src.loop=true;if(src.playbackRate)src.playbackRate.value=this.speed??1;src.loopStart=this.cue.loopStart??0;src.loopEnd=this.cue.loopEnd??buffer.duration;src.connect(this.gain);
  const t=c.currentTime+.03;src.start(t,this.wrap(this.position));this.src=src;this.startedAt=t;this.startOffset=this.wrap(this.position);
  this.gain.gain.setValueAtTime(0,t);this.gain.gain.linearRampToValueAtTime(1,t+fade);this.failed=false;return true;
 }
 now(){if(!this.src)return this.position;return this.wrap(this.startOffset+Math.max(0,this.system.context.currentTime-this.startedAt)*(this.speed??1));}
 // 0.24 多人对战加时：整体加快一点（音高随之略升），像街机的“快点！”。
 rate(r){const c=this.system.context,t=this.src?c.currentTime:0;if(this.src){this.startOffset=this.now();this.startedAt=t;this.src.playbackRate?.setTargetAtTime(r,t,.5);}this.speed=r;}
 stop(fade=1){
  if(!this.playing&&!this.src)return;this.playing=false;if(!this.src)return;
  const c=this.system.context,t=c.currentTime,g=this.gain.gain;this.position=this.wrap(this.now()+fade*.5);
  g.cancelScheduledValues(t);g.setValueAtTime(g.value,t);g.linearRampToValueAtTime(0,t+fade);
  const src=this.src,gain=this.gain,duck=this.duckNode;this.src=null;try{src.stop(t+fade+.05);}catch{}
  src.onended=()=>{try{gain.disconnect();duck.disconnect();}catch{}};
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
 constructor(system,settings,{createPlayer,manifest=loadManifest,source=waltzSource,bank}={}){
  this.system=system;this.settings=settings;this.scene='hub';this.chapter=0;this.unlocked=false;this.visible=true;this.current=null;this.failed=new Set();this.listeners=new Set();this.players=new Map();this.cues=null;
  this.bank=bank||new BufferBank(system);
  this.createPlayer=createPlayer||(id=>{
   if(id==='waltz'){this.media??=new MediaTrack(system,source);return this.media;}
   const cue=this.cues?.[id];if(!cue)return null;return new LoopTrack(system,cue,this.bank);
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
 // 循环音乐的速度（1 = 原速）。只影响 LoopTrack；切换曲目后沿用。
 setTempo(rate=1){const r=Math.max(.8,Math.min(1.25,Number(rate)||1));if(Math.abs(r-(this.tempo??1))<.002)return;this.tempo=r;this.current?.player.rate?.(r);}
 unlock(){if(this.unlocked)return;this.unlocked=true;this.system.resume();this.sync();}
 setVisible(visible){if(this.visible===!!visible)return;this.visible=!!visible;this.sync();}
 player(id){if(!this.players.has(id)){const p=this.createPlayer(id);if(!p)return null;p.onError=()=>{if(p.failed)this.failed.add(id);this.emit();};this.players.set(id,p);}return this.players.get(id);}
 sync(){
  const want=this.cues===null&&this.desired()!=='waltz'&&this.desired()!=='off'?'pending':this.desired();
  if(want!=='pending'&&want!==(this.current?.id??'off')){
   this.current?.player.stop(want==='off'?.8:1.4);this.current=null;
   if(want!=='off'){const player=this.player(want);if(player){player.rate?.(this.tempo??1);this.current={id:want,player};this.failed.delete(want);const started=player.start(want==='waltz'?1.5:1.4);if(started?.then)started.then(()=>this.emit());}else this.failed.add(want);}
  }
  this.emit();
 }
 // 短曲：过关、进洞。音乐关闭或静音时不播放；播放期间循环音乐压低到 15%。
 async sting(id){
  const s=this.settings.value,cue=this.cues?.[id];if(!cue||!this.unlocked||!this.visible||s.muted||!s.music.on||s.music.volume<=0)return false;
  let buffer;try{buffer=await this.bank.get(cue.src);}catch{return false;}
  const c=this.system.context,src=c.createBufferSource(),g=c.createGain();src.buffer=buffer;g.gain.value=.95;src.connect(g);g.connect(this.system.output('music'));src.start(c.currentTime+.02);src.onended=()=>{try{g.disconnect();}catch{}};
  this.current?.player.duck?.(.15,Math.max(1.5,(cue.duration||3)-2));return true;
 }
 // 预先下载并解码某些曲目（例如进入滚球地图时预取三个章节）。
 preload(ids){return Promise.all(ids.map(id=>this.cues?.[id]?this.bank.get(this.cues[id].src).catch(()=>null):null));}
 reshuffle(){return false;}
}
