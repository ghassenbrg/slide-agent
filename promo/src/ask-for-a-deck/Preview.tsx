import React from 'react';
import {Img,useCurrentFrame} from 'remotion';
import {C,deck,ease,Kinetic,Pointer,pop,Proof,smooth,Stage} from './kit';
import timing from './timing.json';
export const Preview:React.FC<{headline?:string}>=({headline='Preview.'})=>{const f=useCurrentFrame(),a=timing.events.preview2-timing.shots[3].from,b=timing.events.preview5-timing.shots[3].from,n=f<a?1:f<b?2:5,local=f-(n===1?0:n===2?a:b),p=pop(local),rail=ease(f,0,24),detail=n===2?smooth(local,20,34,1,1.16)-smooth(local,43,57,0,.16):1;return <Stage>
 <Kinetic text={headline} size={108} style={{position:'absolute',left:80,top:235}}/>
 <div style={{position:'absolute',left:80,top:388,fontSize:35,color:C.muted}}>A complete presentation. One coherent design.</div>
 <div style={{position:'absolute',left:80,top:444,width:920,height:517.5,borderRadius:16,boxShadow:'0 25px 65px #101c3520',overflow:'hidden',background:C.paper}}>
  <Img key={n} src={deck('executive',n)} style={{position:'absolute',width:920,opacity:n===1?1:Math.min(1,p*2),transform:`translateX(${n===1?0:(1-p)*80}px) scale(${detail})`,transformOrigin:'0% 65%'}}/>
 </div>
 <div style={{position:'absolute',left:80,top:1002,display:'flex',gap:15,opacity:rail}}>{[1,2,3,4,5].map(i=><div key={i} style={{width:172,height:97,borderRadius:8,border:`3px solid ${i===n?C.blue:'transparent'}`,overflow:'hidden',boxSizing:'border-box',transform:`translateY(${i===n?-7:0}px)`,opacity:i===n?1:.6}}><Img src={deck('executive',i)} style={{width:'100%'}}/></div>)}</div>
 <Pointer x={n===2?ease(f,a-15,a,850,310):ease(f,b-15,b,310,866)} y={1071} f={f} press={n===2?a:b} opacity={(ease(f,a-18,a-12)*(1-ease(f,a+8,a+17)))+(ease(f,b-18,b-12)*(1-ease(f,b+8,b+17)))}/>
 <Proof style={{top:1136}}>Actual Atlas deck · Illustrative project data</Proof>
 </Stage>;};
