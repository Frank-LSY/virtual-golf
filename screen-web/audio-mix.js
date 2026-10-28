const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const IMPACT_DUCK={hit:.30,tree:.18,cup:.13,water:.22,sand:.26,rough:.28};

// 与用户音量分开：自动避让只影响播放增益，不写入音量偏好。
export class ShotAudioMix {
 constructor(){this.shots=new Map();this.gain=1;this.pulseUntil=0;this.pulseGain=1;}
 begin(scope,now,durationMs){this.shots.set(scope,{until:now+clamp(durationMs||12000,200,60000),gain:IMPACT_DUCK.hit});}
 impact(scope,kind,now){const gain=IMPACT_DUCK[kind]??.3,shot=this.shots.get(scope);if(shot)shot.gain=Math.min(shot.gain,gain);else{this.pulseGain=now<this.pulseUntil?Math.min(this.pulseGain,gain):gain;this.pulseUntil=now+650;}}
 settle(scope){this.shots.delete(scope);}
 clear(){this.shots.clear();this.pulseUntil=0;this.pulseGain=1;}
 update(now,dt){
  for(const [scope,shot] of this.shots)if(now>=shot.until)this.shots.delete(scope);
  let target=now<this.pulseUntil?this.pulseGain:1;for(const shot of this.shots.values())target=Math.min(target,shot.gain);
  const tau=target<this.gain?.055:.72;this.gain+=(target-this.gain)*(1-Math.exp(-Math.max(0,dt)/tau));if(Math.abs(this.gain-target)<.0001)this.gain=target;
  return this.gain;
 }
}
