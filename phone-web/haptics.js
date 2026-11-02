// 0.26 手机震动：所有手机控制器共用的一套“触感语言”。
// - 每种信号一个名字（击球、咬钩、撞墙、轮到你……），对应一段震动节奏；同类信号手感一致，不同信号一听就分得开。
// - 优先级：重要信号（咬钩、坠落、轮到你）会打断次要信号；正在震重要信号时，按键轻触之类的小信号直接跳过。
// - 限频：每种信号有最短间隔，连续的碰撞、张力警告不会震成一片。
// - 强度：关闭 / 轻 / 标准 / 强，只缩放“震”的时长，停顿不变，节奏保持可辨。另可单独关闭按键轻触。
// - 安卓 Chrome 等支持 navigator.vibrate 的浏览器：全部信号可用（浏览器要求页面先被点过一次）。
// - iPhone Safari 没有网页震动接口：用系统开关控件（<input type="checkbox" switch>）的触感做兜底，
//   iOS 18.4 起只在“点按之后约 1 秒内”生效，所以 iPhone 上主要是按键和点按触发的反馈，比赛事件仍靠画面和声音。
export const HAPTIC_KEY='swinglink-haptics';
export const HAPTIC_LEVELS=Object.freeze({off:{name:'关闭',scale:0},light:{name:'轻',scale:.65},normal:{name:'标准',scale:1},strong:{name:'强',scale:1.5}});
const clamp01=v=>Math.max(0,Math.min(1,Number.isFinite(v)?v:1));
const P=(pattern,pri=1,gap=0,ui=false)=>Object.freeze({pattern,pri,gap,ui});
// pattern：毫秒数组，奇数位为震、偶数位为停；也可以是 strength(0–1) → 数组 的函数。pri：0 最低 – 5 最高。gap：同名最短间隔。
export const HAPTICS=Object.freeze({
 // ---------- 界面 ----------
 tap:P([8],0,35,true),               // 点按按钮
 tick:P([5],0,40,true),              // 刻度：瞄准每 1°、镜头每一步
 select:P([12],1,60,true),           // 选中一个选项
 limit:P([16,40,16],1,250,true),     // 到头了（瞄准 ±80°、摇杆推到边）
 // ---------- 通用状态 ----------
 confirm:P([16,60,30],2,150),        // 完成 / 被接受：加入、保存、归零完成
 ready:P([10,50,10,50,28],2,400),    // 控制器就绪：启用体感、鱼竿 / 手柄可以用了
 nudge:P([8,40,8],1,300),            // 轻提醒：动作太小、准备超时
 warn:P([40,80,40],3,1200),          // 注意：数据中断、动作不像
 error:P([30,40,30,40,30],3,400),    // 被拒绝 / 无效
 offline:P([60,90,60],3,3000),       // 连接断开
 online:P([12,60,12],2,1500),        // 连接恢复
 switch:P([10,70,10,70,26],2,800),   // 电脑换了游戏，手机自动变身
 pause:P([30,90,30],3,500),          // 暂停
 count:P([24],3,250),                // 倒计时每一拍
 go:P([80],4,500),                   // 开始！
 success:P([20,40,20,40,90],4,600),  // 成功：过关、上岸、进洞
 win:P([30,50,30,50,30,50,200],5,1500), // 冠军 / 全部完成
 fail:P([90,70,150],4,600),          // 失败：坠落出局、鱼跑了
 turn:P([40,90,40,90,130],4,2000),   // 轮到你了
 whistle:P([50,80,50,80,50],4,1500), // 时间到 / 本轮结束
 // ---------- 高尔夫 ----------
 impact:P([55,30,15],4,300),         // 击球（计杆）
 rehearsal:P([14,50,10],2,300),      // 试挥：识别到了，但不击球
 armed:P([10,45,26],2,200),          // 已准备：下一挥击球
 disarm:P([10],1,200),               // 取消准备
 penalty:P([70,60,70],4,800),        // 下水 / 出界罚杆
 cue:P([24],3,600),                  // 采集：现在挥杆
 // ---------- 云端滚球（强度 = 碰撞力度） ----------
 wall:P(s=>[Math.round(10+40*s)],2,90),
 bump:P(s=>[Math.round(14+30*s),30,Math.round(8+16*s)],2,120),
 sweep:P(s=>[Math.round(28+40*s),40,24],3,200),
 clash:P(s=>[Math.round(16+46*s)],3,120),
 board:P([8],1,300),                 // 踏上移动平台
 boost:P([6,24,6,24,14],1,400),      // 加速带
 checkpoint:P([16,50,16,50,40],3,800),
 fall:P([40,40,130],4,800),          // 掉下去（单人：回到检查点）
 out:P([180,80,70],5,1500),          // 对战出局
 danger:P(s=>[Math.round(18+26*s),110,Math.round(30+30*s)],3,350), // 崩塌逼近（越近越重）
 stage:P([12,60,12,60,12],2,1200),   // 进入新赛段
 rival:P([10],1,500),                // 别人掉下去了
 // ---------- 体感钓鱼 ----------
 cast:P([8,30,14,30,24],2,300),      // 抛出
 splash:P([22],2,300),               // 落水
 nibble:P([12],2,200),               // 试探
 bite:P([40,60,40],4,400),           // 真咬：现在抬竿
 hook:P([45,30,20],4,300),           // 刺中
 spook:P([10,40,10],2,500),          // 抬早，鱼被吓退
 miss:P([30,60,12],2,500),           // 没抬起来
 empty:P([10,60,10],1,800),          // 附近没鱼 / 挂草
 reel:P([5],0,110),                  // 收线棘轮（0.29：转轮每 1/4 圈）
 strain:P(s=>[Math.round(30+40*s),Math.round(110-50*s),Math.round(30+40*s)],3,300), // 张力危险（越紧越急）
 slack:P([8,90,8],1,1600),           // 线松了
 telegraph:P([14,40,14],3,500),      // 鱼要冲刺
 dash:P([25,70,25],3,500),           // 冲刺中
 weed:P([30,50,30,50,30],3,900),     // 快进水草
 trophy:P([25,40,25,40,25,40,220],5,1500) // 深水大鱼上岸
});

