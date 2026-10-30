import {clearance,PHYSICS} from '../shared/maze/physics.js';
import {wallSegments} from '../shared/maze/levels.js';
// Test-only grid search. The playable game has no automatic navigation.
export function findRoute(level,{cell=4}={}){
 const extent=280,n=extent*2/cell+1,walls=wallSegments(level),mask=new Int8Array(n*n).fill(-1),parent=new Int32Array(n*n).fill(-1);
 const point=id=>({x:(id%n)*cell-extent,y:Math.floor(id/n)*cell-extent});
 const key=p=>Math.round((p.y+extent)/cell)*n+Math.round((p.x+extent)/cell);
 const safe=id=>{if(mask[id]!==-1)return mask[id];const p=point(id);return mask[id]=clearance(p,walls)>2&&level.holes.every(h=>Math.hypot(p.x-h.x,p.y-h.y)>Math.max(3,h.radius-PHYSICS.radius*.45)+3)?1:0;};
 const start=key(level.spawn),end=key({x:0,y:0}),queue=[start];parent[start]=start;
 for(let q=0;q<queue.length&&parent[end]===-1;q++){
  const id=queue[q],x=id%n,y=Math.floor(id/n);
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=n||yy>=n)continue;const next=yy*n+xx;if(parent[next]===-1&&safe(next)){parent[next]=id;queue.push(next);}}
 }
 if(parent[end]===-1)return null;const out=[];for(let id=end;id!==start;id=parent[id])out.push(point(id));return [level.spawn,...out.reverse(),{x:0,y:0}];
}
