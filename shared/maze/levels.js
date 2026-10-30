export const TAU = Math.PI * 2;
export const rad = degrees => degrees * Math.PI / 180;
export const polar = (radius, degrees) => ({x:Math.cos(rad(degrees))*radius, y:Math.sin(rad(degrees))*radius});
const ring = (radius, gaps, width=10) => ({radius, width, gaps:gaps.map(([angle, opening])=>({angle:rad(angle), opening:rad(opening)}))});
const hole = (radius, angle, size=14) => ({...polar(radius, angle), radius:size});
const rail = (inner, outer, angle) => ({a:polar(inner,angle), b:polar(outer,angle), width:10});
export const LEVELS = [
  {
    id:'steady', name:'初见 · 学会控制', lesson:'轻推起步，回正滑行', subtitle:'先和惯性熟悉起来。这里没有陷阱，可以放心试。',
    spawn:polar(254,100), goalRadius:22,
    rings:[ring(218,[[15,44]]),ring(150,[[195,48]]),ring(82,[[300,60]])], rails:[], holes:[],
    labels:[{...polar(251,15),text:'先慢下来'},{...polar(113,300),text:'稳稳入心'}],
    strategy:'缺口交错在三个方向。进入下一环后，先回正，再决定下一段。'
  },
  {
    id:'brake', name:'知止 · 学会刹车', lesson:'缺口前减速，通过后再加速', subtitle:'洞口在冲过头的位置。短路省距离，慢一点更省时间。',
    spawn:polar(260,105), goalRadius:20,
    rings:[ring(232,[[-15,30]]),ring(177,[[145,33],[48,29]]),ring(122,[[15,35]]),ring(67,[[205,54]])], rails:[],
    holes:[hole(205,-15,15),hole(153,48,12),hole(93,0,12)],
    labels:[{...polar(203,48),text:'近路 · 先刹车'},{...polar(203,145),text:'宽绕行'}],
    strategy:'第二道环墙有两个入口：48° 的入口更近，但出口前有洞；145° 的入口绕得远，便于稳住。'
  },
  {
    id:'plan', name:'观势 · 学会规划', lesson:'短而险，长而稳', subtitle:'先看下一环，再穿缺口。折返也是路线的一部分。',
    spawn:polar(260,90), goalRadius:18,
    rings:[ring(236,[[165,26],[10,24]]),ring(191,[[55,28],[345,25]]),ring(146,[[225,31],[30,30]]),ring(101,[[315,38]]),ring(56,[[135,72]])],
    rails:[rail(191,236,95),rail(101,146,260),rail(56,101,225)],
    holes:[hole(212,10,14),hole(168,18,11),hole(78,298,10)],
    labels:[{...polar(258,165),text:'稳路'},{...polar(258,10),text:'近路'},{...polar(167,175),text:'停一停 · 看下一段'}],
    strategy:'右侧近路接连经过两个洞口；左侧路线更长。径向隔断迫使你换方向接近缺口，不能只绕同一个方向。'
  }
];

// Exact collision geometry shared by rendering, simulation and route validation.
export function wallSegments(level) {
  const segments=[];
  for(const r of level.rings){
    let intervals=[[0,TAU]];
    for(const gap of r.gaps){
      for(const shift of [-TAU,0,TAU]){
        const lo=gap.angle-gap.opening/2+shift,hi=gap.angle+gap.opening/2+shift;
        intervals=intervals.flatMap(([a,b])=>hi<=a||lo>=b?[[a,b]]:[[a,Math.max(a,lo)],[Math.min(b,hi),b]].filter(([x,y])=>y-x>1e-6));
      }
    }
    for(const [start,end] of intervals)segments.push({kind:'arc',radius:r.radius,start,end,width:r.width});
  }
  for(const line of level.rails)segments.push({kind:'line',...line});
  return segments;
}
