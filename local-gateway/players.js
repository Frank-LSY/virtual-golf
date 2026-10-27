import {PLAYER_STYLES} from '../shared/players.js';
export class Players {
 constructor(saved=[]){this.profiles=new Map((Array.isArray(saved)?saved:[]).filter(p=>typeof p.id==='string').map(p=>[p.id,p]));}
 ensure(id){if(!this.profiles.has(id)){if(this.profiles.size>=100)throw Error('已保存的手机数量达到上限。');const number=Math.max(0,...[...this.profiles.values()].map(p=>p.number))+1;this.profiles.set(id,{id,number,name:`球手 ${number}`,style:PLAYER_STYLES[(number-1)%4]});}return this.profiles.get(id);}
 update(id,value){const p=this.ensure(id),name=typeof value.name==='string'?value.name.trim():p.name;if(!name||name.length>12||/[\x00-\x1f<>]/.test(name))throw Error('昵称请使用 1–12 个普通文字。');if(value.style!==undefined&&!PLAYER_STYLES.includes(value.style))throw Error('请选择有效装扮。');Object.assign(p,{name,style:value.style||p.style});return p;}
 snapshot(clients){return [...this.profiles.values()].map(p=>{const ws=[...clients].find(c=>c.role==='phone'&&c.clientId===p.id);return {...p,connected:!!ws,calibrated:!!ws?.calibrated,calibration:ws?.calibration||null,settings:ws?.inputSettings||null,calibrationProgress:ws?.calibrationProgress||null};});}
 saved(){return [...this.profiles.values()];}
}
