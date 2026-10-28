import {escapeHTML as esc,phoneLabel,PLAYER_COLORS,roundExport,MAX_PLAYERS} from '../shared/players.js';
const $=id=>document.getElementById(id);
export class Multiplayer {
 constructor(conn,toast){this.conn=conn;this.toast=toast;this.phones=[];this.ids=new Set();this.multi=false;this.playerCount=2;
  $('start-button').insertAdjacentHTML('beforebegin',`<section class="match-setup"><div class="match-mode"><button id="mode-solo" class="selected">单人打球</button><button id="mode-multi">多人对战</button></div><label id="player-count-label" class="player-count hidden">参赛人数<select id="player-count">${Array.from({length:MAX_PLAYERS-1},(_,i)=>`<option value="${i+2}">${i+2} 人${i+2>4?' · 多人同场':''}</option>`).join('')}</select><span id="selected-count"></span></label><div id="match-players"></div><p id="match-note">手机与球手一一对应，姓名和装扮可在手机修改。</p></section>`);
  $('game-canvas').insertAdjacentHTML('afterend','<div id="turn-roster" class="turn-roster" aria-live="polite" aria-label="球手列表，可左右滚动"></div>');
  $('score-description').insertAdjacentHTML('afterend','<button id="round-export" class="text-button">导出全部球局与逐杆记录 ↓</button>');
  $('player-count').onchange=()=>{this.playerCount=Number($('player-count').value);this.edited=false;this.update(this.phones);};
  $('mode-solo').onclick=()=>this.mode(false);$('mode-multi').onclick=()=>this.mode(true);
  $('round-export').onclick=()=>conn.send({type:'round_records'});
  conn.addEventListener('message',({detail:m})=>{if(m.type==='round_records'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({'球局记录':[...m.rounds,m.current].map(roundExport)},null,2)],{type:'application/json'}));a.download='挥杆之间-球局记录.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}});
 }
 mode(multi){this.multi=multi;this.render();}
 update(phones){this.phones=phones||[];if(!this.edited)this.ids=new Set(this.phones.filter(p=>p.connected).slice(0,this.playerCount).map(p=>p.id));this.render();}
 options(){if(!this.multi)return {multiplayer:false};const ids=[...this.ids].filter(id=>this.phones.some(p=>p.id===id&&p.connected));if(ids.length!==this.playerCount){this.toast(`已选择 ${this.playerCount} 人对战，请勾选 ${this.playerCount} 台已连接的手机（当前 ${ids.length} 台）。`);return null;}return {multiplayer:true,playerCount:this.playerCount,playerIds:ids};}
 render(){$('player-count-label').classList.toggle('hidden',!this.multi);$('selected-count').textContent=`已选 ${[...this.ids].filter(id=>this.phones.some(p=>p.id===id&&p.connected)).length} / ${this.playerCount} 台`;for(const [id,on] of [['mode-solo',!this.multi],['mode-multi',this.multi]])$(id).classList.toggle('selected',on);
  $('match-players').innerHTML=this.multi?(this.phones.filter(p=>p.connected||this.ids.has(p.id)).map(p=>`<label class="player-choice"><input type="checkbox" data-player="${esc(p.id)}" ${this.ids.has(p.id)?'checked':''} ${p.connected?'':'disabled'}><i style="background:${PLAYER_COLORS[p.style]}"></i><span><b>${esc(p.name)}</b><small>${phoneLabel(p)} · ${!p.connected?'离线':p.calibrated?(p.calibration?.mode==='model'?'模式识别':'已就绪'):'待启用体感'}</small></span></label>`).join('')||'<p>扫描同一个二维码，每位球手各用一台手机加入。</p>'):'';
  document.querySelectorAll('[data-player]').forEach(b=>b.onchange=()=>{this.edited=true;b.checked?this.ids.add(b.dataset.player):this.ids.delete(b.dataset.player);$('selected-count').textContent=`已选 ${[...this.ids].filter(id=>this.phones.some(p=>p.id===id&&p.connected)).length} / ${this.playerCount} 台`;});
  $('match-note').textContent=this.multi?`选择 ${this.playerCount} 台参赛手机；其余手机可旁观。每杆轮换，全部球手完成后进入下一洞。`:'手机与球手一一对应，姓名和装扮可在手机修改。';
 }
 round(state){const current=state.players?.find(p=>p.id===state.activePlayerId);$('turn-roster').innerHTML=[...(state.players||[])].sort((a,b)=>Number(b.id===state.activePlayerId)-Number(a.id===state.activePlayerId)).map(p=>{const phone=this.phones.find(x=>x.id===p.deviceId),active=p.id===state.activePlayerId;return `<div class="turn-player ${active?'current':''}"><i style="background:${PLAYER_COLORS[p.style]}"></i><span><b>${active?'当前：':''}${esc(p.name)}</b><small>${phoneLabel(p)} · ${p.holeDone?'本洞完成':p.strokes+' 杆'}${p.deviceId?(!phone?.connected?' · 等待重连':!phone?.calibrated?' · 待启用体感':''):''}</small></span></div>`;}).join('');return current;}
 score(state){document.querySelector('.score-summary > span').textContent=state.multiplayer?'对战结果':'累计比标准杆';if(!state.multiplayer)return;const ranked=[...state.players].sort((a,b)=>a.scores.reduce((s,h)=>s+h.strokes,0)-b.scores.reduce((s,h)=>s+h.strokes,0));
  $('score-title').textContent=state.phase==='finished'?'本局成绩 · 每一杆都算数':'球手记分卡';
  $('score-rows').innerHTML=`<div class="multi-score-scroll"><table class="multi-score"><thead><tr><th>球手 / 手机</th>${Array.from({length:state.mode},(_,i)=>`<th>${i+1} 洞</th>`).join('')}<th>已完成合计</th></tr></thead><tbody>${ranked.map(p=>`<tr><th>${esc(p.name)}<small>${phoneLabel(p)}</small></th>${Array.from({length:state.mode},(_,i)=>{const h=p.scores.find(h=>h.hole===i+1);return `<td>${h?h.strokes+(h.capped?'*':''):i===state.holeIndex?p.strokes+'…':'—'}</td>`;}).join('')}<td>${p.scores.reduce((s,h)=>s+h.strokes,0)}</td></tr>`).join('')}</tbody></table></div><p class="small-note">* 达到 12 杆上限；省略号表示本洞进行中。</p>`;
  const best=ranked[0]?.scores.reduce((s,h)=>s+h.strokes,0),winners=ranked.filter(p=>p.scores.reduce((s,h)=>s+h.strokes,0)===best);
  $('score-summary').textContent=state.phase==='finished'?(winners.length>1?'并列获胜：':'获胜：')+winners.map(p=>p.name).join('、'):'本洞全部完成后统一结算';
 }
}
