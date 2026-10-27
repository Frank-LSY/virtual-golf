import test from 'node:test';
import assert from 'node:assert/strict';
import {GuidedCalibration} from '../shared/calibration.js';
import {SwingDetector,mapSwing} from '../shared/swing.js';
function gesture(w,peak,{axis='gamma',mixed=false,dir=0}={}){let t=(w.lastAt||1000)+100;w.begin(t);let result;for(const v of [0,100,110,90,80,-80,-peak*.6,-peak,-peak*.7,-peak*.2,0]){t+=40;const raw={alpha:0,beta:0,gamma:0};raw[axis]=v;if(mixed)raw.beta=v;result=w.sample(raw,dir,t)||result;}return result;}
function powerStage(){const w=new GuidedCalibration();gesture(w,240);gesture(w,180);gesture(w,520);assert.equal(w.phase,'verify');return w;}
test('引导校准自动识别主轴，区分轻挥/舒适挥幅，两次复测后才能保存',()=>{
 const w=powerStage();assert.equal(w.axis,'gamma');assert.equal(w.result(),null);const peak=w.peakMax*.5**(1/w.gamma);
 gesture(w,peak);assert.equal(w.phase,'verify');gesture(w,peak*1.02);assert.equal(w.phase,'review');const result=w.result();assert.ok(result.verified);assert.equal(result.verifyPowers.length,2);
 const d=new SwingDetector({POWER_GAMMA:result.settings.gamma,POWER_GAIN:1});assert.ok(Math.abs(mapSwing({peak,direction:0},result,d.config).power-.5)<1e-6);assert.ok(result.settings.threshold>=40&&result.settings.threshold<=180);
});
test('混合轴、相近采样、过轻或偏转复测均给出可执行原因，不生成有效校准',()=>{
 const w=new GuidedCalibration();assert.ok(gesture(w,200,{mixed:true}).rejected);assert.equal(w.phase,'axis');assert.match(w.message,/方向/);gesture(w,240);gesture(w,200);assert.ok(gesture(w,220).rejected);assert.match(w.message,/太接近/);assert.equal(w.phase,'full');gesture(w,500);
 const mid=w.peakMax*.5**(1/w.gamma);gesture(w,mid,{dir:25});assert.match(w.message,/握姿偏转/);assert.equal(w.verifications.length,0);gesture(w,w.light);assert.match(w.message,/增加/);assert.equal(w.result(),null);
});
test('复测要求连续一致，超时、断流、重采样不会沿用未完成动作',()=>{
 const w=powerStage();const peak=p=>w.peakMax*p**(1/w.gamma);gesture(w,peak(.36));gesture(w,peak(.64));assert.equal(w.phase,'verify');assert.equal(w.verifications.length,1);assert.match(w.message,/差距/);
 w.begin(5000);assert.ok(w.sample({alpha:0,beta:200,gamma:0},0,5500).rejected);assert.equal(w.collecting,false);assert.match(w.message,/中断/);
 w.begin(6000);for(let t=6040;t<13200;t+=40)w.sample({alpha:0,beta:0,gamma:0},0,t);assert.equal(w.collecting,false);assert.match(w.message,/没有识别/);w.redoPower();assert.equal(w.phase,'light');assert.equal(w.verifications.length,0);assert.equal(w.result(),null);
});
