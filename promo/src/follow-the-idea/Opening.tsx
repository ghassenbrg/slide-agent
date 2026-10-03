import React from 'react';
import {Img, useCurrentFrame} from 'remotion';
import {C, deck, Head, Shell, Tag, Thread, tween} from './kit';

export const Opening:React.FC<{headline?:string;heroFrame?:number}> = ({headline='Your request.\nA professional deck.',heroFrame}) => {
 const current=useCurrentFrame();const f=heroFrame??current;
 return <Shell><Head>{headline.split('\n').map((s,i)=><React.Fragment key={s}>{i>0&&<br/>}{s}</React.Fragment>)}</Head>
 <div style={{position:'absolute',left:80,top:355,width:920,padding:'24px 28px',background:'#fff',border:'2px solid #d8dff1',borderRadius:18,fontSize:42,lineHeight:1.24,boxSizing:'border-box'}}>“Create a 5-slide AI platform<br/>architecture review.”</div>
 <Thread path="M940 491 L940 548" from={0} to={35}/>
 <div style={{position:'absolute',left:80,top:548,width:920,height:517.5,overflow:'hidden',borderRadius:14,boxShadow:'0 24px 80px #162b5530'}}>
 <Img src={deck('architecture',1)} style={{width:920,height:517.5,opacity:.75+.25*tween(f,0,55)}}/>
 {[{x:432,y:397,w:168,h:132},{x:654,y:380,w:180,h:164},{x:876,y:280,w:259,h:67},{x:1184,y:187,w:355,h:253},{x:1183,y:464,w:356,h:251}].map((b,i)=><div key={i} style={{position:'absolute',left:b.x*.575,top:b.y*.575,width:b.w*.575,height:b.h*.575,opacity:tween(f,6+i*7,22+i*7),transform:`translateY(${tween(f,6+i*7,28+i*7,-25,0)}px)`,overflow:'hidden'}}><Img src={deck('architecture',1)} style={{position:'absolute',left:-b.x*.575,top:-b.y*.575,width:920,height:517.5}}/></div>)}
 </div><Tag top={1078}>Actual Slide Agent output · animation for this film</Tag>
 <div style={{position:'absolute',left:80,top:514,color:C.blue,fontSize:25,fontWeight:700,letterSpacing:1.5}}>AI AGENT REQUEST → REAL DECK</div>
 </Shell>;
};
