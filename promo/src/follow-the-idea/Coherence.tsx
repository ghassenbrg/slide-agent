import React from 'react';
import {Img,useCurrentFrame} from 'remotion';
import {Crop,deck,Head,Shell,Tag,tween} from './kit';

export const Coherence:React.FC = () => {const f=useCurrentFrame(); const security=f>=104; const local=security?f-104:f; return <Shell dark><Head>A clear story.<br/>Across the deck.</Head>
 <div style={{position:'absolute',left:80,top:348,display:'flex',gap:18,fontSize:29,color:'#aab7d3'}}>{['01','02','03','04','05'].map(n=><span key={n} style={{color:n===(security?'04':'02')?'#38bdf8':'#60708f',borderBottom:n===(security?'04':'02')?'3px solid #38bdf8':'3px solid transparent',paddingBottom:8}}>{n}</span>)}</div>
 <div style={{position:'absolute',left:60,top:438,width:960,height:540,overflow:'hidden',borderRadius:14,background:'#0a1022'}}><Img src={deck('architecture',security?4:2)} style={{width:960,height:540}}/>
 {(security?[{x:60,y:273,w:476,h:423},{x:562,y:273,w:476,h:423},{x:1065,y:273,w:475,h:423}]:[{x:60,y:372,w:342,h:253},{x:438,y:372,w:342,h:253},{x:817,y:372,w:342,h:253},{x:1194,y:372,w:345,h:253}]).map((b,i)=><div key={`${security}-${i}`} style={{position:'absolute',left:b.x*.6,top:b.y*.6,width:b.w*.6,height:b.h*.6,background:'#0a1022',transformOrigin:'bottom',transform:`scaleY(${1-tween(local,i*15,24+i*15)})`}}/>)}
 </div>
 {security?<Crop name="architecture" n={4} box={[546,276,500,423]} x={200} y={490} w={680} style={{borderRadius:14,boxShadow:'0 18px 60px #0005',opacity:tween(local,65,85),transform:`translateY(${tween(local,65,85,40,0)}px)`}}/>:<div style={{position:'absolute',left:80,top:1010,display:'flex',gap:30,fontSize:39,color:'#38bdf8',fontWeight:700}}>{['Accept','Plan','Execute','Respond'].map((s,i)=><span key={s} style={{opacity:tween(local,i*15,24+i*15)}}>{s}{i<3&&<span style={{paddingLeft:22,color:'#5a6c91'}}>→</span>}</span>)}</div>}
 <Tag top={1070} dark>{security?'04 / 05 · Trust boundaries':'02 / 05 · Request flow'}</Tag>
 </Shell>};
