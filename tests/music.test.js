import test from 'node:test';
import assert from 'node:assert/strict';
import {SoundSystem,MediaTrack,MusicDirector,LoopTrack,BufferBank} from '../screen-web/music.js';
import {ShotAudioMix} from '../screen-web/audio-mix.js';
import {CourseAmbience,ambienceLevels,birdPhrase} from '../screen-web/soundscape.js';
import {SoundSettings,loadSound,normalizeSound,soundGains,audible,DEFAULT_SOUND,SOUND_KEY,MUSIC_CHOICES,SCENES,CHAPTER_CUES} from '../screen-web/sound-settings.js';
import {readFile,stat} from 'node:fs/promises';

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

test('声音偏好：默认值、旧版设置迁移（0.19 场景与更早的开关）、非法值修正与持久化',()=>{
 assert.deepEqual(loadSound(memoryStorage()),normalizeSound(DEFAULT_SOUND));assert.ok(Object.values(DEFAULT_SOUND.scenes).every(v=>v==='auto'));
 const old=loadSound(memoryStorage({'swinglink-music':'off','swinglink-music-volume':'0.25','swinglink-sound':'off'}));
 assert.equal(old.music.on,false);assert.equal(old.music.volume,.5);assert.equal(old.effects.on,false);assert.equal(old.ambience.on,false);
 // 0.19–0.20：大厅 / 练习室 / 球局三个场景；曲目换成新的主题变奏，只保留“不播放”
 const v19=loadSound(memoryStorage({[SOUND_KEY]:JSON.stringify({music:{on:true,volume:.7},scenes:{lobby:'sunny',lab:'off',game:'waltz'}})}));
 assert.equal(v19.music.volume,.7);assert.equal(v19.scenes['golf-lobby'],'auto');assert.equal(v19.scenes['golf-practice'],'off');assert.equal(v19.scenes['golf-round'],'auto');assert.equal(v19.scenes.hub,'auto');assert.equal(v19.version,2);
 const fixed=normalizeSound({version:2,music:{volume:7},effects:{volume:-1,on:'yes'},scenes:{hub:'nope','golf-round':'waltz','sky-play':'sky-harbor'}});
 assert.equal(fixed.music.volume,1);assert.equal(fixed.effects.volume,0);assert.equal(fixed.effects.on,true);assert.equal(fixed.scenes.hub,'auto');assert.equal(fixed.scenes['golf-round'],'waltz');assert.equal(fixed.scenes['sky-play'],'sky-harbor');
 const storage=memoryStorage(),settings=new SoundSettings(storage);let seen=null;settings.on(v=>seen=v);
 settings.update({music:{volume:.8},scenes:{'golf-round':'off'}});assert.equal(seen.music.volume,.8);assert.equal(seen.music.on,true);assert.equal(seen.scenes.hub,'auto');
 assert.equal(JSON.parse(storage.memory.get(SOUND_KEY)).scenes['golf-round'],'off');assert.equal(new SoundSettings(storage).value.music.volume,.8);assert.equal(new SoundSettings(storage).value.scenes['golf-round'],'off');
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

const MANIFEST={cues:Object.fromEntries(['hub','golf-lobby','golf-practice','golf-round','sky-map','sky-isles','sky-harbor','sky-aurora','sting-win','sting-hole'].map(id=>[id,{id,src:`/m/${id}.mp3`,loopStart:.5,loopEnd:40.5,duration:41}]))};
async function director({settings=new SoundSettings(memoryStorage()),manifest=MANIFEST}={}){
 const log=[],players=[];
 const d=new MusicDirector({resume(){log.push('resume');}},settings,{manifest,createPlayer:id=>{const p={id,started:0,stopped:0,ducked:[],start(){this.started++;log.push('start '+id);},stop(){this.stopped++;log.push('stop '+id);},duck(l,t){this.ducked.push([l,t]);}};players.push(p);return p;}});
 await d.ready;return {d,log,players,settings};
}
test('场景配乐：首次操作前不播放；大厅、高尔夫三页、滚球地图与三章各用自己的变奏，切换时交叉、回来复用',async()=>{
 const {d,log,players}=await director();
 assert.equal(d.status().code,'locked');assert.equal(d.current,null);assert.equal(d.status().title,'云上序曲');
 d.unlock();assert.deepEqual(log,['resume','start hub']);assert.equal(d.status().playing,'hub');assert.equal(d.status().code,'');
 d.setScene('golf-lobby');assert.deepEqual(log.slice(2),['stop hub','start golf-lobby']);assert.equal(d.status().sceneName,'高尔夫 · 球场');
 d.setScene('golf-practice');assert.equal(d.status().playing,'golf-practice');d.setScene('golf-round');assert.equal(d.status().title,'果岭圆舞曲');
 d.setScene('sky-map');assert.equal(d.status().playing,'sky-map');
 for(const [ch,id] of CHAPTER_CUES.entries()){d.setScene('sky-play',ch);assert.equal(d.status().playing,id);}
 d.setChapter(0);assert.equal(d.status().playing,'sky-isles');
 const count=players.length;d.setScene('hub');assert.equal(players.length,count,'同一首曲子复用同一个播放器（记住播放位置）');assert.equal(players.find(p=>p.id==='hub').started,2);
});
test('静音、关闭音乐、场景设为不播放、页面隐藏都会停下，恢复后继续；也可以指定变奏或旧版 Butterfly Waltz',async()=>{
 const {d,players,settings}=await director();d.unlock();settings.on(()=>d.sync());
 settings.update({muted:true});assert.equal(d.current,null);assert.equal(players[0].stopped,1);assert.equal(d.status().code,'muted');
 settings.update({muted:false});assert.equal(d.current.id,'hub');
 settings.update({music:{on:false}});assert.equal(d.current,null);assert.equal(d.status().code,'paused');
 settings.update({music:{on:true,volume:0}});assert.equal(d.status().code,'zero');assert.equal(d.current,null);
 settings.update({music:{volume:.4},scenes:{hub:'off'}});assert.equal(d.current,null);assert.equal(d.status().code,'scene-off');
 settings.update({scenes:{hub:'sky-aurora'}});assert.equal(d.current.id,'sky-aurora');
 d.setVisible(false);assert.equal(d.current,null);assert.equal(d.status().code,'hidden');d.setVisible(true);assert.equal(d.current.id,'sky-aurora');
 settings.update({scenes:{hub:'waltz'}});assert.equal(d.current.id,'waltz');assert.equal(d.status().kind,'file');assert.equal(d.reshuffle(),false);
});
test('清单加载前不会乱放；清单缺失时标记为无法播放而不是报错',async()=>{
 let release;const pending=new Promise(r=>release=r);const log=[];const settings=new SoundSettings(memoryStorage());
 const d=new MusicDirector({resume(){}},settings,{manifest:()=>pending,createPlayer:id=>({id,start(){log.push(id);},stop(){}})});d.unlock();assert.equal(d.current,null);
 release(MANIFEST);await d.ready;assert.deepEqual(log,['hub']);
 const e=new MusicDirector({resume(){}},new SoundSettings(memoryStorage()),{manifest:()=>Promise.reject(Error('404'))});await e.ready;e.unlock();assert.equal(e.current,null);assert.equal(e.status().code,'failed');
});
test('无缝循环：按清单循环点播放、淡入；停下时淡出并记住位置，回来从原处接着放；短曲期间压低循环',async()=>{
 const c=fakeContext(),sys=new SoundSystem(()=>c),buffer={duration:41};const bank={get:async()=>buffer};
 const track=new LoopTrack(sys,{id:'hub',src:'x',loopStart:.5,loopEnd:40.5},bank);
 assert.equal(await track.start(1.2),true);const src=track.src;assert.equal(src.loop,true);assert.equal(src.loopStart,.5);assert.equal(src.loopEnd,40.5);assert.equal(src.started,.03);assert.ok(track.duckNode.outputs.has(sys.output('music')));assert.deepEqual(track.gain.gain.events.slice(-2),[['set',0,.03],['lin',1,1.23]]);
 c.advance(55);track.stop(1);assert.equal(src.end,56.05);assert.ok(Math.abs(track.position-(.5+((55-.03+.5)%40)))<1e-6,'位置按循环长度折回');
 const pos=track.position;await track.start();assert.ok(Math.abs(track.startOffset-pos)<1e-9);
 track.duck(.15,3);assert.deepEqual(track.duckNode.gain.events.map(e=>e[0]),['set','lin','set','lin']);assert.equal(track.duckNode.gain.events[1][1],.15);
 const stopped=new LoopTrack(sys,{id:'x',src:'y',loopStart:0,loopEnd:10},{get:()=>new Promise(r=>setTimeout(()=>r(buffer),5))});const p=stopped.start();stopped.stop();assert.equal(await p,false,'还在下载时就离开，不会再开始播放');
 const failing=new LoopTrack(sys,{id:'z',src:'z'},{get:async()=>{throw Error('missing');}});let errors=0;failing.onError=()=>errors++;assert.equal(await failing.start(),false);assert.equal(failing.failed,true);assert.equal(errors,1);
});
test('短曲：只在音乐可听时播放，并让当前循环让路',async()=>{
 const c=fakeContext();c.decodeAudioData=async()=>({duration:5});const sys=new SoundSystem(()=>c),settings=new SoundSettings(memoryStorage());
 const bank=new BufferBank(sys,{fetcher:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)})});const ducks=[];
 const d=new MusicDirector(sys,settings,{manifest:MANIFEST,bank,createPlayer:id=>({id,start(){},stop(){},duck:(l,t)=>ducks.push([l,t])})});await d.ready;
 assert.equal(await d.sting('sting-win'),false,'首次操作前不播放');d.unlock();assert.equal(await d.sting('sting-win'),true);assert.equal(ducks[0][0],.15);
 settings.update({muted:true});assert.equal(await d.sting('sting-hole'),false);settings.update({muted:false});assert.equal(await d.sting('nope'),false);
});
test('配乐清单：十段曲目都存在、循环点合理、曲名与面板一致，每个场景默认都有一段变奏',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../screen-web/assets/music/soundtrack.json',import.meta.url),'utf8'));
 for(const [id,c] of Object.entries(manifest.cues)){
  const file=await stat(new URL('..'+c.src,import.meta.url));assert.ok(file.size>50000,`${id} 文件存在`);
  if(id.startsWith('sting'))assert.equal(c.loopEnd,undefined);else{assert.ok(c.loopEnd-c.loopStart>30&&c.loopEnd<=c.duration,`${id} 循环点`);}
  assert.equal(MUSIC_CHOICES[id]?.title??c.title,c.title,`${id} 曲名一致`);assert.ok(Math.abs(c.loudness-(id.startsWith('sting')?-16:-18))<.6,`${id} 响度`);
 }
 for(const [scene,info] of Object.entries(SCENES)){const ids=info.auto==='chapter'?CHAPTER_CUES:[info.auto];for(const id of ids)assert.ok(manifest.cues[id],`${scene} → ${id}`);}
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
