import test from 'node:test';
import assert from 'node:assert/strict';
import {LoopMusic} from '../screen-web/music.js';
import {ShotAudioMix} from '../screen-web/audio-mix.js';
import {CourseAmbience,ambienceLevels,birdPhrase} from '../screen-web/soundscape.js';

function player(){const memory=new Map(),storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)},audio={paused:true,addEventListener(){},pause(){this.paused=true;},async play(){this.paused=false;}};return {music:new LoopMusic(audio,storage),audio,memory};}
const advance=(mix,start,end)=>{for(let t=start;t<=end;t+=50)mix.update(t,.05);};

test('音乐避让快速降低、连续碰撞不叠乘，在球停稳前保持低音量，再平滑恢复',()=>{
 const mix=new ShotAudioMix();mix.begin('round',0,10000);advance(mix,0,200);assert.ok(mix.gain<.33&&mix.gain>=.3);
 mix.impact('round','tree',250);advance(mix,250,800);assert.ok(Math.abs(mix.gain-.18)<.001);mix.impact('round','tree',850);advance(mix,850,1500);assert.ok(Math.abs(mix.gain-.18)<.001);
 mix.impact('round','cup',1550);advance(mix,1550,2100);assert.ok(Math.abs(mix.gain-.13)<.001);advance(mix,2150,4000);assert.ok(mix.gain<.131);
 mix.settle('round');mix.update(4050,.05);assert.ok(mix.gain>.13&&mix.gain<.25);advance(mix,4100,7000);assert.ok(mix.gain>.98);
});
test('音乐避让不会覆盖用户音量或暂停偏好，静音时恢复也不突然有声',async()=>{
 const {music,audio,memory}=player();music.setSource('track.mp3');await music.play();music.setVolume(.5);music.setDucking(.18);assert.equal(music.volume,.5);assert.equal(audio.volume,.09);assert.equal(memory.get('swinglink-music-volume'),'0.5');
 music.setVolume(.4);assert.equal(audio.volume,.4*.18);music.pause();music.setDucking(1);assert.equal(audio.paused,true);assert.equal(memory.get('swinglink-music'),'off');assert.equal(audio.volume,.4);
 music.setVolume(0);music.setDucking(.13);music.setDucking(1);assert.equal(audio.volume,0);
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
function fakeContext(){
 const param=()=>({value:0,setValueAtTime(v){this.value=v;},exponentialRampToValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;},setTargetAtTime(v){this.value=v;},cancelScheduledValues(){}});
 const c={currentTime:0,sampleRate:400,destination:{},nodes:[],resume(){},createBuffer(_,length){return {getChannelData:()=>new Float32Array(length)};},advance(t){this.currentTime+=t;for(const n of this.nodes)if(n.end!==undefined&&n.end<=this.currentTime&&!n.ended){n.ended=true;n.onended?.();}}};
 const node=()=>{const n={gain:param(),frequency:param(),Q:param(),pan:param(),connect(){},disconnect(){this.disconnected=true;},start(){},stop(t=c.currentTime){this.end=t;}};c.nodes.push(n);return n;};
 c.createOscillator=node;c.createBufferSource=node;c.createBiquadFilter=node;c.createGain=node;c.createStereoPanner=node;return c;
}
test('环境声音只初始化一次，关闭音效或隐藏页面会停掉鸟鸣并释放节点',()=>{
 const c=fakeContext(),a=new CourseAmbience(()=>c,{random:()=>.5});a.unlock();const wind=a.windSource;a.unlock();assert.equal(a.windSource,wind);a.setWeather(5);c.advance(5);a.update(1);assert.ok(a.voices.size>0);const count=a.voices.size;a.update(1);assert.equal(a.voices.size,count);
 a.setEnabled(false);c.advance(.2);assert.equal(a.voices.size,0);assert.equal(a.windGain.gain.value,0);c.advance(20);a.update();assert.equal(a.voices.size,0);
 a.setEnabled(true);a.update(1);assert.ok(a.voices.size>0);a.setVisible(false);c.advance(.2);assert.equal(a.voices.size,0);a.dispose();assert.ok(wind.disconnected);
});
