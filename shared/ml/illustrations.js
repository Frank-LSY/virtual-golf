// 握持图解与挥杆动作示范（原创矢量图 + CSS 动画），手机与电脑共用。
// 正面视角：双臂与手机绕两肩中点转动；全挥杆、切杆、推杆的幅度不同，力度档位改变幅度。
const AMPLITUDE={
 full:{light:[78,-82],mid:[104,-108],heavy:[128,-134]},
 partial:{light:[46,-48],mid:[64,-66],heavy:[82,-86]},
 putt:{light:[11,-12],mid:[17,-19],heavy:[24,-27]}
};
export const MOTION_TIPS=Object.freeze({
 full:'上杆到手臂高过肩，顺势下挥，收杆到另一侧',
 partial:'上杆到腰与肩之间，挥出幅度与上杆相近',
 putt:'双肩像钟摆一样小幅摆动，手腕保持稳定',
 other:'照提示做日常动作，不要做挥杆'
});
export const GRIPS=Object.freeze({vertical:'竖握',horizontal:'横握'});
export const GRIP_TIPS=Object.freeze({
 vertical:['推荐竖握：双手上下叠握手机下半部，像握球杆一样','手机一端指向球，屏幕朝向自己','挥杆时握稳即可，手腕自然转动不会影响识别'],
 horizontal:['横握：手机横放，双手握住左右两端','屏幕朝向自己，手臂自然下垂','同一个人尽量保持同一种握法']
});

const STYLE=`<style>
.sl-fig{--skin:#f2c9a5;--body:#12372a;--phone:#1b2a33;--accent:#ffc83d}
.sl-fig .ground{stroke:#c9dcc2;stroke-width:3;stroke-linecap:round}
.sl-fig .limb{stroke:var(--body);stroke-width:7;stroke-linecap:round;fill:none}
.sl-fig .arm{stroke:var(--body);stroke-width:6;stroke-linecap:round;fill:none}
.sl-fig .head{fill:var(--skin);stroke:var(--body);stroke-width:4}
.sl-fig .hands{fill:var(--skin);stroke:var(--body);stroke-width:3}
.sl-fig .device{fill:var(--phone)}.sl-fig .screen{fill:#7fd4ff}
.sl-fig .arc{fill:none;stroke:var(--accent);stroke-width:3;stroke-dasharray:5 6;stroke-linecap:round;opacity:.9}
.sl-fig .ball{fill:#fff;stroke:#9db0a5;stroke-width:2}
.sl-fig .swing{transform-box:view-box;transform-origin:100px 80px;animation:sl-swing 3.4s infinite}
.sl-fig.putt .swing{animation-name:sl-putt}
.sl-fig.other .swing{animation:sl-other 2.4s infinite ease-in-out}
.sl-fig.paused .swing{animation-play-state:paused}
@keyframes sl-swing{0%,14%{transform:rotate(0deg);animation-timing-function:ease-in-out}46%{transform:rotate(var(--top));animation-timing-function:linear}52%{transform:rotate(var(--top));animation-timing-function:cubic-bezier(.6,0,.9,.6)}60%{transform:rotate(0deg);animation-timing-function:cubic-bezier(.2,.6,.4,1)}70%{transform:rotate(var(--finish))}88%{transform:rotate(var(--finish));animation-timing-function:ease-in-out}100%{transform:rotate(0deg)}}
@keyframes sl-putt{0%,16%{transform:rotate(0deg);animation-timing-function:ease-in-out}44%{transform:rotate(var(--top))}50%{transform:rotate(var(--top));animation-timing-function:ease-in-out}70%{transform:rotate(var(--finish))}86%{transform:rotate(var(--finish));animation-timing-function:ease-in-out}100%{transform:rotate(0deg)}}
@keyframes sl-other{0%,100%{transform:translate(0,0) rotate(0deg)}20%{transform:translate(0,-26px) rotate(-8deg)}40%{transform:translate(6px,-30px) rotate(10deg)}60%{transform:translate(-6px,-22px) rotate(-6deg)}80%{transform:translate(0,-6px) rotate(3deg)}}
@media (prefers-reduced-motion:reduce){.sl-fig .swing{animation:none;transform:rotate(var(--top))}}
</style>`;

