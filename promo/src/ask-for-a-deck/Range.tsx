import React from 'react';
import {Img,useCurrentFrame} from 'remotion';
import {C,deck,ease,Kinetic,Proof,smooth,Stage} from './kit';
import timing from './timing.json';
export const Range:React.FC<{headline?:string}>=({headline='Different stories.\nDifferent looks.'})=>{const f=useCurrentFrame(),a=timing.events.rangeTech-timing.shots[5].from,b=timing.events.rangeData-timing.shots[5].from,i=f<a?0:f<b?1:2,names=['executive','architecture','analytics'],labels=['Project updates','Technical reviews','Data stories'],local=f-(i===0?0:i===1?a:b);const pan=i===0?0:i===1?smooth(f,a-13,a):1+smooth(f,b-13,b);return <Stage bg={i===2?'#f6f3eb':C.paper}>
 <Kinetic text={headline} size={83} style={{position:'absolute',left:80,top:192,right:70,lineHeight:1.08}}/>
 <div style={{position:'absolute',left:80,top:477,width:920,height:518,overflow:'visible'}}>{names.map((name,j)=>{const x=(j-pan)*1020;return <div key={name} style={{position:'absolute',left:x,top:0,width:920,height:517.5,borderRadius:18,boxShadow:'0 25px 60px #101c3525',overflow:'hidden',transform:`perspective(2200px) rotateY(${j===i?0:j>i?-7:7}deg)`}}><Img src={deck(name,name==='analytics'?2:1)} style={{width:920}}/>{j===2&&<div style={{position:'absolute',left:100,top:150,width:495,height:275,background:'#f6f3ec',clipPath:`inset(0 0 0 ${ease(local,3,24)*100}%)`}}/>}</div>;})}</div>
 <div style={{position:'absolute',left:80,top:1034,fontSize:47,fontWeight:700,color:i===1?C.ink:C.blue}}>{labels[i]}</div><div style={{position:'absolute',right:80,top:1041,display:'flex',gap:12}}>{names.map((_,j)=><i key={j} style={{width:j===i?70:18,height:10,borderRadius:7,background:j===i?C.blue:'#ced6e5'}}/>)}</div>
 <Proof style={{top:1114}}>Real decks · Contrasting subjects and styles</Proof>
 </Stage>;};
