import test from 'node:test';
import assert from 'node:assert/strict';
import {SoundSystem,MediaTrack,MusicDirector} from '../screen-web/music.js';
import {ShotAudioMix} from '../screen-web/audio-mix.js';
import {CourseAmbience,ambienceLevels,birdPhrase} from '../screen-web/soundscape.js';
import {SoundSettings,loadSound,normalizeSound,soundGains,audible,DEFAULT_SOUND,SOUND_KEY,MUSIC_CHOICES} from '../screen-web/sound-settings.js';
import {TRACKS,CHORDS,composeCycle,stepTime,GenerativeTrack,rng} from '../screen-web/lofi-music.js';

const memoryStorage=(init={})=>{const memory=new Map(Object.entries(init));return {memory,getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v))};};
const advance=(mix,start,end)=>{for(let t=start;t<=end;t+=50)mix.update(t,.05);};

test('音乐避让快速降低、连续碰撞不叠乘，在球停稳前保持低音量，再平滑恢复',()=>{
 const mix=new ShotAudioMix();mix.begin('round',0,10000);advance(mix,0,200);assert.ok(mix.gain<.33&&mix.gain>=.3);
 mix.impact('round','tree',250);advance(mix,250,800);assert.ok(Math.abs(mix.gain-.18)<.001);mix.impact('round','tree',850);advance(mix,850,1500);assert.ok(Math.abs(mix.gain-.18)<.001);
 mix.impact('round','cup',1550);advance(mix,1550,2100);assert.ok(Math.abs(mix.gain-.13)<.001);advance(mix,2150,4000);assert.ok(mix.gain<.131);
 mix.settle('round');mix.update(4050,.05);assert.ok(mix.gain>.13&&mix.gain<.25);advance(mix,4100,7000);assert.ok(mix.gain>.98);
});
test('正式球局和练习场独立释放，切换页面与缺失停球回调不会永久压低音乐',()=>{
 const mix=new ShotAudioMix();mix.begin('round',0,5000);mix.begin('practice',0,2000);mix.impact('practice','cup',0);mix.settle('round');advance(mix,0,500);assert.ok(mix.gain<.14);advance(mix,550,5000);assert.ok(mix.gain>.98);
 mix.begin('round',5100,10000);advance(mix,5100,5500);mix.clear();advance(mix,5550,9000);assert.ok(mix.gain>.99);
 mix.impact('round','tree',9100);advance(mix,9100,9500);assert.ok(mix.gain<.19);advance(mix,9550,13000);assert.ok(mix.gain>.98);
});
test('风声随风力变化且击球时减弱，鸟鸣短句的频率和间隔有界',()=>{
 assert.ok(ambienceLevels(7).wind>ambienceLevels(0).wind);assert.ok(ambienceLevels(7,.18).wind<ambienceLevels(7).wind*.4);assert.equal(ambienceLevels(-20).wind,ambienceLevels(0).wind);
 for(const n of [0,.5,.99999]){const p=birdPhrase(()=>n);assert.ok(p.notes.length>=2&&p.notes.length<=4);assert.ok(p.next>=6&&p.next<=14);assert.ok(Math.abs(p.pan)<=.7);for(const note of p.notes){assert.ok(note.duration>=.1&&note.duration<=.21);assert.ok(note.start>1500&&note.peak<5000);assert.ok(note.end<note.peak);}}
});

// 足够完整的假 AudioContext：记录节点数量、连接与参数自动化，供合成器、母线与环境声测试使用。
function fakeContext(){
 const param=v=>({value:v,events:[],setValueAtTime(x,t){this.value=x;this.events.push(['set',x,t]);},linearRampToValueAtTime(x,t){this.value=x;this.events.push(['lin',x,t]);},exponentialRampToValueAtTime(x,t){this.value=x;this.events.push(['exp',x,t]);},setTargetAtTime(x,t){this.value=x;this.events.push(['target',x,t]);},cancelScheduledValues(){}});
 const c={currentTime:0,sampleRate:400,destination:{kind:'destination'},nodes:[],resumed:0,resume(){this.resumed++;return Promise.resolve();},
  createBuffer(ch,length){const data=Array.from({length:ch},()=>new Float32Array(length));return {length,getChannelData:i=>data[i]};},
  createPeriodicWave(){return {};},
  advance(t){this.currentTime+=t;for(const n of this.nodes)if(n.end!==undefined&&n.end<=this.currentTime&&!n.ended){n.ended=true;n.onended?.();}}};
 const node=kind=>()=>{const n={kind,gain:param(1),frequency:param(440),detune:param(0),Q:param(1),pan:param(0),threshold:param(0),knee:param(0),ratio:param(1),attack:param(0),release:param(0),outputs:new Set(),
  connect(target){this.outputs.add(target);return target;},disconnect(target){if(target)this.outputs.delete(target);else{this.outputs.clear();this.disconnected=true;}},start(t=0){this.started=t;},stop(t=c.currentTime){this.end=t;},setPeriodicWave(){}};c.nodes.push(n);return n;};
 for(const [name,kind] of [['createGain','gain'],['createOscillator','osc'],['createBufferSource','source'],['createBiquadFilter','filter'],['createStereoPanner','pan'],['createDynamicsCompressor','comp'],['createWaveShaper','shaper'],['createConvolver','convolver'],['createMediaElementSource','media']])c[name]=node(kind);
 return c;
}