function arcPath(top,finish){const r=78,pt=a=>{const t=a*Math.PI/180;return [100-Math.sin(t)*r,80+Math.cos(t)*r];};const [x0,y0]=pt(top),[x1,y1]=pt(finish),large=Math.abs(top-finish)>180?1:0;return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 ${large} 0 ${x1.toFixed(1)} ${y1.toFixed(1)}`;}

// 挥杆动作示范：label 为 full / partial / putt / other，tier 为 light / mid / heavy（默认 mid）。
export function motionSVG(label='full',tier='mid',{title=true,grip='vertical'}={}){
 const kind=AMPLITUDE[label]?label:'other',[top,finish]=kind==='other'?[0,0]:(AMPLITUDE[kind][tier]||AMPLITUDE[kind].mid);
 const arc=kind==='other'?'':`<path class="arc" d="${arcPath(top,finish)}"/>`;
 return `<svg class="sl-fig ${kind}" viewBox="0 0 200 220" role="img" aria-label="${title?MOTION_TIPS[kind]:''}" style="--top:${top}deg;--finish:${finish}deg">${STYLE}
 <line class="ground" x1="30" y1="206" x2="170" y2="206"/>${kind==='other'?'':'<circle class="ball" cx="100" cy="199" r="5"/>'}${arc}
 <path class="limb" d="M100 128L80 203M100 128L120 203M100 128L100 76"/><path class="limb" d="M84 82H116"/>
 <circle class="head" cx="100" cy="56" r="14"/>
 <g class="swing">${grip==='horizontal'?'<path class="arm" d="M86 83L97 148M114 83L103 148"/><rect class="device" x="85" y="146" width="30" height="16" rx="3.5"/><rect class="screen" x="88.5" y="148.5" width="23" height="11" rx="2"/><circle class="hands" cx="87" cy="154" r="5.5"/><circle class="hands" cx="113" cy="154" r="5.5"/>':'<path class="arm" d="M86 83L98 140M114 83L102 140"/><rect class="device" x="92.5" y="138" width="15" height="40" rx="3.5"/><rect class="screen" x="95" y="141" width="10" height="34" rx="2"/><circle class="hands" cx="100" cy="143" r="6"/><circle class="hands" cx="100" cy="153" r="6"/>'}</g>
</svg>`;
}

// 握持图解：竖握（推荐，像握球杆）或横握。
export function gripSVG(grip='vertical'){
 if(grip==='horizontal')return `<svg class="sl-fig sl-grip" viewBox="0 0 200 150" role="img" aria-label="横握：手机横放，双手握住两端，屏幕朝向自己">${STYLE}
 <rect class="device" x="34" y="46" width="132" height="66" rx="12"/><rect class="screen" x="44" y="54" width="112" height="50" rx="6"/>
 <text x="100" y="84" text-anchor="middle" font-size="12" font-weight="700" fill="#12372a">屏幕朝向自己</text>
 <path class="hands" d="M22 58c10-8 26-6 30 4l4 34c1 12-10 20-22 18-14-2-20-12-20-24 0-14 1-26 8-32z"/>
 <path class="hands" d="M178 58c-10-8-26-6-30 4l-4 34c-1 12 10 20 22 18 14-2 20-12 20-24 0-14-1-26-8-32z"/>
 <text x="100" y="30" text-anchor="middle" font-size="12" font-weight="800" fill="#36574a">横握 · 双手握两端</text>
 <path d="M100 124v14" stroke="#9db0a5" stroke-width="3" stroke-linecap="round" stroke-dasharray="3 4"/><text x="100" y="148" text-anchor="middle" font-size="10" fill="#36574a">手臂自然下垂，指向球</text>
</svg>`;
 return `<svg class="sl-fig sl-grip" viewBox="0 0 200 150" role="img" aria-label="竖握：双手上下叠握手机下半部，像握球杆一样，一端指向球">${STYLE}
 <rect class="device" x="80" y="8" width="40" height="112" rx="9"/><rect class="screen" x="85" y="14" width="30" height="100" rx="5"/>
 <text x="100" y="30" text-anchor="middle" font-size="9" font-weight="800" fill="#12372a">屏幕</text><text x="100" y="42" text-anchor="middle" font-size="9" font-weight="800" fill="#12372a">朝向自己</text>
 <path class="hands" d="M71 70c0-6 7-9 16-9h26c9 0 16 3 16 9v10c0 6-7 9-16 9H87c-9 0-16-3-16-9z"/>
 <path class="hands" d="M69 94c0-6 7-9 16-9h30c9 0 16 3 16 9v10c0 6-7 9-16 9H85c-9 0-16-3-16-9z"/>
 <path d="M100 124v14" stroke="#e9a400" stroke-width="4" stroke-linecap="round"/><path d="M93 132l7 8 7-8" stroke="#e9a400" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
 <text x="138" y="84" font-size="11" font-weight="800" fill="#36574a">双手</text><text x="138" y="98" font-size="11" font-weight="800" fill="#36574a">上下叠握</text>
 <text x="22" y="132" font-size="10" fill="#36574a">一端指向球</text>
</svg>`;
}
