import React from 'react';
import {Img,useCurrentFrame} from 'remotion';
import {asset,AtlasPieces,C,deck,ease,Kinetic,Pointer,pop,Proof,Send,smooth,Stage,typed} from './kit';
import timing from './timing.json';
export const Create:React.FC<{request?:string}>=({request='Create a five-slide Project Atlas update. Light, polished. Show the decisions.'})=>{const f=useCurrentFrame(),send=timing.events.send-timing.shots[2].from,result=timing.events.result-timing.shots[2].from,expand=smooth(f,result,result+23),sent=f>=send;
return <Stage>
 <Kinetic text="Ask." size={122} style={{position:'absolute',left:80,top:199,opacity:1-ease(f,result-6,result+12)}}/>
 <div style={{position:'absolute',left:80,top:365,width:920,height:615,borderRadius:26,background:'white',boxShadow:'0 25px 70px #101c351c',overflow:'hidden',opacity:1-ease(f,result+6,result+26),transform:`scale(${1-expand*.06}) translateY(${-80*expand}px)`}}>
  <div style={{padding:'26px 30px',borderBottom:`1px solid ${C.line}`,display:'flex',gap:18,alignItems:'center',fontSize:34,fontWeight:650}}><Img src={asset('icon.png')} style={{width:44,height:44}}/>Your AI agent<span style={{fontSize:24,color:C.blue,marginLeft:'auto'}}>Slide Agent installed</span></div>
  <div style={{position:'absolute',left:30,right:30,top:126,minHeight:181,padding:'25px 28px',boxSizing:'border-box',background:sent?'#edf2ff':'#f6f8fc',border:`1px solid ${C.line}`,borderRadius:18,fontSize:42,lineHeight:1.18}}>{typed(request,f,8,send-11)}{!sent&&<span style={{color:C.blue,opacity:f%24<12?1:0}}>│</span>}</div>
  <Send pressed={f>=send&&f<send+4} style={{position:'absolute',right:30,top:342,opacity:1-ease(f,send+5,send+13)}}/>
  {sent&&<div style={{position:'absolute',left:30,top:358,fontSize:34,color:C.muted}}>{f<result-9?'Building your presentation…':'Preview ready ✓'}</div>}
  <div style={{position:'absolute',left:30,top:430,display:'flex',gap:14}}>{[1,2,3,4,5].map((n,i)=>{const p=pop(f,result-27+i*3);return <div key={n} style={{width:159,height:90,overflow:'hidden',borderRadius:6,opacity:Math.min(1,p*2),transform:`translateY(${(1-p)*35}px)`}}><Img src={deck('executive',n)} style={{width:'100%'}}/></div>;})}</div>
 </div>
 <Kinetic text="Your deck." at={result} size={107} style={{position:'absolute',left:80,top:245,opacity:expand}}/>
 <div style={{position:'absolute',left:110-30*expand,top:795-351*expand,width:159+761*expand,height:(159+761*expand)*9/16,borderRadius:16,overflow:'hidden',boxShadow:'0 25px 70px #101c3525',opacity:ease(f,result-1,result+3),transform:`perspective(1800px) rotateY(${(1-expand)*-7}deg)`}}><AtlasPieces f={f-result} w={159+761*expand}/></div>
 <div style={{position:'absolute',left:80,top:1002,display:'flex',alignItems:'center',gap:20,opacity:expand}}><span style={{padding:'12px 22px',fontSize:33,background:'#e3f6ee',borderRadius:14,color:'#1b785c',fontWeight:650}}>5 slides</span><span style={{fontSize:36,fontWeight:650}}>Project Atlas · PowerPoint</span></div>
 <Pointer x={ease(f,send-20,send,600,886)} y={ease(f,send-20,send,916,746)} f={f} press={send} opacity={ease(f,send-23,send-18)*(1-ease(f,send+7,send+16))}/>
 <Proof>Condensed agent recreation · Generation time omitted</Proof>
</Stage>;};
