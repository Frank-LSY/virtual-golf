import {makeHole} from './courses.js';

export const INPUT_DEFAULTS=Object.freeze({powerGain:1,directionGain:1,threshold:120,gamma:1.6});
export const INPUT_LIMITS={powerGain:[.5,1.8],directionGain:[.25,2],threshold:[40,500],gamma:[1,3]};
export function inputSettings(value){
 if(!value||typeof value!=='object')throw Error('灵敏度参数无效。');
 const result={};
 for(const [key,[min,max]] of Object.entries(INPUT_LIMITS)){
  const n=value[key];if(!Number.isFinite(n)||n<min||n>max)throw Error('灵敏度超出可调范围。');result[key]=n;
 }
 return result;
}
export const TRAINING_CLUBS=[
 {id:'driver',name:'一号木杆',speed:51,loft:28,target:220},
 {id:'iron',name:'7 号铁杆',speed:39,loft:37,target:150},
 {id:'wedge',name:'挖起杆',speed:29,loft:50,target:70},
 {id:'sand',name:'沙坑杆',speed:25,loft:56,target:45},
 {id:'chip',name:'劈起杆',speed:18,loft:40,target:30},
 {id:'putter',name:'推杆',speed:5.4,loft:0,target:10}
];
export const MOTION_STATES={IDLE:'准备',BACK:'上杆',DOWN:'下挥',HIT:'击球',COOLDOWN:'收杆'};
export function motionSample(t){
 if(!t||!['alpha','beta','gamma'].every(k=>Number.isFinite(t[k])&&Math.abs(t[k])<=10000)||!['alpha','beta','gamma'].includes(t.axis)||!MOTION_STATES[t.state]||!['intro','still','calibrating','calibration_done','ready'].includes(t.stage)||!Number.isFinite(t.tilt)||Math.abs(t.tilt)>360||!Number.isFinite(t.hz)||t.hz<0||t.hz>1000)throw Error('传感器数据无效。');
 return {alpha:t.alpha,beta:t.beta,gamma:t.gamma,axis:t.axis,state:t.state,stage:t.stage,tilt:t.tilt,hz:t.hz,peakMax:Number.isFinite(t.peakMax)?t.peakMax:null};
}
export function practiceSettings(value){
 const club=TRAINING_CLUBS.find(c=>c.id===value?.clubId);
 if(!club||!Number.isFinite(value.target)||value.target<5||value.target>280)throw Error('请选择有效球杆和 5–280 米的目标距离。');
 const aim=value.aim??0;if(!Number.isFinite(aim)||Math.abs(aim)>35)throw Error('瞄准方向需在左右 35° 范围内。');
 return {clubId:club.id,target:value.target,aim};
}
export function makeRange(settings={clubId:'iron',target:150}){
 const h=makeHole('sunny',0,421);
 return {...h,practice:true,putting:settings.clubId==='putter',name:'田径训练场',length:340,width:76,elevation:0,slope:0,
  pin:{x:0,z:settings.target},hazards:[],trees:[],wind:{x:0,z:0,speed:0},
  bounds:{minX:-180,maxX:180,minZ:-50,maxZ:500},route:Array.from({length:81},(_,i)=>({x:0,z:i*340/80}))};
}
export function trainingExport(rows){return rows.map(r=>({'球手标识':r.playerId,'球手姓名':r.playerName,'手机编号':r.phoneNumber,'输入手机':r.inputDeviceId,'本杆校准':r.calibration,
 '时间':r.time,'来源':r.source==='phone'?'手机体感':'电脑试打','球杆':r.club,'目标距离（米）':r.target,
 '力量（百分比）':Math.round(r.power*100),'角速度峰值（度每秒）':r.peak??null,
 '瞄准方向（度）':r.aim??0,'出球方向（度）':r.launchAngle,'飞行距离（米）':r.carry,'落地后移动（米）':r.roll,'总距离（米）':r.travel,
 '左右偏差（米，右为正）':r.lateral,'目标前后偏差（米，长为正）':r.longitudinal,
 '距目标（米）':r.targetError,'最高点（米）':r.apex,'模拟出球速度（米每秒）':r.ballSpeed,
 '上杆时间（毫秒）':r.backswingMs??null,'下挥时间（毫秒）':r.downswingMs??null,'节奏比':r.tempo??null,
 '手机灵敏度':r.input?{'力量倍率':r.input.powerGain,'方向倍率':r.input.directionGain,'触发阈值':r.input.threshold,'力量曲线':r.input.gamma}:null,
 '训练反馈':r.feedback,'说明':'距离、球速与弹道为游戏模拟；手机无法测量真实杆面、触球位置和旋转。'
}));}
