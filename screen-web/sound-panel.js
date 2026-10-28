// 顶栏“声音”按钮 + 浮动面板：一处调整音乐、击球音效、环境声与各场景配乐。不遮挡球场，点外面或按 Esc 关闭。
import {SCENES,MUSIC_CHOICES,audible} from './sound-settings.js';

const ICON={
 sound:'<path d="M3 9h4l5-5v16l-5-5H3z"/><path d="M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
 mute:'<path d="M3 9h4l5-5v16l-5-5H3z"/><path d="m16 9 6 6m0-6-6 6"/>',
 play:'<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
 pause:'<path d="M8 5h3v14H8zm5 0h3v14h-3z" fill="currentColor" stroke="none"/>',
 shuffle:'<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16m0 5v-5h5"/>'
};
const svg=name=>`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;
const SHORT={muted:'已静音',paused:'音乐已关',zero:'音量为 0',['scene-off']:'此处无配乐',locked:'点击开始',hidden:'已暂停',failed:'无法播放'};
const SCENE_SHORT={lobby:'大厅配乐',lab:'练习室配乐',game:'球局配乐'};

export function initSoundPanel({settings,director,toast=()=>{},doc=document,win=window}){
 const $=id=>doc.getElementById(id),button=$('sound-button'),panel=$('sound-panel');
 for(const scene of Object.keys(SCENES)){const select=$(`sp-scene-${scene}`);select.innerHTML=Object.entries(MUSIC_CHOICES).map(([id,c])=>`<option value="${id}">${c.title}${c.kind==='generative'?' · 原创':''}</option>`).join('');select.onchange=()=>settings.update({scenes:{[scene]:select.value}});}
 $('sp-shuffle').innerHTML=svg('shuffle');
 let open=false;
 const place=()=>{
  if(!open)return;const r=button.getBoundingClientRect(),w=win.innerWidth,h=win.innerHeight,sheet=w<=640;
  panel.classList.toggle('sheet',sheet);
  if(sheet){Object.assign(panel.style,{left:'',right:'',top:'',bottom:'',maxHeight:''});return;}
  const width=Math.min(372,w-24),left=Math.max(12,Math.min(r.right-width,w-width-12)),below=r.top<h/2;
  Object.assign(panel.style,{left:left+'px',right:'',top:below?r.bottom+10+'px':'',bottom:below?'':h-r.top+10+'px',maxHeight:(below?h-r.bottom-22:r.top-22)+'px'});
 };
 const show=next=>{open=next;panel.hidden=!open;button.setAttribute('aria-expanded',String(open));if(open){place();render();panel.focus({preventScroll:true});}else if(panel.contains(doc.activeElement))button.focus({preventScroll:true});};
 button.onclick=()=>show(!open);$('sp-close').onclick=()=>show(false);
 doc.addEventListener('pointerdown',e=>{if(open&&!panel.contains(e.target)&&!button.contains(e.target))show(false);},true);
 doc.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&open){show(false);e.stopPropagation();return;}
  if(e.code==='KeyM'&&!e.repeat&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.target.matches?.('input,select,textarea')){const on=!settings.value.music.on||settings.value.muted;settings.update({muted:false,music:{on}});toast(on?`音乐已开启 · ${MUSIC_CHOICES[settings.value.scenes[director.scene]].title}`:'音乐已关闭（按 M 重新开启）');}
 });
 win.addEventListener('resize',place);win.addEventListener('scroll',place,true);

 const toggleMusic=()=>{const v=settings.value;settings.update(v.muted?{muted:false,music:{on:true}}:{music:{on:!v.music.on}});};
 $('sp-play').onclick=toggleMusic;$('sp-music-on').onclick=toggleMusic;
 $('sp-shuffle').onclick=()=>{if(director.reshuffle())toast('换了一段新的旋律');};
 $('sp-mute').onclick=()=>settings.update({muted:!settings.value.muted});
 $('sp-duck').onchange=e=>settings.update({duck:e.target.checked});
 for(const name of ['music','effects','ambience']){
  const range=$(`sp-${name}`);
  range.oninput=()=>{const volume=Number(range.value)/100,v=settings.value,patch={[name]:{volume,...(volume>0&&!v[name].on?{on:true}:{})}};if(volume>0&&v.muted)patch.muted=false;settings.update(patch);};
  if(name!=='music')$(`sp-${name}-on`).onclick=()=>settings.update({muted:false,[name]:{on:settings.value.muted?true:!settings.value[name].on}});
 }

 function render(){
  const v=settings.value,st=director.status(),playing=!!st.playing&&!st.code;
  button.querySelector('.sound-icon').innerHTML=svg(v.muted?'mute':'sound');
  button.classList.toggle('muted',v.muted);button.classList.toggle('playing',playing);
  $('sound-now').textContent=v.muted?'已静音':st.choice==='off'?'无配乐':st.title;
  $('sound-state').textContent=v.muted?'点击调整':st.code?SHORT[st.code]:SCENE_SHORT[st.scene];
  button.setAttribute('aria-label',`音乐与音效设置：${v.muted?'已全部静音':playing?`正在播放 ${st.title}`:SHORT[st.code]||'音乐'}`);
  if(!open)return;
  $('sp-scene').textContent=`当前场景：${SCENES[st.scene]}`;
  $('sp-mute').setAttribute('aria-pressed',String(v.muted));$('sp-mute').textContent=v.muted?'取消静音':'全部静音';panel.classList.toggle('muted',v.muted);
  $('sp-now').dataset.state=playing?'playing':'idle';$('sp-now-label').textContent=playing?'正在播放':st.code==='locked'?'等待开始':st.choice==='off'?'这个场景':'已暂停';
  $('sp-title').textContent=st.title;$('sp-detail').textContent=st.detail;
  const musicOn=v.music.on&&!v.muted;$('sp-play').innerHTML=svg(musicOn?'pause':'play');$('sp-play').setAttribute('aria-label',musicOn?'暂停音乐':'播放音乐');$('sp-play').disabled=st.choice==='off'&&!v.muted;
  $('sp-shuffle').hidden=st.kind!=='generative';$('sp-shuffle').disabled=!playing;
  const showReason=st.code&&!['paused','muted'].includes(st.code);$('sp-reason').hidden=!showReason;$('sp-reason').textContent=showReason?st.reason:'';$('sp-reason').dataset.kind=st.code;
  for(const name of ['music','effects','ambience']){
   const on=v[name].on,range=$(`sp-${name}`),value=Math.round(v[name].volume*100),sw=$(`sp-${name}-on`);
   if(doc.activeElement!==range)range.value=value;range.style.setProperty('--v',range.value+'%');$(`sp-${name}-value`).textContent=value+'%';
   sw.setAttribute('aria-checked',String(on&&!v.muted));range.closest('.sp-row').classList.toggle('off',!audible(v,name));
  }
  for(const scene of Object.keys(SCENES)){const select=$(`sp-scene-${scene}`);select.value=v.scenes[scene];select.closest('.sp-scene').classList.toggle('current',scene===st.scene);}
  $('sp-duck').checked=v.duck;
 }
 settings.on(render);director.on(render);render();
 return {render,show,get open(){return open;}};
}
