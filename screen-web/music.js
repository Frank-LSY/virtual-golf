export const MUSIC_TRACK={title:'Butterfly Waltz',artist:'Brian Crain',source:'https://briancrain.bandcamp.com/track/butterfly-waltz-3'};

export class LoopMusic {
 constructor(audio,storage){
  this.audio=audio;this.storage=storage;this.available=false;this.message='尚未载入音频';this.onChange=()=>{};
  audio.loop=true;audio.preload='metadata';
  const saved=Number(storage.getItem('swinglink-music-volume')??.25);this.volume=Number.isFinite(saved)?Math.max(0,Math.min(1,saved)):.25;this.duckGain=1;this.applyVolume();
  this.enabled=storage.getItem('swinglink-music')!=='off';
  audio.addEventListener('error',()=>{this.available=false;this.message='音乐暂时无法播放，请刷新页面重试';this.onChange();});
  for(const event of ['loadedmetadata','playing','pause'])audio.addEventListener(event,()=>this.onChange());
 }
 setSource(url){this.audio.pause();this.audio.src=url;this.available=true;this.message='音频已就绪';this.onChange();}
 applyVolume(){this.audio.volume=this.volume*this.duckGain;}
 setDucking(gain){this.duckGain=Math.max(0,Math.min(1,gain));this.applyVolume();}
 setVolume(value){this.volume=Math.max(0,Math.min(1,Number(value)||0));this.applyVolume();this.storage.setItem('swinglink-music-volume',String(this.volume));this.onChange();}
 async play(){
  if(!this.available)return false;
  this.enabled=true;this.storage.setItem('swinglink-music','on');
  try{await this.audio.play();this.message='正在循环播放';this.onChange();return true;}
  catch(e){this.message=e.name==='NotAllowedError'?'点击“播放音乐”开始播放':'播放失败，请检查音频文件';this.onChange();return false;}
 }
 pause(){this.enabled=false;this.storage.setItem('swinglink-music','off');this.audio.pause();this.message='音乐已暂停';this.onChange();}
}

export function initMusic(){
 const $=id=>document.getElementById(id),music=new LoopMusic(new Audio(),localStorage),dialog=$('music-dialog');let interacted=false;
 music.onChange=()=>{
  const playing=!music.audio.paused;
  $('music-toggle').disabled=!music.available;$('music-toggle').textContent=playing?'暂停音乐':'播放音乐';
  $('music-button').textContent=playing?'♫ 音乐 开':'♫ 音乐 关';$('music-button').setAttribute('aria-label',playing?'背景音乐：开，点击调整':'背景音乐：关，点击调整');
  $('music-volume').value=Math.round(music.volume*100);$('music-volume-value').textContent=$('music-volume').value+'%';
  const issue=/无法|失败|未找到|点击/.test(music.message);$('music-status').hidden=!issue;$('music-status').textContent=issue?music.message:'';
 };
 const resume=()=>{if(interacted&&music.available&&music.enabled&&music.audio.paused)music.play();};
 $('music-button').onclick=()=>dialog.showModal();$('music-close').onclick=()=>dialog.close();
 $('music-toggle').onclick=()=>music.audio.paused?music.play():music.pause();
 $('music-volume').oninput=e=>music.setVolume(Number(e.target.value)/100);
 (async()=>{try{const response=await fetch('/screen-web/assets/music/track.json');if(!response.ok)throw Error();const track=await response.json();if(!track.src)throw Error();music.setSource(track.src);resume();}catch{music.message='未找到背景音乐，请刷新页面重试';music.onChange();}})();
 const unlock=e=>{if(e.target.closest?.('#music-dialog,#music-button'))return;interacted=true;resume();document.removeEventListener('pointerdown',unlock);document.removeEventListener('keydown',unlock);};
 document.addEventListener('pointerdown',unlock);document.addEventListener('keydown',unlock);music.onChange();return music;
}
