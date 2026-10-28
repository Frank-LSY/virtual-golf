// 声音偏好：总静音、音乐 / 击球音效 / 环境声三路音量、各场景配乐与自动避让。
// 只保存在本机浏览器；首次加载时会迁移旧版本的“音乐开关 / 音乐音量 / 球场音效”设置。
export const SOUND_KEY='swinglink-sound-settings';
export const SCENES=Object.freeze({lobby:'球场大厅',lab:'挥杆练习室',game:'正式球局'});
export const MUSIC_CHOICES=Object.freeze({
 sunny:{title:'晴空',detail:'原创 Lo-Fi · 轻快明亮',kind:'generative'},
 practice:{title:'节拍',detail:'原创钢琴 Lo-Fi · 稳定律动',kind:'generative'},
 waltz:{title:'Butterfly Waltz',detail:'Brian Crain · 钢琴圆舞曲',kind:'file'},
 off:{title:'不播放',detail:'这个场景保持安静',kind:'off'}
});
export const DEFAULT_SOUND=Object.freeze({muted:false,duck:true,music:{on:true,volume:.5},effects:{on:true,volume:1},ambience:{on:true,volume:1},scenes:{lobby:'sunny',lab:'practice',game:'waltz'}});

const clamp01=v=>Math.max(0,Math.min(1,Number.isFinite(Number(v))?Number(v):0));
const channel=(raw,fallback)=>({on:typeof raw?.on==='boolean'?raw.on:fallback.on,volume:raw&&raw.volume!==undefined?clamp01(raw.volume):fallback.volume});
export function normalizeSound(raw={}){
 const d=DEFAULT_SOUND,scenes={};
 for(const scene of Object.keys(SCENES))scenes[scene]=MUSIC_CHOICES[raw?.scenes?.[scene]]?raw.scenes[scene]:d.scenes[scene];
 return {muted:!!raw?.muted,duck:typeof raw?.duck==='boolean'?raw.duck:d.duck,music:channel(raw?.music,d.music),effects:channel(raw?.effects,d.effects),ambience:channel(raw?.ambience,d.ambience),scenes};
}
// 旧版：swinglink-music（on/off）、swinglink-music-volume（线性 0–1）、swinglink-sound（球场音效 on/off）。
export function migrateSound(storage){
 const music=storage.getItem('swinglink-music'),volume=storage.getItem('swinglink-music-volume'),sound=storage.getItem('swinglink-sound'),out=structuredClone(DEFAULT_SOUND);
 if(music==='off')out.music.on=false;
 if(volume!==null&&Number.isFinite(Number(volume)))out.music.volume=Math.sqrt(clamp01(volume));
 if(sound==='off'){out.effects.on=false;out.ambience.on=false;}
 return out;
}
export function loadSound(storage){
 try{const saved=storage.getItem(SOUND_KEY);if(saved)return normalizeSound(JSON.parse(saved));}catch{}
 try{return normalizeSound(migrateSound(storage));}catch{return normalizeSound();}
}
// 滑块位置 → 实际增益：平方曲线更接近听感（50% 约为 -12 dB）。
export const sliderGain=v=>clamp01(v)**2;
export function soundGains(s){
 const live=on=>!s.muted&&on;
 return {music:live(s.music.on)?sliderGain(s.music.volume):0,effects:live(s.effects.on)?sliderGain(s.effects.volume):0,ambience:live(s.ambience.on)?sliderGain(s.ambience.volume):0};
}
export const audible=(s,name)=>!s.muted&&s[name].on&&s[name].volume>0;

export class SoundSettings{
 constructor(storage=globalThis.localStorage){this.storage=storage;this.value=loadSound(storage);this.listeners=new Set();}
 on(fn){this.listeners.add(fn);return ()=>this.listeners.delete(fn);}
 update(patch){
  const v=this.value,next={...v,...patch,music:{...v.music,...patch.music},effects:{...v.effects,...patch.effects},ambience:{...v.ambience,...patch.ambience},scenes:{...v.scenes,...patch.scenes}};
  this.value=normalizeSound(next);try{this.storage.setItem(SOUND_KEY,JSON.stringify(this.value));}catch{}
  for(const fn of this.listeners)fn(this.value,patch);return this.value;
 }
}