test('环境声音只初始化一次，关闭音效或隐藏页面会停掉鸟鸣并释放节点，并接入环境声母线',()=>{
 const c=fakeContext(),bus={kind:'ambience-bus'},a=new CourseAmbience(()=>c,{random:()=>.5,output:()=>bus});a.unlock();const wind=a.windSource;a.unlock();assert.equal(a.windSource,wind);assert.ok(a.windGain.outputs.has(bus));a.setWeather(5);c.advance(5);a.update(1);assert.ok(a.voices.size>0);const count=a.voices.size;a.update(1);assert.equal(a.voices.size,count);
 assert.ok([...a.voices].every(v=>v.pan.outputs.has(bus)));
 a.setEnabled(false);c.advance(.2);assert.equal(a.voices.size,0);assert.equal(a.windGain.gain.value,0);c.advance(20);a.update();assert.equal(a.voices.size,0);
 a.setEnabled(true);a.update(1);assert.ok(a.voices.size>0);a.setVisible(false);c.advance(.2);assert.equal(a.voices.size,0);a.dispose();assert.ok(wind.disconnected);
});

test('声音偏好：默认值、旧版设置迁移、非法值修正与持久化',()=>{
 assert.deepEqual(loadSound(memoryStorage()),normalizeSound(DEFAULT_SOUND));
 const old=loadSound(memoryStorage({'swinglink-music':'off','swinglink-music-volume':'0.25','swinglink-sound':'off'}));
 assert.equal(old.music.on,false);assert.equal(old.music.volume,.5);assert.equal(old.effects.on,false);assert.equal(old.ambience.on,false);
 const fixed=normalizeSound({music:{volume:7},effects:{volume:-1,on:'yes'},scenes:{lobby:'nope',game:'off'}});
 assert.equal(fixed.music.volume,1);assert.equal(fixed.effects.volume,0);assert.equal(fixed.effects.on,true);assert.equal(fixed.scenes.lobby,'sunny');assert.equal(fixed.scenes.game,'off');assert.equal(fixed.scenes.lab,'practice');
 const storage=memoryStorage(),settings=new SoundSettings(storage);let seen=null;settings.on(v=>seen=v);
 settings.update({music:{volume:.8},scenes:{game:'sunny'}});assert.equal(seen.music.volume,.8);assert.equal(seen.music.on,true);assert.equal(seen.scenes.lab,'practice');
 assert.equal(JSON.parse(storage.memory.get(SOUND_KEY)).scenes.game,'sunny');assert.equal(new SoundSettings(storage).value.music.volume,.8);
 assert.equal(loadSound(memoryStorage({[SOUND_KEY]:'{broken'})).music.volume,DEFAULT_SOUND.music.volume);
});
test('三路音量使用平方听感曲线，总静音和单路关闭都归零',()=>{
 const g=soundGains(normalizeSound({music:{volume:.5},effects:{volume:1},ambience:{volume:.2,on:false}}));
 assert.equal(g.music,.25);assert.equal(g.effects,1);assert.equal(g.ambience,0);
 assert.deepEqual(soundGains(normalizeSound({muted:true})),{music:0,effects:0,ambience:0});
 assert.equal(audible(normalizeSound({effects:{volume:0}}),'effects'),false);assert.equal(audible(normalizeSound({}),'ambience'),true);
});
test('声音母线：先存增益再建图，避让只作用于音乐母线',()=>{
 const c=fakeContext(),sys=new SoundSystem(()=>c);sys.apply({music:.25,effects:.5,ambience:0});sys.setDuck(.3);
 const music=sys.output('music');assert.equal(sys.buses.music.gain.value,.25);assert.equal(sys.buses.effects.gain.value,.5);assert.equal(sys.buses.ambience.gain.value,0);assert.equal(music.gain.value,.3);
 assert.ok(music.outputs.has(sys.buses.music));assert.ok(sys.buses.effects.outputs.has(sys.master));assert.ok(sys.master.outputs.has(c.destination));
 sys.setDuck(1);assert.equal(music.gain.value,1);sys.apply({effects:.1});assert.equal(sys.buses.effects.gain.value,.1);assert.equal(sys.buses.music.gain.value,.25);
});

