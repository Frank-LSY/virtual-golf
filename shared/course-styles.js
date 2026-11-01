// 0.27 六座球场各自的画面风格：天空、雾、阳光、地面纹样、沙色、树种、远景与点缀色。
// 球场的基础配色（草地 / 球道 / 果岭 / 树 / 水 / 外场）仍在 course-designs.js，这里只放“风格”。
// mow：球道修剪纹（0 格纹 · 1 直条 · 2 斜条 · 3 宽带 · 4 自然斑驳 · 5 波纹）
// rough：长草风格（0 三叶草小花 · 1 雏菊 · 2 松针 · 3 沙砾灌丛 · 4 沙丘草 · 5 苔藓）
// sandStyle：沙坑纹（0 耙痕 · 1 风纹 · 2 细浪纹）
export const COURSE_STYLES=Object.freeze({
 orchard:Object.freeze({
  label:'苹果园',mood:'夏末午后，暖金色的阳光',mow:0,rough:0,sandStyle:0,species:'apple',backdrop:'orchard',
  sky:['#4fa3e3','#a8d9f2','#fff0cf'],fog:['#f3e6c4',460,1180],sun:['#ffd99a',2.6],hemi:['#fff2d6','#86a052',1.55],
  sand:'#efd39b',rock:'#b3a68a',trunk:'#76542f',leaves:['#5c9a3a','#6dab42','#4f8b35','#78b24a'],accent:'#e2402d',flag:'#e2402d',tee:'#e2402d',
  tuft:['#dfe7a6','#e9eebd','#cfe09c','#f0e6b0'],tuftDensity:1,tuftHeight:1,clouds:{count:6,tint:'#ffffff',scale:1,y:1}
 }),
 sunny:Object.freeze({
  label:'公园',mood:'晴朗清爽，湖光与花坛',mow:1,rough:1,sandStyle:0,species:'round',backdrop:'park',
  sky:['#2f8ef5','#86cdfb','#e8f8ff'],fog:['#cfeaff',520,1260],sun:['#fff3dc',2.45],hemi:['#fffbe8','#6f97b5',1.65],
  sand:'#f2e2b6',rock:'#a2ab92',trunk:'#7f6a4c',leaves:['#3f9b5a','#4cab5f','#358c50','#6bb85a','#e1b43b','#e57f8f'],accent:'#ffffff',flag:'#ffc93a',tee:'#3a7cf0',
  tuft:['#cfe3b4','#e2ecd0','#bcd8ae','#d6e4b0'],tuftDensity:1,tuftHeight:1,clouds:{count:7,tint:'#ffffff',scale:1,y:1}
 }),
 pine:Object.freeze({
  label:'松林',mood:'清冷山谷，雪峰与林海',mow:2,rough:2,sandStyle:0,species:'pine',backdrop:'mountains',
  sky:['#3b7fc4','#9ec8e6','#e9f3f7'],fog:['#d6e6ee',420,1100],sun:['#f4f6ff',2.25],hemi:['#eef6ff','#4d7363',1.7],
  sand:'#ddd5bd',rock:'#8f9a93',trunk:'#6b4f3a',leaves:['#1f5f4b','#246b52','#2c7558','#1b5545'],accent:'#c96a3b',flag:'#ff7a2f',tee:'#ff7a2f',
  tuft:['#bfd6b0','#a9c8a2','#c8d8b8','#b2c9a6'],tuftDensity:1.1,tuftHeight:1.1,clouds:{count:5,tint:'#f4f8ff',scale:.9,y:1.1}
 }),
 desert:Object.freeze({
  label:'沙漠',mood:'烈日当空，红岩与绿洲',mow:3,rough:3,sandStyle:1,species:'palm',backdrop:'mesas',
  sky:['#2a7fd8','#7fc0ec','#ffe3b8'],fog:['#f6d9b0',520,1300],sun:['#ffe0a8',2.9],hemi:['#fff1d8','#b2875a',1.45],
  sand:'#e9b47a',rock:'#b9703f',trunk:'#9a7a58',leaves:['#5f9a45','#6fa64c','#4f8a3e','#86ad4f'],accent:'#c2933f',flag:'#1fbfb0',tee:'#1fbfb0',
  tuft:['#e0d39a','#d8c88a','#e9dcaa','#cbbd7e'],tuftDensity:.45,tuftHeight:.8,clouds:{count:2,tint:'#fff8ee',scale:.8,y:1.2}
 }),
 coast:Object.freeze({
  label:'海岸',mood:'海风与沙丘，白浪与灯塔',mow:4,rough:4,sandStyle:2,species:'windswept',backdrop:'coast',
  sky:['#2b8fd6','#8fd2f2','#f0fbff'],fog:['#dff3fb',500,1240],sun:['#fff8ea',2.5],hemi:['#f6fbff','#7f9c8e',1.7],
  sand:'#f5ead0',rock:'#cfc6b2',trunk:'#6e5a46',leaves:['#3f7f6c','#467f63','#386f60','#4f8a72'],accent:'#d8423a',flag:'#1d3f8f',tee:'#ffffff',
  tuft:['#e6dca8','#d9cf96','#efe6bd','#cfc48a'],tuftDensity:1.15,tuftHeight:1.45,clouds:{count:6,tint:'#ffffff',scale:1.25,y:.9,flat:true}
 }),
 rainforest:Object.freeze({
  label:'雨林',mood:'湿润云雾，火山与瀑布',mow:5,rough:5,sandStyle:0,species:'canopy',backdrop:'jungle',
  sky:['#4a8fa8','#a7d3d4','#e6f4ee'],fog:['#cfe4dc',330,980],sun:['#f3ffe8',2.05],hemi:['#effff4','#3d6b4a',1.85],
  sand:'#d2c29a',rock:'#6f7c6c',trunk:'#5d4a36',leaves:['#1f7a4c','#279056','#176b42','#3a9a4e','#2f8a3c'],accent:'#ff4f8b',flag:'#ff4f8b',tee:'#ffcf3a',
  tuft:['#a9d39a','#93c48a','#b8dca5','#86b97e'],tuftDensity:1.25,tuftHeight:1.35,clouds:{count:9,tint:'#eef5f2',scale:1.15,y:.75,mist:true}
 })
});
export function courseStyle(id){return COURSE_STYLES[id]||COURSE_STYLES.sunny;}
