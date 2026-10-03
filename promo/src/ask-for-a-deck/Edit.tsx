import React from 'react';
import {Img,useCurrentFrame} from 'remotion';
import {asset,C,deck,ease,Kinetic,Pointer,pop,Proof,Send,smooth,Stage,typed} from './kit';
import timing from './timing.json';
export const Edit:React.FC<{request?:string}>=({request='Change the title to: Atlas is on track. One decision remains.'})=>{const f=useCurrentFrame(),send=timing.events.editSend-timing.shots[4].from,result=timing.events.editResult-timing.shots[4].from,done=f>=result,zoom=smooth(f,result+10,result+26,1,1.65)-smooth(f,result+53,result+73,0,.65);return <Stage>
 <Kinetic text="Refine." size={116} style={{position:'absolute',left:80,top:195}}/>
 <div style={{position:'absolute',left:80,top:366,width:920,height:217,borderRadius:24,background:'#fff',boxShadow:'0 18px 50px #101c3512',padding:'23px 28px',boxSizing:'border-box'}}><div style={{fontSize:26,color:C.muted,marginBottom:15}}>Your AI agent · Slide Agent</div><div style={{fontSize:39,lineHeight:1.18,width:850}}>{typed(request,f,9,send-16)}{f<send&&<span style={{color:C.blue,opacity:f%20<10?1:0}}>│</span>}</div></div>
 <Send pressed={f>=send&&f<send+4} style={{position:'absolute',right:80,top:605,opacity:1-ease(f,send+7,send+16)}}/>
 <div style={{position:'absolute',left:80,top:606,fontSize:35,fontWeight:600,color:done?'#1b785c':C.muted,opacity:ease(f,send+14,send+24)}}>{done?'✓ Headline updated':'Applying your request…'}</div>
 <div style={{position:'absolute',left:80,top:707,width:920,height:385,borderRadius:16,background:C.paper,overflow:'hidden',boxShadow:'0 25px 65px #101c3520'}}><div style={{position:'absolute',left:0,top:0,width:920,height:517.5,transform:`scale(${zoom})`,transformOrigin:'0% 13%'}}><Img src={done?asset('atlas-edited.png'):deck()} style={{width:920}}/>{done&&<div style={{position:'absolute',left:32,top:55,width:851,height:51,border:`3px solid ${C.blue}`,borderRadius:6,opacity:ease(f,result,result+6)*(1-ease(f,result+41,result+59)),transform:`scale(${.99+.01*pop(f,result)})`}}/>}</div></div>
 <Pointer x={ease(f,send-16,send,569,893)} y={ease(f,send-16,send,823,645)} f={f} press={send} opacity={ease(f,send-19,send-15)*(1-ease(f,send+8,send+15))}/>
 <Proof style={{top:1135}}>Condensed recreation · Actual PowerPoint edit</Proof>
 </Stage>;};
