// 声音偏好：总静音、音乐 / 音效 / 环境声三路音量、各场景配乐与自动避让。
// 只保存在本机浏览器；会自动迁移 0.19 之前的“音乐开关 / 音乐音量 / 球场音效”和 0.19–0.20 的场景配乐设置。
export const SOUND_KEY='swinglink-sound-settings';
// 0.21：一首主题，多种变奏。每个场景默认用“主题变奏”（auto），也可以换成别的变奏或不播放。
export const SCENES=Object.freeze({
 hub:{name:'游戏大厅',auto:'hub'},
 'golf-lobby':{name:'高尔夫 · 球场',auto:'golf-lobby'},
 'golf-practice':{name:'高尔夫 · 练习室',auto:'golf-practice'},
 'golf-round':{name:'高尔夫 · 正式球局',auto:'golf-round'},
 'sky-map':{name:'云端滚球 · 地图',auto:'sky-map'},
 'sky-play':{name:'云端滚球 · 关卡',auto:'chapter'}
});
export const CHAPTER_CUES=Object.freeze(['sky-isles','sky-harbor','sky-aurora']);
// 曲目信息与 soundtrack.json 一致（测试会核对），这里保存一份，界面在清单加载前也能显示曲名。
export const MUSIC_CHOICES=Object.freeze({
 auto:{title:'主题变奏',detail:'按场景自动选择',kind:'auto'},
 hub:{title:'云上序曲',detail:'主题 · 管弦全编制',kind:'cue'},
 'golf-lobby':{title:'草坪漫步',detail:'主题 · 摇摆田园变奏',kind:'cue'},
 'golf-practice':{title:'练习场节拍',detail:'主题 · 极简律动变奏',kind:'cue'},
 'golf-round':{title:'果岭圆舞曲',detail:'主题 · 3/4 圆舞曲变奏',kind:'cue'},
 'sky-map':{title:'云端地图',detail:'主题 · 梦幻竖琴变奏',kind:'cue'},
 'sky-isles':{title:'启程群岛',detail:'主题 · 进行曲变奏',kind:'cue'},
 'sky-harbor':{title:'机关云港',detail:'主题 · 发条机关变奏',kind:'cue'},
 'sky-aurora':{title:'极光高空',detail:'主题 · 史诗管弦变奏',kind:'cue'},
 waltz:{title:'Butterfly Waltz',detail:'Brian Crain · 钢琴圆舞曲（旧版配乐）',kind:'file'},
 off:{title:'不播放',detail:'这个场景保持安静',kind:'off'}
});
export const DEFAULT_SOUND=Object.freeze({muted:false,duck:true,music:{on:true,volume:.5},effects:{on:true,volume:1},ambience:{on:true,volume:1},scenes:Object.fromEntries(Object.keys(SCENES).map(s=>[s,'auto'])),version:2});
// 0.19–0.20 的三个场景 → 新场景；旧曲目（Lo-Fi 晴空 / 节拍、Butterfly Waltz）都换成新的主题变奏，只保留“不播放”。
const LEGACY_SCENES={lobby:'golf-lobby',lab:'golf-practice',game:'golf-round'};

const clamp01=v=>Math.max(0,Math.min(1,Number.isFinite(Number(v))?Number(v):0));
const channel=(raw,fallback)=>({on:typeof raw?.on==='boolean'?raw.on:fallback.on,volume:raw&&raw.volume!==undefined?clamp01(raw.volume):fallback.volume});
export function normalizeSound(raw={}){
 const d=DEFAULT_SOUND,scenes={},old=raw?.version!==2;
 for(const scene of Object.keys(SCENES)){const v=raw?.scenes?.[scene];scenes[scene]=MUSIC_CHOICES[v]?v:d.scenes[scene];}
 if(old)for(const [from,to] of Object.entries(LEGACY_SCENES))if(raw?.scenes?.[from]==='off')scenes[to]='off';
 return {muted:!!raw?.muted,duck:typeof raw?.duck==='boolean'?raw.duck:d.duck,music:channel(raw?.music,d.music),effects:channel(raw?.effects,d.effects),ambience:channel(raw?.ambience,d.ambience),scenes,version:2};
}
// 更早的版本：swinglink-music（on/off）、swinglink-music-volume（线性 0–1）、swinglink-sound（球场音效 on/off）。
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
