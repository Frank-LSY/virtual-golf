// 分场景背景音乐：大厅、练习室、正式球局各自配乐，切换页面时交叉淡入淡出。
// 所有声音共用一个 AudioContext：主输出下分“音乐 / 击球音效 / 环境声”三路母线，击球避让只作用于音乐母线。
import {GenerativeTrack,TRACKS} from './lofi-music.js';
import {MUSIC_CHOICES} from './sound-settings.js';

export const MUSIC_TRACK={title:'Butterfly Waltz',artist:'Brian Crain',source:'https://briancrain.bandcamp.com/track/butterfly-waltz-3'};

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

// 音频文件配乐（Butterfly Waltz）：经 MediaElementSource 接入音乐母线；停止时淡出后暂停，再次进入从原位置继续。
export class MediaTrack{
 constructor(system,source,{element=new Audio(),timers=globalThis}={}){
  this.system=system;this.source=source;this.el=element;this.timers=timers;this.el.loop=true;this.el.preload='none';this.playing=false;this.failed=false;this.onError=()=>{};
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
}

const trackSource=()=>fetch('/screen-web/assets/music/track.json').then(r=>{if(!r.ok)throw Error('missing');return r.json();}).then(t=>{if(!t.src)throw Error('missing');return t.src;});

export class MusicDirector{
 constructor(system,settings,{createPlayer,random=Math.random,source=trackSource}={}){
  this.system=system;this.settings=settings;this.random=random;this.scene='lobby';this.unlocked=false;this.visible=true;this.current=null;this.failed=new Set();this.listeners=new Set();
  this.createPlayer=createPlayer||((id,seed)=>{
   if(id==='waltz'){this.media??=new MediaTrack(system,source);this.media.onError=()=>{if(this.media.failed)this.failed.add('waltz');this.emit();};return this.media;}
   return new GenerativeTrack(system.context,system.output('music'),TRACKS[id],{seed});
  });
 }
 on(fn){this.listeners.add(fn);return ()=>this.listeners.delete(fn);}
 emit(){const s=this.status();for(const fn of this.listeners)fn(s);}
 get choice(){return this.settings.value.scenes[this.scene];}
 desired(){const s=this.settings.value;return !this.unlocked||!this.visible||s.muted||!s.music.on||s.music.volume<=0?'off':this.choice;}
 status(){
  const s=this.settings.value,choice=this.choice,info=MUSIC_CHOICES[choice],playing=this.current?.id??null;
  const code=s.muted?'muted':!s.music.on?'paused':s.music.volume<=0?'zero':choice==='off'?'scene-off':!this.unlocked?'locked':!this.visible?'hidden':this.failed.has(choice)?'failed':'';
  const reason={muted:'已全部静音',paused:'音乐已暂停',zero:'音乐音量为 0',['scene-off']:'这个场景设为不播放音乐',locked:'点击页面任意位置后开始播放（浏览器要求先有一次操作）',hidden:'页面在后台，音乐已暂停',failed:`${info.title} 暂时无法播放，可在下方换成原创配乐`}[code]||'';
  return {scene:this.scene,choice,title:info.title,detail:info.detail,kind:info.kind,playing,code,reason};
 }
 setScene(scene){if(this.scene===scene)return;this.scene=scene;this.sync();}
 unlock(){if(this.unlocked)return;this.unlocked=true;this.system.resume();this.sync();}
 setVisible(visible){if(this.visible===!!visible)return;this.visible=!!visible;this.sync();}
 sync(){
  const want=this.desired();
  if(want!==(this.current?.id??'off')){
   this.current?.player.stop(want==='off'?.8:1.4);this.current=null;
   if(want!=='off'){const player=this.createPlayer(want,this.seed(want));this.current={id:want,player};this.failed.delete(want);const started=player.start(want==='waltz'?1.5:1.2);if(started?.then)started.then(()=>this.emit());}
  }
  this.emit();
 }
 seed(id){return ((TRACKS[id]?.seed??1)+Math.floor(this.random()*1e6))>>>0;}
 // 生成音乐换一组种子：新的旋律与伴奏变化，2 秒交叉淡入。
 reshuffle(){
  const id=this.current?.id;if(!id||MUSIC_CHOICES[id].kind!=='generative')return false;
  this.current.player.stop(2);const player=this.createPlayer(id,this.seed(id));this.current={id,player};player.start(2);this.emit();return true;
 }
}