function director({settings=new SoundSettings(memoryStorage())}={}){
 const log=[],players=[];
 const d=new MusicDirector({resume(){log.push('resume');}},settings,{random:()=>.5,createPlayer:(id,seed)=>{const p={id,seed,started:0,stopped:0,start(){this.started++;log.push('start '+id);},stop(){this.stopped++;log.push('stop '+id);}};players.push(p);return p;}});
 return {d,log,players,settings};
}
test('场景配乐：首次操作前不播放，大厅 / 练习室 / 正式球局各用自己的配乐并交叉切换',()=>{
 const {d,log,players}=director();
 assert.equal(d.status().code,'locked');assert.equal(d.current,null);
 d.unlock();assert.deepEqual(log,['resume','start sunny']);assert.equal(d.status().playing,'sunny');assert.equal(d.status().code,'');
 d.setScene('lab');assert.deepEqual(log.slice(2),['stop sunny','start practice']);
 d.setScene('game');assert.equal(d.status().playing,'waltz');assert.equal(d.status().title,'Butterfly Waltz');
 d.setScene('game');assert.equal(players.length,3);
 d.setScene('lobby');assert.equal(players.at(-1).id,'sunny');assert.notEqual(players.at(-1),players[0]);
});
test('静音、关闭音乐、场景设为不播放、页面隐藏都会停下，恢复后继续',()=>{
 const {d,players,settings}=director();d.unlock();settings.on(()=>d.sync());
 settings.update({muted:true});assert.equal(d.current,null);assert.equal(players[0].stopped,1);assert.equal(d.status().code,'muted');
 settings.update({muted:false});assert.equal(d.current.id,'sunny');
 settings.update({music:{on:false}});assert.equal(d.current,null);assert.equal(d.status().code,'paused');
 settings.update({music:{on:true,volume:0}});assert.equal(d.status().code,'zero');assert.equal(d.current,null);
 settings.update({music:{volume:.4},scenes:{lobby:'off'}});assert.equal(d.current,null);assert.equal(d.status().code,'scene-off');
 settings.update({scenes:{lobby:'practice'}});assert.equal(d.current.id,'practice');
 d.setVisible(false);assert.equal(d.current,null);assert.equal(d.status().code,'hidden');d.setVisible(true);assert.equal(d.current.id,'practice');
});
test('换一段旋律只对原创生成音乐有效，并换用新的种子',()=>{
 const {d,players,settings}=director();d.unlock();const first=players[0];
 assert.equal(d.reshuffle(),true);assert.equal(first.stopped,1);assert.equal(players[1].id,'sunny');
 settings.update({scenes:{lobby:'waltz'}});d.sync();assert.equal(d.current.id,'waltz');assert.equal(d.reshuffle(),false);
 assert.equal(d.status().kind,'file');assert.equal(MUSIC_CHOICES.sunny.kind,'generative');
});

test('Butterfly Waltz：经音乐母线循环播放，被浏览器拦截不算损坏，淡出后暂停并保留进度',async()=>{
 const c=fakeContext(),sys=new SoundSystem(()=>c),timers=[];
 const el={paused:true,loop:false,src:'',events:{},addEventListener(k,f){this.events[k]=f;},pause(){this.paused=true;},async play(){if(this.blocked)throw Object.assign(Error(),{name:'NotAllowedError'});this.paused=false;}};
 const track=new MediaTrack(sys,async()=>'/screen-web/assets/music/butterfly-waltz.mp3',{element:el,timers:{setTimeout:(f,ms)=>timers.push([f,ms]),clearTimeout(){}}});
 assert.equal(el.loop,true);el.blocked=true;assert.equal(await track.start(),false);assert.equal(track.failed,false);assert.equal(track.blocked,true);
 el.blocked=false;assert.equal(await track.start(),true);assert.equal(el.paused,false);assert.equal(el.src,'/screen-web/assets/music/butterfly-waltz.mp3');assert.ok(track.gain.outputs.has(sys.output('music')));assert.ok(track.node.outputs.has(track.gain));
 track.stop(1);assert.equal(el.paused,false);timers.at(-1)[0]();assert.equal(el.paused,true);
 await track.start();timers.length=0;track.stop(1);await track.start();for(const [f] of timers)f();assert.equal(el.paused,false,'快速切回不会被延迟暂停打断');
 el.events.error();assert.equal(track.failed,true);
});

