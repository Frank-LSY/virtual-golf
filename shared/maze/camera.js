// The same horizontal heading drives view and input; only the tracked position lags.
export function cameraPose(anchor,heading){const x=Math.sin(heading),z=-Math.cos(heading);return {eye:{x:anchor.x-x*9.4,y:anchor.y+6.9,z:anchor.z-z*9.4},look:{x:anchor.x+x*3.7,y:anchor.y+.35,z:anchor.z+z*3.7}};}
