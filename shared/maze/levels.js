// World units: metres. Y is up; the first road runs toward -Z.
// 0.21：九张地图分三章；新增机关——弹射柱、旋转扫杆、加速带、冰面 / 云絮路面、往返浮台。
export const point=(x,z,y=6)=>({x,y,z});
// surface：'ice' 冰面（很滑、难转向）/ 'fluff' 云絮（很黏、自然减速）；不写为普通路面。
const road=(id,a,b,width=6,rails=true,surface)=>({id,a,b,width,rails,...(surface?{surface}:{})});
const platform=(id,x,z,y=6,size=8,rails=true,surface)=>({id,x,z,y,size,rails,...(surface?{surface}:{})});
const checkpoint=(id,x,z,y,heading=0)=>({id,x,z,y,heading,radius:2});
const obstacle=(roadId,t,travel=2,period=4.8,phase=0)=>({roadId,t,travel,period,phase,width:1.5,depth:1.25,height:1.4});
// 弹射柱：碰到会被弹开（至少 5.5 米/秒）。
const bumper=(id,x,z,y=6,radius=.75)=>({id,x,z,y,radius,height:1.1});
// 旋转扫杆：中心立柱 + 绕立柱转动的横杆（arms=2 为贯穿两侧的长杆，1 为单臂）。speed 为弧度/秒。
const sweeper=(id,x,z,y=6,length=4,speed=1,phase=0,arms=2)=>({id,x,z,y,length,speed,phase,arms,width:.36,height:.9,post:.42});
// 加速带：铺在某段道路 t0–t1 之间，沿道路前进方向推一把，并短暂提高速度上限。
const boost=(id,roadId,t0,t1,power=15)=>({id,roadId,t0,t1,power});
// 往返浮台：在 a、b 两个停靠位置之间往返，两端各停 20% 的周期；球站在上面会被带着走。
const mover=(id,a,b,y,hx,hz,period=10,phase=0)=>({id,a,b,y,hx,hz,period,phase});
const p=point;
const BASE=[
 {id:'breeze',name:'初航 · 学会控制',lesson:'轻倾加速，反向刹车',subtitle:'宽道和缓弯，先熟悉小球的重量。',color:'#24b8c2',accent:'#ffce62',spawn:p(0,2),heading:0,
  roads:[road('launch',p(0,4),p(0,-20),7),road('rise',p(0,-20),p(0,-36,8.4),7),road('upper',p(0,-36,8.4),p(0,-48,8.4),7),road('turn',p(0,-48,8.4),p(24,-48,8.4),7),road('open',p(24,-48,8.4),p(24,-65,8.4),6.2,false),road('home',p(24,-65,8.4),p(24,-85,8.4),7)],
  platforms:[platform('start',0,3,6,9),platform('bend',0,-48,8.4,10),platform('rest',24,-48,8.4,10),platform('finish',24,-85,8.4,11)],
  checkpoints:[checkpoint('turn',0,-46,8.4,Math.PI/2),checkpoint('bridge',24,-48,8.4,0)],goal:{...p(24,-85,8.4),radius:2.35},obstacles:[],
  routes:{main:[p(0,2),p(0,-44,8.4),p(0,-48,8.4),p(24,-48,8.4),p(24,-85,8.4)]},
  signs:[{...p(0,-16),text:'上坡 · 保持轻倾'},{...p(0,-42,8.4),text:'前方右转 · 提前刹车'},{...p(24,-54,8.4),text:'无护栏 · 小幅修正'}],strategy:'右转前先减速，再往右轻推。最后一段有一小段无护栏道路，稳住方向比一直加速更重要。'},
 {id:'rhythm',name:'逐风 · 学会节奏',lesson:'先观察，再通过',subtitle:'上下坡、窄桥与会移动的挡块。',color:'#8075dc',accent:'#ffbd67',spawn:p(0,2),heading:0,
  roads:[road('launch',p(0,4),p(0,-18),7),road('rise',p(0,-18),p(0,-38,9.2),7),road('approach',p(0,-38,9.2),p(0,-46,9.2),7),road('gate',p(0,-46,9.2),p(25,-46,9.2),6.4),road('ramp-entry',p(25,-46,9.2),p(25,-51,9.2),6.4),road('down',p(25,-51,9.2),p(25,-70,6.2),6.4),road('ramp-exit',p(25,-70,6.2),p(25,-76,6.2),6.4),road('bridge',p(25,-76,6.2),p(25,-93,6.2),3.4,false),road('turn',p(25,-93,6.2),p(4,-93,6.2),6.4),road('home',p(4,-93,6.2),p(4,-115,6.2),6.4)],
  platforms:[platform('start',0,3,6,9),platform('wait',0,-46,9.2,10),platform('slope',25,-46,9.2,10),platform('bridge-head',25,-76,6.2,8),platform('bridge-end',25,-93,6.2,9),platform('corner',4,-93,6.2,9),platform('finish',4,-115,6.2,11)],
  checkpoints:[checkpoint('gate',0,-46,9.2,Math.PI/2),checkpoint('bridge',25,-76,6.2,0),checkpoint('return',25,-93,6.2,-Math.PI/2)],goal:{...p(4,-115,6.2),radius:2.35},obstacles:[obstacle('gate',.48,2.1,5.2)],
  routes:{main:[p(0,2),p(0,-46,9.2),p(25,-46,9.2),p(25,-76,6.2),p(25,-93,6.2),p(4,-93,6.2),p(4,-115,6.2)]},
  signs:[{...p(0,-40,9.2),text:'安全平台 · 等一个时机'},{...p(25,-61,7.62),text:'下坡先刹车'},{...p(25,-80,6.2),text:'窄桥 · 保持居中'}],strategy:'挡块前的平台可以停球观察。下坡会自然加速，到桥头先稳住；过桥即有检查点，坠落不用从起点重跑。'},
 {id:'choice',name:'云岔 · 学会规划',lesson:'近路考控制，稳路留余量',subtitle:'两条真实分支，汇合后再迎接最后一段。',color:'#ef8c70',accent:'#54c5d8',spawn:p(0,2),heading:0,
  roads:[road('launch',p(0,4),p(0,-25),7),road('short',p(0,-25),p(0,-85),2.6,false),road('safe-out',p(0,-25),p(-24,-25),7.2),road('safe-flat',p(-24,-25),p(-24,-31),7.2),road('safe-rise',p(-24,-31),p(-24,-48,8.7),7.2),road('safe-gate',p(-24,-48,8.7),p(-24,-61,8.7),7.2),road('safe-down',p(-24,-61,8.7),p(-24,-78),7.2),road('safe-exit',p(-24,-78),p(-24,-85),7.2),road('merge',p(-24,-85),p(0,-85),7.2),road('last',p(0,-85),p(0,-106),6.4),road('east',p(0,-106),p(21,-106),6.4),road('home',p(21,-106),p(21,-127),6.4)],
  platforms:[platform('start',0,3,6,9),platform('fork',0,-25,6,10),platform('safe-corner',-24,-25,6,10),platform('safe-end',-24,-85,6,10),platform('merge',0,-85,6,11),platform('corner',0,-106,6,10),platform('bend',21,-106,6,10),platform('finish',21,-127,6,11)],
  checkpoints:[checkpoint('fork',0,-25,6,0),checkpoint('safe',-24,-25,6,0),checkpoint('merge',0,-85,6,0),checkpoint('final',21,-106,6,0)],goal:{...p(21,-127),radius:2.35},obstacles:[obstacle('safe-gate',.5,2.5,5.8,1),obstacle('east',.52,2.1,5.2,.6)],
  routes:{short:[p(0,2),p(0,-25),p(0,-85),p(0,-106),p(21,-106),p(21,-127)],safe:[p(0,2),p(0,-25),p(-24,-25),p(-24,-85),p(0,-85),p(0,-106),p(21,-106),p(21,-127)]},
  signs:[{...p(0,-19),text:'前方岔路 · 先停稳'},{...p(0,-32),text:'直行近路 · 无护栏'},{...p(-14,-25),text:'左转稳路 · 宽道护栏'},{...p(0,-94),text:'已汇合 · 看好下一弯'}],strategy:'直行近路只有 2.6 米宽、没有护栏；左转稳路多绕约 48 米，有护栏和缓坡，需要通过一个慢挡块。两路汇合后共享检查点。'}
];
// ---------- 第二章：机关云港 ----------
const MORE=[
 {id:'bounce',name:'弹弹花园 · 学会借力',lesson:'加速带冲坡，绕开弹射柱',subtitle:'第一次遇到机关：会推你一把的地面，会把你弹开的柱子。',color:'#ff9f43',accent:'#ffe066',spawn:p(0,2),heading:0,
  roads:[road('launch',p(0,4),p(0,-14),7),road('dash',p(0,-14),p(0,-38,10),6.5),road('out',p(0,-50,10),p(26,-50,10),6),road('down',p(26,-55,10),p(26,-72,7),6),road('brake',p(26,-72,7),p(26,-88,7),6,true,'fluff')],
  platforms:[platform('start',0,3,6,9),platform('garden',0,-46,10,16),platform('loop',26,-50,10,10),platform('finish',26,-88,7,11)],
  bumpers:[bumper('b1',0,-43.4,10),bumper('b2',-3.6,-47.6,10),bumper('b3',3.9,-47.4,10),bumper('b4',-5.6,-52.6,10),bumper('b5',5.6,-52.4,10),bumper('b6',29.2,-46.8,10,.7),bumper('b7',29.2,-53.2,10,.7)],
  boosts:[boost('ramp','dash',.04,.3,15),boost('kick','out',.5,.66,12)],
  checkpoints:[checkpoint('garden',0,-39.6,10,0),checkpoint('loop',26,-50,10,0)],goal:{...p(26,-88,7),radius:2.35},obstacles:[],
  routes:{main:[p(0,2),p(0,-38.6,10),p(2.3,-41.2,10),p(2.3,-45.6,10),p(1.4,-50,10),p(26,-50,10),p(26,-82,7),p(26,-88,7)]},
  signs:[{...p(0,-10),text:'加速带 · 借力冲坡'},{...p(0,-37,10),text:'弹射柱 · 绕开或借力'},{...p(26,-60,8.64),text:'下坡尽头是云絮 · 会变慢'}],strategy:'橙色箭头是加速带，踩上去会被推一把，正好冲上长坡。花园里的弹射柱一碰就把你弹开，贴着边绕过去最稳；下坡尽头的云絮路面会自然减速。'},
 {id:'windmill',name:'风车桥 · 学会等待',lesson:'看准扫杆，躲进角落',subtitle:'三座会转的风车平台，角落是安全区。',color:'#2fbf71',accent:'#ffd166',spawn:p(0,2),heading:0,
  roads:[road('launch',p(0,4),p(0,-19.5),7),road('bridge',p(0,-33),p(0,-53),3.2,false),road('east',p(5,-58),p(16,-58),5),road('home',p(22,-64),p(22,-86),6)],
  platforms:[platform('start',0,3,6,9),platform('mill1',0,-26,6,14),platform('mill2',0,-58,6,10,false),platform('mill3',22,-58,6,12),platform('finish',22,-86,6,11)],
  sweepers:[sweeper('s1',0,-26,6,6.1,.55,0),sweeper('s2',0,-58,6,4.4,1.15,1.2,1),sweeper('s3',22,-58,6,5.6,-.7,.4)],
  checkpoints:[checkpoint('bridge',0,-35,6,0),checkpoint('east',11,-58,6,Math.PI/2),checkpoint('home',22,-67,6,0)],goal:{...p(22,-86),radius:2.35},obstacles:[],
  routes:{main:[p(0,2),{...p(0,-18.4),clear:true},p(1.8,-20.3),{...p(6,-20.1),clear:true},{...p(6,-31.9),clear:true},p(1,-32.3),p(0,-34.5),{...p(0,-51.2),clear:true},p(5.8,-58),{...p(14.4,-58),clear:true},p(16.8,-59.4),{...p(16.9,-63.1),clear:true},p(19.8,-63.2),p(22,-65.6),p(22,-86)]},
  signs:[{...p(0,-16),text:'风车 · 等它转过去'},{...p(0,-46),text:'无护栏 · 会被扫下去'},{...p(13,-58),text:'角落是安全区'}],strategy:'风车横杆会把球推开。先在平台外停稳，等横杆转过去再进；平台四个角横杆够不着，可以躲进去再等下一次。第二座风车没有护栏，被扫到就会掉下去。'},
 {id:'ferry',name:'浮台渡口 · 学会搭乘',lesson:'等浮台靠岸，上去别乱动',subtitle:'三段往返浮台，靠岸时只停一小会儿。',color:'#4b7bec',accent:'#ffd36e',spawn:p(0,2),heading:0,
  roads:[road('launch',p(0,4),p(0,-16),7),road('pier',p(0,-48),p(24,-48),5),road('home',p(50,-74),p(50,-98),6)],
  platforms:[platform('start',0,3,6,9),platform('dock1',0,-20,6,8),platform('dock2',0,-48,6,8),platform('dock3',24,-48,6,8),platform('dock4',50,-48,6,8),platform('dock5',50,-74,6,8),platform('finish',50,-98,6,11)],
  movers:[mover('ferry1',p(0,-27),p(0,-41),6,3,3,12,0),mover('ferry2',p(31,-48),p(43,-48),6,3,3,11,.3),mover('ferry3',p(50,-54.5),p(50,-67.5),6,2.5,2.5,10,.55)],
  checkpoints:[checkpoint('dock2',0,-47,6,Math.PI/2),checkpoint('dock4',50,-47,6,0),checkpoint('dock5',50,-73,6,0)],goal:{...p(50,-98),radius:2.35},obstacles:[],
  routes:{main:[p(0,2),{...p(0,-22.9),board:'ferry1',from:'a'},p(0,-48),p(24,-48),{...p(26.9,-48),board:'ferry2',from:'a'},p(50,-48),{...p(50,-50.9),board:'ferry3',from:'a'},p(50,-74),p(50,-98)]},
  signs:[{...p(0,-17),text:'等浮台靠岸再上'},{...p(12,-48),text:'站在中间 · 随它过河'},{...p(50,-51),text:'最后一段浮台更小'}],strategy:'浮台靠岸时会停 2 秒左右，在岸边等它，靠岸后立刻上去，站到中间不动，它会把你送到对岸；到岸停稳再下来。错过了不要追，等下一趟。'},
// ---------- 第三章：极光高空 ----------
 {id:'icefall',name:'冰晶滑道 · 学会滑行',lesson:'冰面难转向，云絮能刹车',subtitle:'下坡冰道、无护栏冰桥和之字形冰廊。',color:'#3ec5f0',accent:'#ffffff',spawn:p(0,2),heading:0,
  roads:[road('launch',p(0,4),p(0,-12),7),road('slide',p(0,-12),p(0,-41,3),5,true,'ice'),road('glide',p(0,-46,3),p(26,-46,3),6.5,false,'ice'),road('zig1',p(26,-46,3),p(26,-62,3),4.5,true,'ice'),road('zig2',p(26,-66,3),p(8,-66,3),4.5,true,'ice'),road('zig3',p(8,-66,3),p(8,-90,3),4.5,true,'ice')],
  platforms:[platform('start',0,3,6,9),platform('snowbank',0,-46,3,10,true,'fluff'),platform('ledge',26,-46,3,9),platform('z1',26,-66,3,8,true,'fluff'),platform('z2',8,-66,3,8,true,'fluff'),platform('finish',8,-90,3,11,true,'fluff')],
  checkpoints:[checkpoint('snowbank',0,-45,3,Math.PI/2),checkpoint('ledge',26,-46,3,0),checkpoint('z2',8,-66,3,0)],goal:{...p(8,-90,3),radius:2.35},obstacles:[],
  routes:{main:[p(0,2),p(0,-44,3),p(1.5,-46,3),p(26,-46,3),p(26,-66,3),p(8,-66,3),p(8,-90,3)]},
  signs:[{...p(0,-10),text:'冰面 · 很滑'},{...p(4,-46,3),text:'无护栏冰桥 · 提前对准'},{...p(26,-56,3),text:'云絮平台可以刹车'}],strategy:'冰面上加速和转向都只有平时的三分之一，松手也几乎不减速。下冰坡后在云絮上停稳、对准方向，再用很小的力气滑过无护栏冰桥；之字形冰廊靠云絮平台转弯。'},
 {id:'labyrinth',name:'云絮迷宫 · 学会选择',lesson:'窄路要等时机，绕路有弹射柱',subtitle:'直行窄道只有一个挡块，绕行路线是云絮和弹射柱。',color:'#a46cf0',accent:'#ffd166',spawn:p(0,2),heading:0,
  roads:[road('launch',p(0,4),p(0,-16),7),road('needle',p(0,-20.5),p(0,-51),3.2,false),road('east1',p(0,-16),p(20,-16),6,true,'fluff'),road('north1',p(20,-16),p(20,-36),6),road('north2',p(20,-36),p(20,-56),6,true,'fluff'),road('west2',p(20,-56),p(0,-56),6),road('final',p(0,-56),p(0,-80),6)],
  platforms:[platform('start',0,3,6,9),platform('hub',0,-16,6,9),platform('pad1',20,-16,6,9),platform('pad2',20,-36,6,9),platform('pad3',20,-56,6,9),platform('merge',0,-56,6,10),platform('finish',0,-80,6,11)],
  bumpers:[bumper('p1a',23,-13,6,.7),bumper('p1b',17,-19.5,6,.6),bumper('p2a',23,-33,6,.7),bumper('p2b',17,-39,6,.7),bumper('p3a',23,-59,6,.7),bumper('f1',-1.6,-64,6,.7),bumper('f2',1.6,-69,6,.7)],
  checkpoints:[checkpoint('hub',0,-16,6,0),checkpoint('pad2',20,-36,6,0),checkpoint('merge',0,-56,6,0)],goal:{...p(0,-80),radius:2.35},obstacles:[obstacle('needle',.5,1,4.6)],
  routes:{short:[p(0,2),p(0,-16),{...p(0,-27),clear:true},{...p(-.95,-40),speed:3},p(0,-56),p(0,-60),p(1.4,-64),p(-1.2,-69),p(0,-74),p(0,-80)],safe:[p(0,2),p(0,-16),p(20,-16),p(20,-36),p(20,-56),p(0,-56),p(0,-60),p(1.4,-64),p(-1.2,-69),p(0,-74),p(0,-80)]},
  signs:[{...p(0,-24),text:'直行窄道 · 等挡块让路'},{...p(9,-16),text:'绕行 · 云絮会拖慢你'},{...p(0,-61),text:'弹射柱 · 左右穿过'}],strategy:'直行窄道没有护栏，中间的挡块左右摆动，要等它摆到一边再从另一边过；右侧绕行路线全程有护栏，但云絮路面很慢，平台上还有弹射柱。两路在汇合平台相遇，最后一段要左右穿过两根弹射柱。'},
 {id:'crown',name:'天空之冠 · 全部用上',lesson:'冲坡、等风车、搭浮台、过冰廊',subtitle:'最后一关：把学过的机关连成一条路。',color:'#ffb142',accent:'#7bdff2',spawn:p(0,2),heading:0,
  roads:[road('launch',p(0,4),p(0,-12),7),road('ascent',p(0,-12),p(0,-30,11),6),road('apron',p(0,-30,11),p(0,-34.5,11),6),road('span',p(7,-41,11),p(22,-41,11),5),road('icebridge',p(52,-45,11),p(52,-64.5,11),5,true,'ice'),road('final',p(47.5,-69,11),p(32,-69,11),6)],
  platforms:[platform('start',0,3,6,9),platform('crown1',0,-41,11,14),platform('dockA',26,-41,11,8),platform('dockB',52,-41,11,8),platform('fluffpad',52,-69,11,9,true,'fluff'),platform('finish',26,-69,11,12)],
  boosts:[boost('ascent','ascent',.06,.36,16)],
  sweepers:[sweeper('c1',0,-41,11,6.6,.6,.8)],
  movers:[mover('lift',p(33,-41),p(45,-41),11,3,3,11,0)],
  bumpers:[bumper('i1',50.9,-51,11),bumper('i2',53.1,-58,11)],
  checkpoints:[checkpoint('apron',0,-32.2,11,0),checkpoint('dockA',26,-41,11,Math.PI/2),checkpoint('dockB',52,-41,11,0),checkpoint('fluffpad',52,-69,11,-Math.PI/2)],goal:{...p(26,-69,11),radius:2.35},obstacles:[obstacle('final',.5,2.1,5)],
  routes:{main:[p(0,2),{...p(0,-32.4,11),clear:true},p(1.6,-34.8,11),{...p(6.1,-34.9,11),clear:true},p(6.2,-40.2,11),p(8,-41,11),p(26,-41,11),{...p(28.9,-41,11),board:'lift',from:'a'},p(52,-41,11),p(52,-46,11),p(53.4,-51,11),p(50.6,-58,11),p(52,-64,11),p(52,-69,11),{...p(44.5,-69,11),clear:true},p(35,-69,11),p(26,-69,11)]},
  signs:[{...p(0,-9),text:'最后一关 · 冲坡'},{...p(14,-41,11),text:'浮台 · 等它靠岸'},{...p(52,-47,11),text:'冰廊 · 弹射柱'},{...p(40,-69,11),text:'最后的挡块'}],strategy:'借加速带冲上高台，在风车外等横杆转过去，从角落绕到右侧出口；浮台靠岸再上，冰廊里左右避开弹射柱，在云絮平台停稳，最后等挡块让开就是终点。'}
];
// 章节与标准用时（秒）：标准用时按自动测试走完全程的时间留余量设定。
export const CHAPTERS=Object.freeze([
 {id:'isles',name:'启程群岛',subtitle:'控制、节奏与选路',color:'#24b8c2',levels:['breeze','rhythm','choice']},
 {id:'harbor',name:'机关云港',subtitle:'加速带、弹射柱、风车与浮台',color:'#ff9f43',levels:['bounce','windmill','ferry']},
 {id:'aurora',name:'极光高空',subtitle:'冰面、云絮与终极挑战',color:'#7b6cf6',levels:['icefall','labyrinth','crown']}
]);
const PAR={breeze:55,rhythm:75,choice:70,bounce:55,windmill:65,ferry:75,icefall:65,labyrinth:45,crown:75};
export const LEVELS=[...BASE,...MORE].map(l=>({...l,bumpers:l.bumpers||[],sweepers:l.sweepers||[],boosts:l.boosts||[],movers:l.movers||[],chapter:CHAPTERS.findIndex(c=>c.levels.includes(l.id)),par:PAR[l.id]}));
export function roadFrame(r){const dx=r.b.x-r.a.x,dz=r.b.z-r.a.z,length=Math.hypot(dx,dz),forward={x:dx/length,z:dz/length};return {length,forward,right:{x:-forward.z,z:forward.x},slope:(r.b.y-r.a.y)/length,heading:Math.atan2(forward.x,-forward.z)};}
export function surfaces(level){return [...level.roads.map(r=>{const f=roadFrame(r),w=r.width/2;return {id:r.id,road:r,frame:f,polygon:[{x:r.a.x+f.right.x*w,z:r.a.z+f.right.z*w},{x:r.b.x+f.right.x*w,z:r.b.z+f.right.z*w},{x:r.b.x-f.right.x*w,z:r.b.z-f.right.z*w},{x:r.a.x-f.right.x*w,z:r.a.z-f.right.z*w}],height:(x,z)=>r.a.y+((x-r.a.x)*f.forward.x+(z-r.a.z)*f.forward.z)*f.slope};}),...level.platforms.map(p=>({id:p.id,platform:p,polygon:[{x:p.x-p.size/2,z:p.z+p.size/2},{x:p.x+p.size/2,z:p.z+p.size/2},{x:p.x+p.size/2,z:p.z-p.size/2},{x:p.x-p.size/2,z:p.z-p.size/2}],height:()=>p.y}))];}
export function inside(p,polygon,epsilon=1e-7){return polygon.every((a,i)=>{const b=polygon[(i+1)%polygon.length];return (b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x)<=epsilon;});}
// Clip a rail against neighbouring floor footprints: interior rails disappear at turns.
function clip(a,b,polygon){let lo=0,hi=1;for(let i=0;i<polygon.length;i++){const p=polygon[i],q=polygon[(i+1)%polygon.length],ex=q.x-p.x,ez=q.z-p.z,c=ex*(a.z-p.z)-ez*(a.x-p.x),d=ex*(b.z-a.z)-ez*(b.x-a.x);if(Math.abs(d)<1e-9){if(c>1e-6)return null;}else if(d>0)hi=Math.min(hi,(1e-6-c)/d);else lo=Math.max(lo,(1e-6-c)/d);if(hi<lo)return null;}return [Math.max(0,lo),Math.min(1,hi)];}
// 护栏：沿每块地面的边缘生成，但与相邻地面（含往返浮台的两个停靠位置）重叠的部分留出开口。
// own：只为这些地面生成护栏（默认全部）；floors 为用来裁剪开口的相邻地面（无尽赛道按块生成时只传邻近的几块）。
export function walls(level,floors=surfaces(level),own=floors){
 const out=[],clips=[...floors,...dockFloors(level)];for(const s of own){if(!(s.road?.rails??s.platform?.rails))continue;const edges=s.road?[[s.polygon[0],s.polygon[1]],[s.polygon[2],s.polygon[3]]]:s.polygon.map((p,i)=>[p,s.polygon[(i+1)%4]]);
  for(const [a,b] of edges){let spans=[[0,1]];for(const other of clips){if(other===s)continue;const range=clip(a,b,other.polygon);if(!range||range[1]-range[0]<1e-5)continue;const mid=(range[0]+range[1])/2,x=a.x+(b.x-a.x)*mid,z=a.z+(b.z-a.z)*mid;if(Math.abs(s.height(x,z)-other.height(x,z))>.15)continue;spans=spans.flatMap(([lo,hi])=>range[1]<=lo||range[0]>=hi?[[lo,hi]]:[[lo,Math.max(lo,range[0])],[Math.min(hi,range[1]),hi]].filter(([u,v])=>v-u>1e-5));}
   for(const [lo,hi] of spans){const at=t=>{const x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;return {x,z,y:s.height(x,z)};};out.push({a:at(lo),b:at(hi),radius:.14,height:.96});}
  }
 }return out;
}
export function obstaclePose(level,obstacle,time){const r=level.roads.find(r=>r.id===obstacle.roadId),f=roadFrame(r),angle=time*Math.PI*2/obstacle.period+obstacle.phase,offset=Math.sin(angle)*obstacle.travel,speed=Math.cos(angle)*obstacle.travel*Math.PI*2/obstacle.period;return {...obstacle,x:r.a.x+(r.b.x-r.a.x)*obstacle.t+f.right.x*offset,z:r.a.z+(r.b.z-r.a.z)*obstacle.t+f.right.z*offset,y:r.a.y+(r.b.y-r.a.y)*obstacle.t,right:f.right,forward:f.forward,vx:f.right.x*speed,vz:f.right.z*speed};}

