import {clubFor} from './courses.js';
export const CLUBS=Object.freeze([
 {id:'driver',name:'一号木杆',range:265,speed:51,loft:28,tip:'远距离开球'},
 {id:'iron',name:'7 号铁杆',range:165,speed:39,loft:37,tip:'中距离攻果岭'},
 {id:'wedge',name:'挖起杆',range:85,speed:29,loft:50,tip:'高弹道、短滚动'},
 {id:'sand',name:'沙坑杆',range:55,speed:25,loft:56,tip:'高抛救球'},
 {id:'chip',name:'劈起杆',range:38,speed:18,loft:40,tip:'近距离切球'},
 {id:'putter',name:'推杆',range:28,speed:5.4,loft:0,tip:'贴地滚动'}
]);
// 落地时的回旋“咬地”系数：杆面越开，第一跳保留的水平速度越少，使全力总距离接近参考距离。
export const CLUB_SPIN=Object.freeze({driver:.72,iron:.55,wedge:.4,sand:.35,chip:.85,putter:1});
export const validClub=id=>id==='auto'||CLUBS.some(c=>c.id===id);
export function selectedClub(hole,ball,id='auto'){return id==='auto'?clubFor(hole,ball):CLUBS.find(c=>c.id===id)||clubFor(hole,ball);}