const safeStorage=()=>{try{return globalThis.localStorage||null;}catch{return null;}};
const isApple=nav=>{const ua=nav?.userAgent||'';return /iPhone|iPad|iPod/.test(ua)||(/Macintosh/.test(ua)&&(nav?.maxTouchPoints||0)>1);};

export class Haptics{
 constructor({nav=globalThis.navigator,doc=globalThis.document,storage=safeStorage(),now=()=>globalThis.performance?.now?.()??Date.now(),timers=globalThis}={}){
  this.nav=nav;this.doc=doc;this.storage=storage;this.now=now;this.timers=timers;this.level='normal';this.taps=true;this.listeners=new Set();this.last=new Map();this.busyUntil=-Infinity;this.busyPri=-1;this.lastClick=-Infinity;this.activated=false;this.played=[];
  try{const v=JSON.parse(storage?.getItem(HAPTIC_KEY)||'null');if(v&&HAPTIC_LEVELS[v.level])this.level=v.level;if(typeof v?.taps==='boolean')this.taps=v.taps;}catch{}
  const vib=typeof nav?.vibrate==='function';let sw=false;try{sw=!vib&&isApple(nav)&&!!doc?.createElement&&typeof globalThis.HTMLInputElement==='function'&&'switch' in globalThis.HTMLInputElement.prototype;}catch{}
  this.backend=vib?'vibrate':sw?'ios':'none';
 }
 get supported(){return this.backend!=='none';}
 on(fn){this.listeners.add(fn);return ()=>this.listeners.delete(fn);}
 save(){try{this.storage?.setItem(HAPTIC_KEY,JSON.stringify({level:this.level,taps:this.taps}));}catch{}for(const fn of this.listeners)fn(this);}
 setLevel(level){if(!HAPTIC_LEVELS[level])return;this.level=level;this.save();}
 setTaps(on){this.taps=!!on;this.save();}
 note(){return this.backend==='vibrate'?'这台手机支持网页震动：击球、咬钩、碰撞、轮到你等信号都会震动提示。':this.backend==='ios'?'iPhone 网页不支持连续震动：只在点按按钮时有一下轻触（需要 iOS 18 以上，并打开“设置 › 声音与触感 › 系统触感反馈”）。比赛里的信号仍看画面、听声音。':'这台手机的浏览器不支持网页震动，画面和声音会提示所有信号。';}
 // 浏览器要求先有一次点按才能震动：记住是否点过（安卓），以及最近一次点按的时间（iPhone 只在点按后约 1 秒内有效）。
 bind(doc=this.doc){
  if(!doc?.addEventListener||this.bound)return;this.bound=true;
  const mark=()=>{this.activated=true;};for(const k of ['pointerdown','keydown','touchend'])doc.addEventListener(k,mark,{capture:true,passive:true});
  doc.addEventListener('click',e=>{this.activated=true;this.lastClick=this.now();const el=e?.target?.closest?.('button,summary,select,label,[role="button"],input[type="checkbox"],input[type="radio"]');if(!el||el.disabled||el.dataset?.haptic==='none')return;if(el.dataset?.haptic==='self'){if(this.backend==='ios')this.play('tap');return;}this.play(el.tagName==='SELECT'?'select':'tap');},{capture:true});
 }
 canFire(){if(this.backend==='vibrate')return this.activated||this.nav?.userActivation?.hasBeenActive!==false;if(this.backend==='ios')return this.now()-this.lastClick<900;return false;}
 // 实际发出的节奏（已按强度缩放）；返回 null 表示这次不震。
 play(name,{strength=1,force=false}={}){
  const def=HAPTICS[name],scale=HAPTIC_LEVELS[this.level]?.scale??1;if(!def||!this.supported||scale<=0)return null;if(def.ui&&!this.taps&&!force)return null;
  const t=this.now();if(!force&&t-(this.last.get(name)??-Infinity)<def.gap)return null;if(!force&&t<this.busyUntil&&def.pri<this.busyPri)return null;if(!this.canFire())return null;
  const raw=typeof def.pattern==='function'?def.pattern(clamp01(strength)):def.pattern,pattern=raw.map((ms,i)=>i%2?ms:Math.max(4,Math.min(320,Math.round(ms*scale))));
  this.last.set(name,t);this.busyUntil=t+pattern.reduce((a,b)=>a+b,0);this.busyPri=def.pri;this.played.push(name);if(this.played.length>40)this.played.shift();
  if(this.backend==='vibrate'){try{this.nav.vibrate(pattern.length===1?pattern[0]:pattern);}catch{}}else this.tick(pattern);
  return pattern;
 }
 // iPhone：每段“震”触发一次系统开关触感（最多 3 下，都在点按授权的 1 秒内）。
 tick(pattern){let at=0;const starts=[];for(let i=0;i<pattern.length;i+=2){starts.push(at);at+=pattern[i]+(pattern[i+1]||0);}for(const s of starts.filter(s=>s<700).slice(0,3)){if(s===0)this.switchTick();else this.timers.setTimeout?.(()=>this.switchTick(),s);}}
 switchTick(){try{const d=this.doc,label=d.createElement('label'),input=d.createElement('input');label.setAttribute('aria-hidden','true');label.style.display='none';input.type='checkbox';input.setAttribute('switch','');label.append(input);d.head.append(label);label.click();label.remove();}catch{}}
 stop(){this.busyUntil=-Infinity;this.busyPri=-1;if(this.backend==='vibrate'){try{this.nav.vibrate(0);}catch{}}}
}