const smooth=t=>t*t*(3-2*t);
// 往返浮台：0 = 停在 a，1 = 停在 b；两端各停 20% 周期，中间平滑加减速。
export function moverProgress(m,time){const s=((time/m.period+m.phase)%1+1)%1;return s<.2?0:s<.5?smooth((s-.2)/.3):s<.7?1:1-smooth((s-.7)/.3);}
export const moverRect=(m,x,z)=>[{x:x-m.hx,z:z+m.hz},{x:x+m.hx,z:z+m.hz},{x:x+m.hx,z:z-m.hz},{x:x-m.hx,z:z-m.hz}];
export function moverPose(m,time){const f=moverProgress(m,time),g=moverProgress(m,time+.01),x=m.a.x+(m.b.x-m.a.x)*f,z=m.a.z+(m.b.z-m.a.z)*f;return {...m,f,x,z,vx:(m.b.x-m.a.x)*(g-f)/.01,vz:(m.b.z-m.a.z)*(g-f)/.01,polygon:moverRect(m,x,z),docked:f===0?'a':f===1?'b':null};}
export const moverFloor=pose=>({id:pose.id,mover:pose,polygon:pose.polygon,height:()=>pose.y});
export function dockFloors(level){return (level.movers||[]).flatMap(m=>[m.a,m.b].map(e=>({id:`${m.id}-dock`,dock:m,polygon:moverRect(m,e.x,e.z),height:()=>m.y})));}
export function sweeperPose(s,time){const angle=s.phase+s.speed*time,dx=Math.cos(angle),dz=Math.sin(angle),L=s.length;return {...s,angle,a:s.arms===1?{x:s.x,z:s.z}:{x:s.x-dx*L,z:s.z-dz*L},b:{x:s.x+dx*L,z:s.z+dz*L}};}
export function boostZone(level,b){const r=level.roads.find(r=>r.id===b.roadId),f=roadFrame(r),w=r.width/2-.25,at=t=>({x:r.a.x+(r.b.x-r.a.x)*t,z:r.a.z+(r.b.z-r.a.z)*t}),A=at(b.t0),B=at(b.t1);return {...b,forward:f.forward,heading:f.heading,road:r,center:at((b.t0+b.t1)/2),length:f.length*(b.t1-b.t0),width:w*2,polygon:[{x:A.x+f.right.x*w,z:A.z+f.right.z*w},{x:B.x+f.right.x*w,z:B.z+f.right.z*w},{x:B.x-f.right.x*w,z:B.z-f.right.z*w},{x:A.x-f.right.x*w,z:A.z-f.right.z*w}],height:(x,z)=>r.a.y+((x-r.a.x)*f.forward.x+(z-r.a.z)*f.forward.z)*f.slope};}
// 星级：3 星 = 不坠落且不超过标准用时；2 星 = 坠落不超过 2 次且不超过标准用时的 1.6 倍；完成即 1 星。
export function stars(level,result){if(!result)return 0;if(result.falls===0&&result.elapsed<=level.par)return 3;if(result.falls<=2&&result.elapsed<=level.par*1.6)return 2;return 1;}
export const levelIndex=id=>LEVELS.findIndex(l=>l.id===id);
