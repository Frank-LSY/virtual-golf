// 体感钓鱼 · 规则与数据（初版）。参见 docs/FISHING-PRD.md。
// 世界坐标：米。玩家站在栈桥尽头（原点），面朝 -Z 的湖面；水面 y = 0。
// 方向角 angle：0° 为正前方，正值偏右（+X）。所有数值是可调初值，写入规则版本 RULES_VERSION。
export const RULES_VERSION='fishing-0.1';
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
 // 张力（游戏归一化，不是实测拉力）：0.25–0.70 有效；>0.9 持续 0.8 秒断线；<0.12 持续 1.5 秒脱钩。
 tension:Object.freeze({okLow:.25,okHigh:.7,danger:.9,breakTime:.8,slack:.12,slackTime:1.5,smooth:.12}),
 weed:Object.freeze({warn:1,escape:2}),
 // 上岸：距岸 1.8 米内、体力 < 0.2、张力 0.2–0.75，持续 0.6 秒自动抄起。
 land:Object.freeze({distance:1.8,stamina:.2,tension:[.2,.75],hold:.6}),
 lostShow:1.2,landedShow:2,
 // 比赛：两轮；所有人同时钓，各自独立的鱼池；到时已刺中的鱼最多收尾 10 秒。
 match:Object.freeze({rounds:2,roundSeconds:90,choices:[60,90,120],finish:10,countdown:3,intermission:6,resume:1.5})
});

// 三个钓区：浅湾（左前近）、芦苇口（右前中，左右和后方是水草）、深水（正前远，浮标标出）。
export const ZONES=Object.freeze([
 Object.freeze({id:'shallow',name:'浅湾',distance:9,angle:-30,radius:3,fish:'small',color:'#5fd3c6',rounds:[1,2]}),
 Object.freeze({id:'reeds',name:'芦苇口',distance:16,angle:27,radius:2.2,fish:'perch',color:'#8fcf4a',rounds:[1,2]}),
 Object.freeze({id:'deep',name:'深水',distance:26,angle:2,radius:2.5,fish:'big',color:'#3f7fd6',rounds:[2]})
]);
export const zoneById=id=>ZONES.find(z=>z.id===id)||null;
// 钓区自己的坐标系：forward 由岸边指向钓区中心，right 指向右侧。
export function zoneFrame(zone){const c=polar(zone.distance,zone.angle),a=rad(zone.angle),forward={x:Math.sin(a),z:-Math.cos(a)},right={x:Math.cos(a),z:Math.sin(a)};return {center:c,forward,right,at:(r,f)=>({x:c.x+right.x*r+forward.x*f,z:c.z+right.z*r+forward.z*f})};}
// 水草（芦苇口左右两侧与后方）：圆形危险带。入口清水宽约 4 米。
export const WEEDS=Object.freeze((()=>{const f=zoneFrame(zoneById('reeds'));return [{...f.at(-3.9,.4),r:1.8},{...f.at(3.9,.4),r:1.8},{...f.at(0,4.2),r:2.4},{...f.at(-3.2,3.4),r:1.5},{...f.at(3.2,3.4),r:1.5}].map(Object.freeze);})());
export const inWeeds=(x,z,pad=0)=>WEEDS.some(w=>Math.hypot(x-w.x,z-w.z)<w.r+pad);

// 三类鱼（游戏化角色）。strength：冲刺力度；stamina：体力倍数；dashes：最多冲刺次数。
export const FISH=Object.freeze({
 small:Object.freeze({id:'small',name:'浅湾小鱼',points:100,strength:.55,stamina:1,dashes:1,dashTime:1,swim:[2.6,4.2],telegraph:.8,sideways:false,prefer:'drag',size:[20,30],color:'#9fd8ff'}),
 perch:Object.freeze({id:'perch',name:'芦苇鲈鱼',points:220,strength:.75,stamina:1.2,dashes:3,dashTime:1.4,swim:[2.2,3.6],telegraph:.8,sideways:true,prefer:'twitch',size:[32,45],color:'#9ccf5a'}),
 big:Object.freeze({id:'big',name:'深水大鱼',points:400,strength:1,stamina:1.55,dashes:2,dashTime:2,swim:[3,4.6],telegraph:1,sideways:false,prefer:'dragpause',size:[62,88],color:'#3b5f9e'})
});
// 诱鱼节奏：drag 缓拖、twitch 轻抽、pause 停顿、dragpause 缓拖后停顿、still 一直不动、other 乱动。
export const RHYTHM=Object.freeze({
 small:Object.freeze({drag:1.9,dragpause:1.2,pause:1,still:.9,twitch:.8,other:.7}),
 perch:Object.freeze({twitch:1.9,drag:.9,dragpause:.8,pause:.7,still:.6,other:.7}),
 big:Object.freeze({dragpause:1.9,drag:1.2,pause:1,still:.8,twitch:.5,other:.6})
});
export const RHYTHM_NAMES=Object.freeze({drag:'缓拖',twitch:'轻抽',dragpause:'缓拖后停顿',pause:'停顿',still:'不动',other:'乱动'});
export const PREFER_TIPS=Object.freeze({small:'慢慢抬、慢慢放（缓拖）',perch:'短促地轻轻一抬（轻抽）',big:'缓拖一下，再停住等它'});

// 固定赛题：每个钓区 6 个鱼槽（固定顺序），每条鱼有自己的子种子；所有人用同一份赛题、各自独立的鱼池。
export function scenario(seed=1){
 const r=seededRandom(seed),zones={};
 for(const z of ZONES){const t=FISH[z.fish];zones[z.id]=Array.from({length:6},(_,i)=>Object.freeze({slot:i,zone:z.id,type:z.fish,size:Math.round(lerp(t.size[0],t.size[1],r())),seed:(r()*4294967296)>>>0,side:r()<.5?-1:1,approach:lerp(.92,1.08,r())}));}
 return Object.freeze({seed:seed>>>0,version:RULES_VERSION,zones});
}
// 比赛轮次开放的钓区；练习全部开放。
export const zonesOpen=(round,practice)=>ZONES.filter(z=>practice||z.rounds.includes(round)).map(z=>z.id);
export function zoneAt(x,z,open=ZONES.map(z=>z.id)){for(const zone of ZONES){const c=polar(zone.distance,zone.angle);if(Math.hypot(x-c.x,z-c.z)<=zone.radius)return {zone,open:open.includes(zone.id)};}return null;}
// 抛投距离：力量 0–1 → 6–30 米（轻、中、重近似线性，超过满力不再增加）。
export const castDistance=power=>FISHING.cast.min+(FISHING.cast.max-FISHING.cast.min)*Math.pow(clamp(power,0,1),.95);
// 左右倾 → 瞄准方向（死区 2°、满量程 25° → ±50°）。
export function aimFromRoll(roll){const P=FISHING.pose,C=FISHING.cast,a=Math.abs(roll);if(a<C.aimDead)return 0;return Math.sign(roll)*clamp((a-C.aimDead)/(P.full-C.aimDead),0,1)*C.aimRange;}
export const VERSUS_PALETTE=Object.freeze([
 Object.freeze({key:'red',name:'红色',color:'#ff5d5d'}),Object.freeze({key:'blue',name:'蓝色',color:'#3fa9ff'}),Object.freeze({key:'yellow',name:'黄色',color:'#ffc93c'}),
 Object.freeze({key:'green',name:'绿色',color:'#3ddc97'}),Object.freeze({key:'purple',name:'紫色',color:'#a77bff'}),Object.freeze({key:'orange',name:'橙色',color:'#ff9440'})
]);
