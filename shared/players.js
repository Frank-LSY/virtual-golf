export const MAX_PLAYERS=16;
export const PLAYER_STYLES=['sage','coast','sunset','plum'];
export const PLAYER_COLORS={sage:'#457968',coast:'#527bba',sunset:'#cc775b',plum:'#886799'};
export const phoneLabel=p=>p?.number?`手机 ${String(p.number).padStart(2,'0')}`:'电脑';
export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function roundExport(state){return {'球场':state.hole?.name||state.courseId,'赛制':state.multiplayer?'多人轮流比杆':'单人','洞数':state.mode,'球手':state.players.map(p=>({'标识':p.id,'姓名':p.name,'手机':phoneLabel(p),'已完成球洞':p.scores,'当前洞杆数':p.strokes})),'击球记录':state.shotHistory.map(r=>({'时间':r.time,'球手标识':r.playerId,'球手':r.playerName,'绑定手机':phoneLabel({number:r.phoneNumber}),'实际输入':r.source==='phone'?'手机体感':'电脑操作','手机标识':r.inputDeviceId,'球洞':r.hole,'累计杆数':r.stroke,'力量':r.power,'峰值角速度':r.peak,'上杆毫秒':r.backswingMs,'下挥毫秒':r.downswingMs,'灵敏度':r.inputSettings,'方向':r.dir,'瞄准角度':r.aim,'球杆':r.club,'距离（米）':r.travel,'处罚':r.penalty||'无','进洞':r.holed,'起点':r.from,'终点':r.to,'校准':r.calibration}))};}