test('作曲器：同一种子结果相同，不同种子与不同循环会变化；前奏只在第一轮出现',()=>{
 for(const track of Object.values(TRACKS)){
  const a=composeCycle(track,0,123),b=composeCycle(track,0,123),c=composeCycle(track,0,124),next=composeCycle(track,1,123);
  assert.deepEqual(a,b);assert.notDeepEqual(a.map(x=>x.events),c.map(x=>x.events));assert.notDeepEqual(next.map(x=>x.events),a.slice(4).map(x=>x.events));
  assert.equal(a[0].section,'intro');assert.notEqual(next[0].section,'intro');
  assert.equal(a.length,track.form.reduce((n,s)=>n+s.bars,0));assert.equal(next.length,a.length-track.form[0].bars);
  const seconds=a.length*240/track.bpm;assert.ok(seconds>90&&seconds<160,`${track.id} 一轮 ${seconds.toFixed(0)} 秒`);
 }
});
test('作曲器：旋律在音域内、只用当前和弦的音阶，强拍落在和弦音上；所有事件都在小节内',()=>{
 for(const track of Object.values(TRACKS))for(const seed of [1,2,3,99]){
  const bars=composeCycle(track,0,seed);let lead=0,strong=0,strongTone=0;
  for(const bar of bars){
   const chord=CHORDS[bar.chord];assert.ok(chord,bar.chord);
   for(const e of bar.events){
    assert.ok(e.step>=0&&e.step<16,`${e.inst} step ${e.step}`);assert.ok(e.vel>0&&e.vel<=1.2,`${e.inst} vel ${e.vel}`);
    if(e.bus!=='lead')continue;lead++;
    assert.ok(e.midi>=track.lead.range[0]&&e.midi<=track.lead.range[1]);assert.ok(chord.scale.includes(e.midi%12),`${bar.chord} ${e.midi}`);
    if(e.step%8===0){strong++;if(chord.tones.includes(e.midi%12))strongTone++;}
   }
   if(bar.spec.drums&&bar.spec.drums!=='light'&&bar.spec.drums!=='tick')assert.ok(bar.events.some(e=>e.inst==='kick'));
   if(bar.spec.bass)assert.ok(bar.events.some(e=>e.inst==='bass'&&e.step===0));
  }
  assert.ok(lead>20,`${track.id} 旋律音符 ${lead}`);assert.ok(strongTone/strong>.8,`${track.id} 强拍和弦音比例 ${(strongTone/strong).toFixed(2)}`);
 }
});
test('摇摆节奏：后半个十六分音符推迟，小节总长不变',()=>{
 assert.equal(stepTime(0,2,.58),0);assert.equal(stepTime(2,2,.58),.25);assert.equal(stepTime(16,2,.58),2);assert.ok(Math.abs(stepTime(1,2,.58)-.145)<1e-9);assert.ok(Math.abs(stepTime(1,2,.5)-.125)<1e-9);
 const r=rng(5),s=rng(5);assert.equal(r(),s());
});
test('实时合成：按提前量调度小节、淡入淡出，停止后不再调度并释放音色节点',()=>{
 const c=fakeContext(),out={kind:'music-bus'},timers={interval:null,setInterval(f){this.interval=f;return 1;},clearInterval(){this.interval=null;},setTimeout(f){this.later=f;}};
 const player=new GenerativeTrack(c,out,TRACKS.sunny,{seed:7,timers,lookahead:1.6});player.start(0,1.2);
 assert.equal(player.scheduled,1);assert.ok(player.synth.out.outputs.has(out));assert.deepEqual(player.synth.out.gain.events.slice(0,2),[['set',0,0],['lin',1,1.2]]);
 c.advance(2);timers.interval();assert.equal(player.scheduled,2);const nodes=c.nodes.length;
 c.advance(30);timers.interval();assert.equal(player.scheduled,3,'落后时重新对齐，而不是一次补排很多小节');assert.ok(player.nextTime>c.currentTime);assert.ok(c.nodes.length>nodes);
 for(let i=0;i<20;i++){c.advance(.2);timers.interval();}assert.ok(player.scheduled>=4&&player.scheduled<=5);
 const sources=c.nodes.filter(n=>n.kind==='osc'||n.kind==='source');assert.ok(sources.filter(n=>n.ended).every(n=>n.disconnected),'结束的声源都已断开');
 player.stop(1);assert.equal(timers.interval,null);const count=player.scheduled;player.pump();assert.equal(player.scheduled,count);
 assert.equal(player.synth.out.gain.events.at(-1)[1],0);timers.later();assert.equal(player.synth.out.disconnected,true);
});
