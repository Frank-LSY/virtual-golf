// 体感钓鱼 · 规则与数据。参见 docs/FISHING.md（0.29 起：开放水域 + 转轮收线）与 docs/FISHING-PRD.md。
// 世界坐标：米。玩家站在栈桥尽头（原点），面朝 -Z 的湖面；水面 y = 0。
// 方向角 angle：0° 为正前方，正值偏右（+X）。所有数值是可调初值，写入规则版本 RULES_VERSION。
export const RULES_VERSION='fishing-0.2';
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const lerp=(a,b,t)=>a+(b-a)*t;
export const rad=d=>d*Math.PI/180;
export const deg=r=>r*180/Math.PI;
export function seededRandom(seed){let a=(seed>>>0)||1;return ()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
// 水面上的点：距离 d、方向角 angle。
export const polar=(d,angle)=>({x:d*Math.sin(rad(angle)),z:-d*Math.cos(rad(angle))});
export const toPolar=(x,z)=>({d:Math.hypot(x,z),angle:deg(Math.atan2(x,-z))});

export const FISHING=Object.freeze({
 maxPlayers:6,step:1/60,
 // 竿姿：相对握姿基准的抬放角 pitch（抬起为正）与左右侧倾 roll（右倾为正），满量程约 25°。
 pose:Object.freeze({full:25,pitchMin:-30,pitchMax:40,rollMax:40,stale:.5}),
 // 瞄准与抛投：左右倾满量程 25° 对应 ±50° 扇区；挥动方向修正最多 ±8°；距离 6–30 米。
 cast:Object.freeze({window:5,aimRange:50,aimDead:2,dirCorrection:8,min:6,max:30,flightBase:.45,flightPerMeter:.028,reel:.6}),
 // 诱鱼：接近进度 0→1，基础速度 0.17/秒；节奏对路 ×1.9、不对 ×0.55；进度 0.55 / 0.8 时试探，1 时真咬。
 approach:Object.freeze({base:.17,gap:[4,6],nibbles:[.55,.8],spookAbove:.4,spookLoss:.4,spookPause:2,missCooldown:2.5,emptyHint:4}),
 bite:Object.freeze({window:.9,practice:1.2}),
 // 刺鱼：0.4 秒内抬竿至少 12° 且速度不低于 40°/秒；超过不加收益。
 // 0.28.1：诱鱼时要抬到 18° 以上才会吓跑鱼（以前和刺鱼同一个门槛，正常诱鱼动作也会吓跑）。
 hook:Object.freeze({lift:12,spook:18,time:.4,minRate:40,cooldown:.5}),
 // 0.29 收线（参考“黄金矿工”：东西越重收得越慢，越值钱）：转轮每圈收 spool 米 × 1/(1+重量/weightK)；最多按 maxCrank 圈/秒算。
 // 张力（游戏归一化）≥ breakT 持续 breakTime 秒断线；鱼不冲时停手超过 slackTime 秒脱钩；鱼贴着两边的水草 / 石头超过 snagTime 秒缠住；
 // 鱼把线拉到 lineMax 米线就放光了；拉到离岸 landAt 米就上岸。键盘按住 W 按 keyboardCrank 圈/秒收线。
 reel:Object.freeze({spool:1.4,maxCrank:3.5,weightK:4,landAt:1.2,lineMax:34,breakT:.95,breakTime:.4,slackTime:3,snagTime:1.2,keyboardCrank:2.5,stale:.35}),
 tension:Object.freeze({danger:.85,smooth:.15}),
 lostShow:1.2,landedShow:2,
 // 比赛：两轮；所有人同时钓，各自独立的鱼池；到时已刺中的鱼最多收尾 10 秒。
 match:Object.freeze({rounds:2,roundSeconds:90,choices:[60,90,120],finish:10,countdown:3,intermission:6,resume:1.5})
});

// 0.29 开放水域：整片湖都能钓，不再只有固定钓区。不同水域的鱼情不同：咬口快慢、常见的鱼和杂物、两边是什么障碍。
// 判定：芦苇丛附近 = 芦苇边；否则按离岸远近分浅水（<12 米）/ 开阔水（<21 米）/ 深潭。
export const REEDS_AT=Object.freeze({distance:16,angle:27});
export const DEEP_AT=Object.freeze({distance:26,angle:2,radius:2.5});
export const WATERS=Object.freeze([
 Object.freeze({id:'shallow',name:'浅水',color:'#5fd3c6',bite:1.35,snag:'石头',width:3.6,hint:'近岸，咬口快，多是鲫鱼',table:Object.freeze({crucian:70,perch:10,carp:6,boot:8,can:6})}),
 Object.freeze({id:'reeds',name:'芦苇边',color:'#8fcf4a',bite:1.05,snag:'水草',width:2.6,hint:'鲈鱼多，中鱼后爱往水草里钻',table:Object.freeze({perch:55,crucian:18,carp:10,golden:4,boot:7,can:6})}),
 Object.freeze({id:'open',name:'开阔水',color:'#4fa9e0',bite:.9,snag:'石头',width:3.8,hint:'什么都有，鲤鱼最多',table:Object.freeze({carp:40,crucian:18,perch:14,big:10,golden:6,boot:7,can:5})}),
 Object.freeze({id:'deep',name:'深潭',color:'#3f7fd6',bite:.65,snag:'沉木',width:3.4,hint:'咬口慢，有大青鱼，偶尔捞到宝箱',table:Object.freeze({big:44,carp:20,golden:8,chest:8,boot:10,can:5,perch:5})})
]);
export const waterById=id=>WATERS.find(w=>w.id===id)||null;
export function waterAt(x,z){const r=polar(REEDS_AT.distance,REEDS_AT.angle);if(Math.hypot(x-r.x,z-r.z)<=6.5)return waterById('reeds');const d=Math.hypot(x,z);return waterById(d<12?'shallow':d<21?'open':'deep');}
// 某个点自己的坐标系：forward 由岸边指向该点，right 指向右侧（用来摆芦苇丛）。
export function zoneFrame(at){const c=polar(at.distance,at.angle),a=rad(at.angle),forward={x:Math.sin(a),z:-Math.cos(a)},right={x:Math.cos(a),z:Math.sin(a)};return {center:c,forward,right,at:(r,f)=>({x:c.x+right.x*r+forward.x*f,z:c.z+right.z*r+forward.z*f})};}
// 芦苇丛：抛进去会挂住。入口清水宽约 4 米。
export const WEEDS=Object.freeze((()=>{const f=zoneFrame(REEDS_AT);return [{...f.at(-3.9,.4),r:1.8},{...f.at(3.9,.4),r:1.8},{...f.at(0,4.2),r:2.4},{...f.at(-3.2,3.4),r:1.5},{...f.at(3.2,3.4),r:1.5}].map(Object.freeze);})());
export const inWeeds=(x,z,pad=0)=>WEEDS.some(w=>Math.hypot(x-w.x,z-w.z)<w.r+pad);

// 能钓上来的东西。kind：fish 鱼 / junk 杂物（很沉、几乎不值钱，可以剪线）/ treasure 宝箱（很沉、很值钱、不挣扎）。
// w：重量范围（千克，越重越少见）；分数 = base + perKg × 重量。strength 冲刺力度；stamina 体力倍数；dashes 冲刺次数；
// sideways 冲刺会往两边钻；prefer 爱的诱鱼节奏；len 体长（厘米，只用来显示）。
export const CATCHES=Object.freeze({
 crucian:Object.freeze({id:'crucian',kind:'fish',name:'鲫鱼',w:[.2,.6],base:40,perKg:110,strength:.45,stamina:.7,dashes:1,dashTime:.9,swim:[1.8,3],telegraph:.8,sideways:false,prefer:'drag',color:'#9fd8ff',len:[14,24]}),
 perch:Object.freeze({id:'perch',kind:'fish',name:'鲈鱼',w:[.6,1.4],base:80,perKg:110,strength:.7,stamina:1,dashes:3,dashTime:1.1,swim:[1.6,2.8],telegraph:.8,sideways:true,prefer:'twitch',color:'#9ccf5a',len:[28,42]}),
 carp:Object.freeze({id:'carp',kind:'fish',name:'鲤鱼',w:[1.5,3.5],base:60,perKg:80,strength:.7,stamina:1.3,dashes:2,dashTime:1.4,swim:[2,3.4],telegraph:.9,sideways:false,prefer:'dragpause',color:'#e0a43c',len:[40,60]}),
 big:Object.freeze({id:'big',kind:'fish',name:'大青鱼',w:[4,8],base:100,perKg:70,strength:1,stamina:1.6,dashes:3,dashTime:1.8,swim:[2.2,3.8],telegraph:1,sideways:false,prefer:'dragpause',color:'#3b5f9e',len:[70,100]}),
 golden:Object.freeze({id:'golden',kind:'fish',name:'金鳞鱼',w:[.7,1.3],base:420,perKg:60,strength:.85,stamina:.9,dashes:4,dashTime:.8,swim:[1.2,2.2],telegraph:.7,sideways:true,prefer:'twitch',color:'#ffc93c',len:[30,40]}),
 boot:Object.freeze({id:'boot',kind:'junk',name:'旧靴子',w:[1.6,2.6],base:5,perKg:0,color:'#7a6a55'}),
 can:Object.freeze({id:'can',kind:'junk',name:'铁罐头',w:[.6,1],base:2,perKg:0,color:'#9aa3ad'}),
 chest:Object.freeze({id:'chest',kind:'treasure',name:'小宝箱',w:[6,9],base:200,perKg:70,color:'#c98a2e'})
});
export const FISH=CATCHES;
export const catchPoints=(type,kg)=>{const c=CATCHES[type];return c?Math.round(c.base+c.perKg*kg):0;};
// 诱鱼节奏：drag 缓拖、twitch 轻抽、pause 停顿、dragpause 缓拖后停顿、still 一直不动、other 乱动。杂物和宝箱不挑。
const R_DRAG=Object.freeze({drag:1.9,dragpause:1.2,pause:1,still:.9,twitch:.8,other:.7}),R_TWITCH=Object.freeze({twitch:1.9,drag:.9,dragpause:.8,pause:.7,still:.6,other:.7}),R_PAUSE=Object.freeze({dragpause:1.9,drag:1.2,pause:1,still:.8,twitch:.5,other:.6}),R_ANY=Object.freeze({drag:1,dragpause:1,pause:1,still:1,twitch:1,other:1});
export const RHYTHM=Object.freeze({crucian:R_DRAG,perch:R_TWITCH,carp:R_PAUSE,big:R_PAUSE,golden:R_TWITCH,boot:R_ANY,can:R_ANY,chest:R_ANY});
export const RHYTHM_NAMES=Object.freeze({drag:'缓拖',twitch:'轻抽',dragpause:'缓拖后停顿',pause:'停顿',still:'不动',other:'乱动'});
export const PREFER_TIPS=Object.freeze({crucian:'慢慢抬、慢慢放（缓拖）',perch:'短促地轻轻一抬（轻抽）',carp:'缓拖一下，再停住等它',big:'缓拖一下，再停住等它',golden:'短促地轻轻一抬（轻抽）'});

// 固定赛题：每片水域一串 40 个“会来咬钩的东西”（固定顺序、各自的子种子）；所有人用同一份赛题、各自独立的进度。
export function scenario(seed=1){
 const r=seededRandom(seed),waters={};
 for(const w of WATERS){const entries=Object.entries(w.table),sum=entries.reduce((s,[,v])=>s+v,0);
  waters[w.id]=Array.from({length:40},(_,i)=>{let x=r()*sum,type=entries[0][0];for(const [k,v] of entries){if((x-=v)<0){type=k;break;}}const c=CATCHES[type],kg=Math.round(lerp(c.w[0],c.w[1],Math.pow(r(),1.4))*10)/10;return Object.freeze({slot:i,water:w.id,type,kg,seed:(r()*4294967296)>>>0,side:r()<.5?-1:1,approach:lerp(.9,1.1,r())});});}
 return Object.freeze({seed:seed>>>0,version:RULES_VERSION,waters});
}
// 抛投距离：力量 0–1 → 6–30 米（轻、中、重近似线性，超过满力不再增加）。
export const castDistance=power=>FISHING.cast.min+(FISHING.cast.max-FISHING.cast.min)*Math.pow(clamp(power,0,1),.95);
// 左右倾 → 瞄准方向（死区 2°、满量程 25° → ±50°）。
export function aimFromRoll(roll){const P=FISHING.pose,C=FISHING.cast,a=Math.abs(roll);if(a<C.aimDead)return 0;return Math.sign(roll)*clamp((a-C.aimDead)/(P.full-C.aimDead),0,1)*C.aimRange;}
export const VERSUS_PALETTE=Object.freeze([
 Object.freeze({key:'red',name:'红色',color:'#ff5d5d'}),Object.freeze({key:'blue',name:'蓝色',color:'#3fa9ff'}),Object.freeze({key:'yellow',name:'黄色',color:'#ffc93c'}),
 Object.freeze({key:'green',name:'绿色',color:'#3ddc97'}),Object.freeze({key:'purple',name:'紫色',color:'#a77bff'}),Object.freeze({key:'orange',name:'橙色',color:'#ff9440'})
]);
