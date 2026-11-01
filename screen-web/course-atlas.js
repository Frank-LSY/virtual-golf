import {COURSES} from '../shared/courses.js';
import {courseSummary,challengeLabel,localToCourse} from '../shared/course-layout.js';
import {courseTour,holeTransfer} from '../shared/course-tour.js';
import {MapView} from './view-controls.js';

// 0.27 球场卡片缩略图：每座球场一幅小插画（天空、远景、标志性植物 / 建筑、一条球道和旗），配色与 3D 场景一致。
const INK='#22264a';
const tree=(x,y,r,fill,dots='')=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${INK}" stroke-width="1.1"/><rect x="${x-.9}" y="${y+r-1}" width="1.8" height="${r*.7}" fill="#7a5532"/>${dots}`;
const pine=(x,y,h,fill)=>`<path d="M${x} ${y-h}L${x+h*.36} ${y-h*.45}H${x+h*.18}L${x+h*.46} ${y}H${x-h*.46}L${x-h*.18} ${y-h*.45}H${x-h*.36}Z" fill="${fill}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>`;
const flag=(x,y,color)=>`<path d="M${x} ${y}V${y-15}" stroke="${INK}" stroke-width="1.3"/><path d="M${x} ${y-15}L${x+9} ${y-12}L${x} ${y-9}Z" fill="${color}" stroke="${INK}" stroke-width="1"/>`;
const sky=(id,top,bottom)=>`<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><rect width="96" height="96" fill="url(#${id})"/>`;
const ART={
 orchard:c=>sky('sk-orchard','#79c3f0','#fff0cf')+`<circle cx="20" cy="18" r="9" fill="#ffe08a"/>
  <path d="M0 52Q30 40 60 48T96 44V96H0Z" fill="#b6d36a"/>
  <g>${[12,26,40,54].map(x=>tree(x,50,4.2,'#6dab42',`<circle cx="${x-1.5}" cy="49" r=".9" fill="#e2402d"/><circle cx="${x+1.6}" cy="51" r=".9" fill="#e2402d"/>`)).join('')}</g>
  <path d="M68 38h18v12H68z" fill="#c0392b" stroke="${INK}" stroke-width="1.1"/><path d="M66 39L77 31L88 39Z" fill="#f4ecdf" stroke="${INK}" stroke-width="1.1"/><rect x="74.5" y="43" width="5" height="7" fill="#7a2a20"/>
  <path d="M0 64Q48 56 96 62V96H0Z" fill="${c.grass}"/>
  <path d="M-4 96Q30 74 62 70" stroke="${c.fairway}" stroke-width="15" fill="none" stroke-linecap="round"/><ellipse cx="68" cy="69" rx="12" ry="5" fill="${c.green}" stroke="${INK}" stroke-width="1"/>
  ${[10,30].map(x=>tree(x,80,6,'#5c9a3a',`<circle cx="${x-2.5}" cy="78" r="1.2" fill="#e2402d"/><circle cx="${x+2.2}" cy="81" r="1.2" fill="#e2402d"/><circle cx="${x}" cy="76" r="1.2" fill="#f2a531"/>`)).join('')}${tree(86,82,6,'#6dab42',`<circle cx="84" cy="80" r="1.2" fill="#e2402d"/><circle cx="88" cy="83" r="1.2" fill="#e2402d"/>`)}${flag(70,68,'#e2402d')}`,
 sunny:c=>sky('sk-sunny','#3d9cf6','#e8f8ff')+`<g fill="#fff" stroke="${INK}" stroke-width="1"><circle cx="22" cy="17" r="6"/><circle cx="30" cy="14" r="7.5"/><circle cx="38" cy="18" r="5.5"/></g>
  <g stroke="${INK}" stroke-width=".8">${[[52,30,8],[61,24,14],[70,32,6],[77,22,16],[86,28,10]].map(([x,y,w],i)=>`<rect x="${x}" y="${y}" width="${w>8?7:6}" height="${46-y}" fill="${['#d9e6f2','#f2dfd0','#e6e0f5','#d6efe3','#f5ecd0'][i]}"/>`).join('')}</g>
  <path d="M0 46Q48 40 96 46V96H0Z" fill="${c.ground}"/>
  <ellipse cx="66" cy="58" rx="22" ry="7" fill="${c.water}" stroke="${INK}" stroke-width="1"/><path d="M66 58V50" stroke="#f3fbff" stroke-width="2.2" stroke-linecap="round"/><path d="M62 52Q66 46 70 52" stroke="#f3fbff" stroke-width="1.4" fill="none"/>
  ${tree(12,50,6,'#4cab5f')}${tree(26,48,5,'#e57f8f')}${tree(40,52,5.5,'#358c50')}
  <path d="M-4 96Q20 76 44 72" stroke="${c.fairway}" stroke-width="16" fill="none" stroke-linecap="round"/><ellipse cx="48" cy="72" rx="11" ry="4.6" fill="${c.green}" stroke="${INK}" stroke-width="1"/>
  <circle cx="80" cy="84" r="4.5" fill="#7a5a3a"/>${[0,1,2,3,4,5].map(k=>`<circle cx="${80+Math.cos(k)*3}" cy="${84+Math.sin(k)*2.2}" r="1.3" fill="${['#ff5d6c','#ffd23f','#ff9fd0','#9b7bff','#fff','#ff8a3d'][k]}"/>`).join('')}${tree(90,74,6,'#3f9b5a')}${flag(50,71,'#ffc93a')}`,
 pine:c=>sky('sk-pine','#5f9bd4','#e9f3f7')+`<path d="M-6 50L18 18L34 38L50 14L72 40L84 26L102 50Z" fill="#7d97ad" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
  <path d="M12 26L18 18L23 25L20 23L17 27ZM44 22L50 14L56 23L52 21L48 25ZM80 31L84 26L88 31Z" fill="#fff"/>
  <path d="M0 52Q48 44 96 52V96H0Z" fill="${c.ground}"/>
  ${[[8,58,18],[20,56,22],[34,60,16],[80,56,20],[92,58,16]].map(([x,y,h])=>pine(x,y,h,'#2c7558')).join('')}
  <path d="M60 98Q40 80 52 70T60 58" stroke="${c.fairway}" stroke-width="14" fill="none" stroke-linecap="round"/><ellipse cx="60" cy="58" rx="10" ry="4.2" fill="${c.green}" stroke="${INK}" stroke-width="1"/>
  ${[[10,92,26],[26,96,22],[86,94,28]].map(([x,y,h])=>pine(x,y,h,'#1f5f4b')).join('')}${flag(62,57,'#ff7a2f')}`,
 desert:c=>sky('sk-desert','#3a8ee0','#ffe3b8')+`<circle cx="74" cy="20" r="10" fill="#fff1b0"/><circle cx="74" cy="20" r="14" fill="#fff1b0" opacity=".35"/>
  <path d="M4 50V36L10 33H26L30 36V50ZM52 50V30L56 27H70L74 31V50Z" fill="#c56b3d" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/><path d="M5 41H29M53 37H73M53 44H73" stroke="#e39a5e" stroke-width="2"/>
  <path d="M0 52Q30 44 56 50T96 48V96H0Z" fill="${c.ground}"/>
  <ellipse cx="22" cy="66" rx="14" ry="4.6" fill="${c.water}" stroke="${INK}" stroke-width="1"/>
  <path d="M26 64Q25 52 28 44" stroke="#9a7a58" stroke-width="2.2" fill="none"/>${[[-12,-6],[-6,-10],[2,-11],[9,-7],[13,-1],[-14,0]].map(([dx,dy])=>`<path d="M28 44Q${28+dx*.5} ${44+dy-3} ${28+dx} ${44+dy+4}" stroke="#5f9a45" stroke-width="2.4" fill="none" stroke-linecap="round"/>`).join('')}
  <path d="M100 96Q66 76 44 74" stroke="${c.fairway}" stroke-width="15" fill="none" stroke-linecap="round"/><ellipse cx="44" cy="74" rx="10" ry="4.2" fill="${c.green}" stroke="${INK}" stroke-width="1"/>
  <g fill="#3f8a4a" stroke="${INK}" stroke-width="1"><rect x="80" y="62" width="5" height="22" rx="2.5"/><path d="M80 72H76V66" stroke-width="3.4" stroke="#3f8a4a" fill="none" stroke-linecap="round"/><path d="M85 70H89V64" stroke-width="3.4" stroke="#3f8a4a" fill="none" stroke-linecap="round"/></g>${flag(46,73,'#1fbfb0')}`,
 coast:c=>sky('sk-coast','#3ea3e2','#f0fbff')+`<path d="M58 22l3 2 3-2M68 16l2.4 1.6 2.4-1.6" stroke="${INK}" stroke-width="1.1" fill="none"/>
  <rect y="40" width="96" height="16" fill="${c.water}"/><path d="M4 46q4-2 8 0t8 0M30 50q4-2 8 0t8 0M60 45q4-2 8 0t8 0" stroke="#fff" stroke-width="1.3" fill="none"/>
  <path d="M70 56L76 40H90L96 56Z" fill="#cfc6b2" stroke="${INK}" stroke-width="1"/>${[0,1,2,3].map(j=>`<rect x="${79.5+j*.4}" y="${36-j*6}" width="${5-j*.8}" height="6" fill="${j%2?'#d8423a':'#fff'}" stroke="${INK}" stroke-width=".8"/>`).join('')}<rect x="80" y="10" width="4" height="3" fill="#fff3a6" stroke="${INK}" stroke-width=".8"/><path d="M79.5 10L82 6.5L84.5 10Z" fill="#d8423a" stroke="${INK}" stroke-width=".8"/>
  <path d="M0 58Q30 52 60 58T96 56V96H0Z" fill="${c.ground}"/>
  <path d="M-4 96Q28 76 54 70" stroke="${c.fairway}" stroke-width="15" fill="none" stroke-linecap="round"/><ellipse cx="58" cy="70" rx="11" ry="4.4" fill="${c.green}" stroke="${INK}" stroke-width="1"/>
  ${[[10,66],[78,78],[88,72],[28,62]].map(([x,y])=>`<path d="M${x} ${y}l-2-6M${x} ${y}l0-7M${x} ${y}l2.4-6" stroke="#b8a15e" stroke-width="1.2"/>`).join('')}${flag(60,69,'#1d3f8f')}`,
 rainforest:c=>sky('sk-rain','#5f9fb2','#e6f4ee')+`<path d="M-8 52L22 14L40 40L60 10L96 52Z" fill="#3f7a52" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/><path d="M57 14L60 10L63 14L61 13Z" fill="#2b5e40"/>
  <path d="M59.5 16V46" stroke="#eaf8ff" stroke-width="3" stroke-linecap="round"/><ellipse cx="59.5" cy="47" rx="5" ry="2" fill="#fff"/>
  <path d="M0 30Q20 26 40 30T96 28" stroke="#fff" stroke-width="5" opacity=".55" fill="none"/>
  <path d="M0 52Q48 46 96 52V96H0Z" fill="${c.ground}"/>
  <path d="M40 98Q44 78 60 70" stroke="${c.fairway}" stroke-width="14" fill="none" stroke-linecap="round"/><ellipse cx="62" cy="68" rx="10" ry="4.2" fill="${c.green}" stroke="${INK}" stroke-width="1"/>
  <path d="M-6 70Q14 58 26 74Q16 92 -6 88Z" fill="#1f7a4c" stroke="${INK}" stroke-width="1.1"/><path d="M-4 76L18 72M-4 82L16 80" stroke="#3a9a4e" stroke-width="1.4"/>
  <path d="M102 62Q78 56 72 76Q84 96 102 90Z" fill="#279056" stroke="${INK}" stroke-width="1.1"/><path d="M100 70L80 74M100 78L82 80M100 86L86 86" stroke="#176b42" stroke-width="1.4"/>
  <circle cx="30" cy="86" r="2.6" fill="#ff4f8b" stroke="${INK}" stroke-width=".8"/><circle cx="30" cy="86" r=".9" fill="#ffcf3a"/>${flag(64,67,'#ff4f8b')}`
};
export function courseArt(c){
 const draw=ART[c.id];if(!draw)return `<svg class="course-art" viewBox="0 0 96 96" aria-hidden="true"><rect width="96" height="96" fill="${c.ground}"/></svg>`;
 return `<svg class="course-art course-art-${c.id}" viewBox="0 0 96 96" aria-hidden="true">${draw(c)}</svg>`;
}
export class CourseAtlas {
 constructor(){
  this.dialog=document.createElement('dialog');this.dialog.className='course-atlas';this.dialog.setAttribute('aria-label','九洞球场导览');
  this.dialog.innerHTML='<button class="atlas-close" aria-label="关闭球场导览">×</button><p class="eyebrow">一座球场 · 九段旅程</p><h2 id="atlas-title"></h2><p id="atlas-summary"></p><div class="atlas-layout"><div class="atlas-map"><canvas width="920" height="620" aria-label="九洞全场地图"></canvas><p class="atlas-legend">● 发球台　⚑ 果岭　虚线：球车道　⌂ 会所</p></div><aside><div class="atlas-holes" aria-label="选择查看球洞"></div><h3 id="atlas-hole-title"></h3><p id="atlas-hole-meta"></p><p id="atlas-advice"></p><div class="atlas-rhythm"></div><p id="atlas-transfer"></p><p class="atlas-note">据真实球场理念抽象创作；距离、地形与障碍为游戏设计。</p><a id="atlas-source" target="_blank" rel="noopener"></a></aside></div>';
  document.body.append(this.dialog);this.canvas=this.dialog.querySelector('canvas');this.map=new MapView(this.canvas,()=>this.draw(),'全场地图');this.dialog.querySelector('.atlas-close').onclick=()=>this.dialog.close();
 }
 show(id,seed=421,state=null){this.tour=courseTour(id,seed);this.state=state;this.index=state?.holeIndex||0;this.routes=[];for(let i=0;i<9;i++){try{this.routes.push(holeTransfer(id,seed,i,i===8?null:i+1));}catch{this.routes.push(null);}}this.map.reset();const c=this.tour.course,s=courseSummary(c),$=id=>this.dialog.querySelector('#'+id);$('atlas-title').textContent=c.name;$('atlas-summary').textContent=`${c.theme} · ${c.difficulty} · 9 洞 · 标准杆 ${s.par} · ${s.length.toLocaleString()} 米`;const source=$('atlas-source');source.textContent='设计参考：'+c.source.name+' ↗';source.href=c.source.url;
  const choices=this.dialog.querySelector('.atlas-holes');choices.innerHTML=c.holes.map((h,i)=>`<button data-hole="${i}" aria-label="查看第 ${i+1} 洞">${i+1}</button>`).join('');choices.querySelectorAll('button').forEach(button=>button.onclick=()=>{this.index=Number(button.dataset.hole);this.detail();});this.detail();if(!this.dialog.open)this.dialog.showModal();
 }
 detail(){const h=this.tour.holes[this.index],$=id=>this.dialog.querySelector('#'+id);$('atlas-hole-title').textContent=`${this.index+1}. ${h.name}`;$('atlas-hole-meta').textContent=`标准杆 ${h.par} · ${h.length} 米 · ${challengeLabel(h.challenge)}`;$('atlas-advice').textContent=h.advice;
  this.dialog.querySelectorAll('[data-hole]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.hole)===this.index)));this.dialog.querySelector('.atlas-rhythm').innerHTML='<span>九洞难度节奏</span><div>'+this.tour.holes.map((q,i)=>`<i class="${i===this.index?'active':''}" style="height:${q.challenge*10}px" title="第 ${i+1} 洞：${challengeLabel(q.challenge)}"><small>${i+1}</small></i>`).join('')+'</div>';
  const route=this.routes[this.index];$('atlas-transfer').textContent=route?`球车接驳 ${Math.round(route.meters)} 米 → ${this.index===8?'返回会所':`第 ${this.index+2} 洞发球台`}`:'接驳路线将在出发时规划';this.draw();
 }
 draw(){if(!this.tour)return;const ctx=this.canvas.getContext('2d'),{tour}=this,c=tour.course,b=tour.bounds,scale=Math.min(860/(b.maxX-b.minX),560/(b.maxZ-b.minZ)),px=x=>460+(x-tour.center.x)*scale,pz=z=>310-(z-tour.center.z)*scale;ctx.clearRect(0,0,920,620);ctx.fillStyle=c.ground;ctx.fillRect(0,0,920,620);this.map.begin(ctx);ctx.lineJoin='round';ctx.lineCap='round';
  if(tour.reserve?.type==='lake'){const r=tour.reserve;ctx.fillStyle=c.water;ctx.beginPath();ctx.ellipse(px(r.x),pz(r.z),r.rx*scale,r.rz*scale,0,0,Math.PI*2);ctx.fill();}
  ctx.fillStyle=c.trees;ctx.globalAlpha=.65;for(const h of tour.holes)for(const tree of h.trees){const q=localToCourse(h.placement,tree);ctx.beginPath();ctx.arc(px(q.x),pz(q.z),Math.max(1.3,tree.scale*2*scale),0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
  for(const h of tour.holes){const points=h.route.map(q=>localToCourse(h.placement,q));ctx.strokeStyle=h.index===this.index?'#e9e2a6':c.fairway;ctx.lineWidth=h.width*2*scale;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(px(p.x),pz(p.z)):ctx.moveTo(px(p.x),pz(p.z)));ctx.stroke();for(const hazard of h.hazards){const q=localToCourse(h.placement,hazard);ctx.save();ctx.translate(px(q.x),pz(q.z));ctx.rotate(h.placement.heading-hazard.angle);ctx.fillStyle=hazard.type==='water'?c.water:'#e2cea0';ctx.beginPath();ctx.ellipse(0,0,hazard.rx*scale,hazard.rz*scale,0,0,Math.PI*2);ctx.fill();ctx.restore();}const end=h.placement.green;ctx.fillStyle=c.green;ctx.beginPath();ctx.arc(px(end.x),pz(end.z),h.greenRadius*scale,0,Math.PI*2);ctx.fill();}
  for(const [i,road] of this.routes.entries()){if(!road)continue;ctx.setLineDash([3,4]);ctx.strokeStyle=i===this.index?'#fff9df':'#d3cab7';ctx.lineWidth=i===this.index?2.6:1.4;ctx.beginPath();road.route.forEach((p,j)=>j?ctx.lineTo(px(p.x),pz(p.z)):ctx.moveTo(px(p.x),pz(p.z)));ctx.stroke();}ctx.setLineDash([]);
  for(const h of tour.holes){const t=h.placement.tee,done=this.state?.scores?.some(s=>s.hole===h.index+1);ctx.fillStyle=h.index===this.index?'#223e31':done?'#55766c':'#fbf7e8';ctx.beginPath();ctx.arc(px(t.x),pz(t.z),12,0,Math.PI*2);ctx.fill();ctx.fillStyle=h.index===this.index||done?'#fffbe9':'#294d3c';ctx.font='bold 13px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(h.index+1),px(t.x),pz(t.z));const g=h.placement.green;ctx.fillStyle='#2b493b';ctx.fillText('⚑',px(g.x),pz(g.z));}
  ctx.fillStyle='#f6e3bb';ctx.fillRect(px(tour.clubhouse.x)-10,pz(tour.clubhouse.z)-8,20,16);ctx.font='14px sans-serif';ctx.fillText('会所',px(tour.clubhouse.x),pz(tour.clubhouse.z)-19);
  if(this.state){const placement=tour.placements[this.state.holeIndex],ball=localToCourse(placement,this.state.ball);ctx.fillStyle='#fff';ctx.strokeStyle='#244f3f';ctx.lineWidth=2;ctx.beginPath();ctx.arc(px(ball.x),pz(ball.z),5,0,Math.PI*2);ctx.fill();ctx.stroke();}
  this.map.end(ctx);
 }
}
