// 动作类别、力度档位与采集提示的唯一定义；手机、电脑、服务器和训练器共用。
export const ML_VERSION='0.3.0';
// 流式识别版本：模型训练时加入了流式候选的困难负样本，才可以直接用于“模型识别”。
export const STREAM_VERSION=1;
export const DETECTORS=Object.freeze({model:'模型识别',rule:'规则识别'});
export const CLASSES=Object.freeze(['full','partial','putt','other']);
export const CLASS_NAMES=Object.freeze({full:'全挥杆',partial:'切杆 / 半挥杆',putt:'推杆',other:'非挥杆动作'});
export const SWING_CLASSES=Object.freeze(['full','partial','putt']);
export const TIERS=Object.freeze(['light','mid','heavy']);
export const TIER_NAMES=Object.freeze({light:'轻',mid:'中',heavy:'重'});
export const TIER_ANCHORS=Object.freeze({light:.25,mid:.55,heavy:.9});
export const SOURCES=Object.freeze({collect:'引导采集',play:'实战挥杆',missed:'漏识别',adapt:'快速适应',candidate:'待定动作'});
export const OTHER_PROMPTS=Object.freeze(['拿起手机','放下手机','随手晃动几下','拿着手机走几步','预备晃杆，不要挥出','转身看一眼屏幕']);
// 起始阈值（°/s）：推杆动作慢，阈值更低；非挥杆动作允许较轻的动作开始录制。
export const ONSET=Object.freeze({full:50,partial:45,putt:16,other:30});
// 每位球手 × 每台手机的建议采集量。
export const TARGETS=Object.freeze({full:30,partial:20,putt:20,other:30});
export const ADAPT_PLAN=Object.freeze([{label:'full',count:5,tier:'cycle'},{label:'partial',count:5,tier:'cycle'},{label:'putt',count:5,tier:'cycle'},{label:'other',count:6,tier:null}]);
export function weakLabelForClub(clubId){return {putter:'putt',chip:'partial',driver:'full',iron:'full'}[clubId]||null;}
export function tierAt(mode,index){return mode==='cycle'?TIERS[index%3]:TIERS.includes(mode)?mode:null;}
export const profileKey=(deviceId,person)=>`${String(deviceId||'unknown').slice(0,64)}|${String(person||'').trim().slice(0,24)||'未命名'}`;
// 从浏览器标识得到易读的设备名，例如“iPhone · iOS 18.7”。
export function deviceLabel(ua=''){const s=String(ua);let m=s.match(/(iPhone|iPad|iPod).*?OS (\d+)[_.](\d+)/);if(m)return `${m[1]} · iOS ${m[2]}.${m[3]}`;m=s.match(/Android (\d+(?:\.\d+)?)[^;]*;\s*([^;)]+?)(?: Build|\))/);if(m)return `${m[2].trim().slice(0,24)} · Android ${m[1]}`;if(/Macintosh/.test(s))return 'Mac';if(/Windows/.test(s))return 'Windows';return s?'未知设备':'未记录设备';}
