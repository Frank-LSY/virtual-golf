// 动作类别、力度档位、动作采样与采集计划的唯一定义；手机、电脑、服务器和训练器共用。
// 0.20 起标签简化为“挥杆 / 推杆 / 非挥杆”三类，切杆与半挥杆并入挥杆（只是力度更低）；
// 力度改为 5 档上杆幅度（20%–100%），档位同时决定游戏里小人的上杆高度。
export const ML_VERSION='0.4.0';
// 标签版本：1 = 全挥杆 / 切杆 / 推杆 / 非挥杆 × 轻中重（0.15–0.19）；2 = 挥杆 / 推杆 / 非挥杆 × 5 档力度。
export const LABELS_VERSION=2;
// 流式识别版本：模型训练时加入了流式候选的困难负样本，才可以直接用于“模型识别”。
export const STREAM_VERSION=1;
export const DETECTORS=Object.freeze({model:'模型识别',rule:'规则识别'});
export const CLASSES=Object.freeze(['swing','putt','other']);
export const CLASS_NAMES=Object.freeze({swing:'挥杆',putt:'推杆',other:'非挥杆动作'});
export const SWING_CLASSES=Object.freeze(['swing','putt']);
// 旧标签 → 新标签。
export const LEGACY_LABELS=Object.freeze({full:'swing',partial:'swing',putt:'putt',other:'other',swing:'swing'});
export const normalizeLabel=label=>LEGACY_LABELS[label]??null;

// ---------- 力度：5 档上杆幅度 ----------
export const LEVELS=Object.freeze([1,2,3,4,5]);
export const levelPower=level=>LEVELS.includes(level)?level/5:null;
export const powerLevel=power=>Number.isFinite(power)?Math.max(1,Math.min(5,Math.round(power*5))):null;
export const LEVEL_NAMES=Object.freeze({1:'20%',2:'40%',3:'60%',4:'80%',5:'100%'});
// 用上杆停在哪里来定力度：人容易重复，也直接对应小人的上杆高度。
export const LEVEL_CUES=Object.freeze({
 swing:Object.freeze({1:'手上杆到膝盖高',2:'手上杆到腰高',3:'手上杆到胸口高',4:'手上杆到肩高',5:'完整上杆，舒适的最大幅度'}),
 putt:Object.freeze({1:'后摆约一拳（10 厘米）',2:'后摆约 20 厘米',3:'后摆约 30 厘米',4:'后摆约 45 厘米',5:'后摆约 60 厘米，最长推杆'})
});
export const levelText=(label,level)=>LEVELS.includes(level)?`${LEVEL_NAMES[level]} · ${LEVEL_CUES[label==='putt'?'putt':'swing'][level]}`:'自然动作';
// 旧档位换算成力度：按 0.19 真实录音中各档上杆弧度相对全力挥杆的比例估计。旧数据只在同一旧类别内比较力度先后。
export const LEGACY_POWER=Object.freeze({full:{light:.6,mid:.8,heavy:1},partial:{light:.3,mid:.4,heavy:.5},putt:{light:.3,mid:.6,heavy:.9}});
export const legacyPower=(label,tier)=>LEGACY_POWER[label]?.[tier]??null;

// ---------- 动作采样：为小人的完整挥杆动作校准每个人的幅度 ----------
// 停住类动作以“非挥杆”入库（也是很好的困难负样本），收杆类以“挥杆 100%”入库。
export const POSES=Object.freeze({
 waist:{name:'停在腰高',prompt:'慢慢上杆到手在腰高，停住 1 秒，不要挥下去',label:'other',u:.4},
 shoulder:{name:'停在肩高',prompt:'慢慢上杆到手在肩高，停住 1 秒，不要挥下去',label:'other',u:.8},
 top:{name:'停在顶点',prompt:'慢慢完整上杆到最高点，停住 1 秒，不要挥下去',label:'other',u:1},
 finish:{name:'完整挥杆并收杆',prompt:'完整挥杆，收杆后停住 1 秒',label:'swing',u:-1,level:5}
});
export const MOTION_PLAN=Object.freeze(['waist','shoulder','top','finish','waist','shoulder','top','finish']);

export const SOURCES=Object.freeze({collect:'引导采集',play:'实战挥杆',missed:'漏识别',adapt:'快速个性化',motion:'动作采样',candidate:'待定动作'});
export const OTHER_PROMPTS=Object.freeze(['拿起手机','放下手机','随手晃动几下','拿着手机走几步','预备晃杆，不要挥出','转身看一眼屏幕']);
// 起始阈值（°/s）：推杆动作慢，阈值更低；非挥杆与慢速停住动作允许较轻的动作开始录制。
export const ONSET=Object.freeze({swing:45,putt:16,other:30,pose:24});
// 每位球手 × 每台手机的建议采集量：挥杆每档 8 条，推杆每档 4 条。
export const TARGETS=Object.freeze({swing:40,putt:20,other:30});
export const LEVEL_TARGETS=Object.freeze({swing:8,putt:4});
// 快速适应：挥杆 5 档各 1 次、推杆 1/3/5 档、非挥杆 4 个，约 2 分钟。
// 快速个性化（0.23）：新手机只录 5 次挥杆（至少 3 次即可结束），力度依次 100% / 60% / 100% / 40% / 80%；
// 结束后服务器自动做个人迁移训练（见 shared/ml/personal.js）。旧版 12 条（挥杆五档 + 推杆三档 + 4 个日常动作）不再使用。
export const ADAPT_LEVELS=Object.freeze([5,3,5,2,4]);
export const ADAPT_MIN=3;
export const ADAPT_PLAN=Object.freeze(ADAPT_LEVELS.map(level=>Object.freeze({label:'swing',level})));
// 力度档位模式：ladder = 1→5 循环（每组都覆盖全部力度）；数字 = 固定档位。
export function levelAt(mode,index){if(mode==='ladder'||mode==='cycle')return LEVELS[index%5];const n=Number(mode);return LEVELS.includes(n)?n:null;}
export function weakLabelForClub(clubId){return clubId==='putter'?'putt':clubId?'swing':null;}
export const profileKey=(deviceId,person)=>`${String(deviceId||'unknown').slice(0,64)}|${String(person||'').trim().slice(0,24)||'未命名'}`;
// 从浏览器标识得到易读的设备名，例如“iPhone · iOS 18.7”。
export function deviceLabel(ua=''){const s=String(ua);let m=s.match(/(iPhone|iPad|iPod).*?OS (\d+)[_.](\d+)/);if(m)return `${m[1]} · iOS ${m[2]}.${m[3]}`;m=s.match(/Android (\d+(?:\.\d+)?)[^;]*;\s*([^;)]+?)(?: Build|\))/);if(m)return `${m[2].trim().slice(0,24)} · Android ${m[1]}`;if(/Macintosh/.test(s))return 'Mac';if(/Windows/.test(s))return 'Windows';return s?'未知设备':'未记录设备';}
// 样本的力度组：新档位数据在同一类别内都可比较；旧数据只与同一旧类别（全挥杆 / 切杆）比较。
export const powerGroup=sample=>sample.legacy?.label?`legacy:${sample.legacy.label}`:'v2';
