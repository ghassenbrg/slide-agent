import React from 'react';
import {Img,useCurrentFrame} from 'remotion';
import {asset,Brand,C,ease,Kinetic,pop,Stage} from './kit';
export const Close:React.FC<{website?:string}>=({website='slide-agent.ghassen.io'})=>{const f=useCurrentFrame(),p=pop(f,15);return <Stage brand={false}>
 {[1,2,5].map((n,i)=><div key={n} style={{position:'absolute',left:80+i*275,top:164,width:248,height:139.5,borderRadius:10,overflow:'hidden',boxShadow:'0 16px 40px #101c351a',opacity:1-ease(f,4,22),transform:`translate(${ease(f,0,22,0,(1-i)*180)}px,${ease(f,0,22,0,250)}px) rotate(${ease(f,0,22,(i-1)*5,0)}deg)`}}><Img src={asset(`decks/executive/${String(n).padStart(2,'0')}.png`)} style={{width:248}}/></div>)}
 <Brand size={83} style={{position:'absolute',left:80,top:354,opacity:Math.min(1,p*2),transform:`translateY(${(1-p)*45}px)`}}/>
 <Kinetic text={'Ask. See.\nShape. Present.'} at={24} size={87} style={{position:'absolute',left:80,top:558,right:60,lineHeight:1.13}}/>
 <div style={{position:'absolute',left:80,top:835,opacity:ease(f,27,38),transform:`translateY(${(1-pop(f,27))*25}px)`}}><div style={{fontSize:61,fontWeight:750,letterSpacing:-2.3,color:C.blue}}>{website}</div><div style={{marginTop:18,height:5,width:ease(f,31,43,0,800),background:C.blue,borderRadius:5}}/><div style={{fontSize:37,marginTop:28,color:C.muted}}>Explore examples + installation</div></div>
 </Stage>;};