// 设置面板（各控制器共用）：强度、按键轻触、试一下、说明。$ 按 id 取元素。
export function hapticsPanelHTML(prefix){return `<div class="hp-panel"><label class="hp-row"><span>震动强度</span><select id="${prefix}-hp-level" data-haptic="none">${Object.entries(HAPTIC_LEVELS).map(([k,v])=>`<option value="${k}">${v.name}</option>`).join('')}</select></label><label class="hp-check"><input type="checkbox" id="${prefix}-hp-taps"> 按键轻触</label><button type="button" id="${prefix}-hp-test" data-haptic="self">试一下</button><p class="hp-note" id="${prefix}-hp-note"></p></div>`;}
export function bindHapticsPanel($,prefix,h){
 const level=$(`${prefix}-hp-level`),taps=$(`${prefix}-hp-taps`),test=$(`${prefix}-hp-test`),note=$(`${prefix}-hp-note`);if(!level)return;
 const sync=()=>{level.value=h.level;taps.checked=h.taps;taps.disabled=h.level==='off'||!h.supported;level.disabled=!h.supported;test.disabled=!h.supported||h.level==='off';note.textContent=h.note();};
 level.onchange=()=>{h.setLevel(level.value);h.play('confirm',{force:true});};taps.onchange=()=>{h.setTaps(taps.checked);if(taps.checked)h.play('tap',{force:true});};
 test.onclick=()=>{h.play(h.backend==='ios'?'confirm':'success',{force:true});};h.on(sync);sync();
}

export const haptics=new Haptics();
