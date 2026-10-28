// 6 轴录音的紧凑编码：时间戳 1 ms（Uint16）、角速度 0.1 °/s、加速度 0.005 m/s²（Int16），小端 Base64。
// 浏览器与 Node 均使用全局 btoa / atob，不依赖 Buffer。
export const ENCODING='i16b64-v1';
export const SCALE=Object.freeze({g:10,a:200});
const clamp16=v=>Math.max(-32768,Math.min(32767,Math.round(v)));
export function bytesToBase64(bytes){let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));return btoa(s);}
export function base64ToBytes(text){const s=atob(text),b=new Uint8Array(s.length);for(let i=0;i<s.length;i++)b[i]=s.charCodeAt(i);return b;}
// rec：{t: 毫秒时间戳数组, g: 交错 [α,β,γ]×n, a: 交错 [x,y,z]×n}
export function encodeRecording(rec){
 const n=rec.t.length,t0=rec.t[0]||0,tb=new DataView(new ArrayBuffer(n*2)),gb=new DataView(new ArrayBuffer(n*6)),ab=new DataView(new ArrayBuffer(n*6));
 for(let i=0;i<n;i++){tb.setUint16(i*2,Math.max(0,Math.min(65535,Math.round(rec.t[i]-t0))),true);for(let k=0;k<3;k++){gb.setInt16((i*3+k)*2,clamp16((rec.g[i*3+k]||0)*SCALE.g),true);ab.setInt16((i*3+k)*2,clamp16((rec.a[i*3+k]||0)*SCALE.a),true);}}
 return {enc:ENCODING,n,t:bytesToBase64(new Uint8Array(tb.buffer)),g:bytesToBase64(new Uint8Array(gb.buffer)),a:bytesToBase64(new Uint8Array(ab.buffer))};
}
export function decodeRecording(data){
 if(!data||data.enc!==ENCODING||!Number.isInteger(data.n)||data.n<2||data.n>2000)throw Error('录音数据格式无效。');
 const n=data.n,tb=base64ToBytes(data.t),gb=base64ToBytes(data.g),ab=base64ToBytes(data.a);
 if(tb.length!==n*2||gb.length!==n*6||ab.length!==n*6)throw Error('录音数据长度不一致。');
 const tv=new DataView(tb.buffer),gv=new DataView(gb.buffer),av=new DataView(ab.buffer),t=new Float64Array(n),g=new Float32Array(n*3),a=new Float32Array(n*3);
 for(let i=0;i<n;i++){t[i]=tv.getUint16(i*2,true);for(let k=0;k<3;k++){g[i*3+k]=gv.getInt16((i*3+k)*2,true)/SCALE.g;a[i*3+k]=av.getInt16((i*3+k)*2,true)/SCALE.a;}}
 for(let i=1;i<n;i++)if(t[i]<t[i-1])throw Error('录音时间戳不是递增的。');
 return {t,g,a,n};
}
export function float32ToBase64(array){return bytesToBase64(new Uint8Array(array.buffer,array.byteOffset,array.byteLength));}
export function base64ToFloat32(text){const b=base64ToBytes(text);return new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);}
