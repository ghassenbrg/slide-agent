import type React from 'react';
import {useCurrentFrame} from 'remotion';
import {SlideView} from '../launch/components/SlideView';
import type {Slide} from '../launch/deck';
import architecture from '../announcement3/data/architecture.json';
import {Brand,mono,Note,out,P,pop,SlideImage,Stage,Type} from './kit';

export const Ask:React.FC=()=>{
 const f=useCurrentFrame();const p=pop(f,5);
 return <Stage light><Brand light label="YOUR BRIEF → YOUR DECK"/><Type size={138}>Just ask.</Type>
  <div style={{position:'absolute',left:80,top:392,width:920,padding:36,boxSizing:'border-box',borderRadius:26,background:'#fff',boxShadow:'0 25px 70px #14264A20',translate:`0 ${(1-p)*140}px`,scale:.94+.06*p}}>
   <div style={{fontFamily:mono,fontSize:23,color:'#53627A',marginBottom:24}}>YOUR AI ASSISTANT</div>
   <div style={{fontSize:48,fontWeight:600,letterSpacing:'-.025em',lineHeight:1.22}}>Turn our platform notes<br/>into a presentation.</div>
   <div style={{fontSize:32,lineHeight:1.25,color:'#53627A',marginTop:26}}>Architecture. Retrieval. Security.<br/>Clear, technical and modern.</div>
   <div style={{marginTop:30,display:'flex',gap:12}}>{['Brief','System notes','Data'].map((t,i)=><span key={t} style={{padding:'14px 22px',borderRadius:12,background:'#EDF2FB',fontSize:28,scale:pop(f,22+i*6),color:'#234AE1'}}>+ {t}</span>)}</div>
   <div style={{position:'absolute',right:28,bottom:28,width:60,height:60,borderRadius:30,background:'#2F5BFF',color:'#fff',fontSize:43,textAlign:'center',lineHeight:'54px'}}>↑</div>
  </div>
  <div style={{position:'absolute',left:80,top:1030,fontSize:44,fontWeight:600,opacity:out(f,42,54),translate:`0 ${(1-out(f,42,54))*30}px`}}>Bring the context.<br/><span style={{color:'#2F5BFF'}}>Set the direction.</span></div>
  <Note light>ILLUSTRATED ASSISTANT WORKFLOW</Note>
 </Stage>;
};

export const Build:React.FC=()=>{
 const f=useCurrentFrame();const slide=architecture.slides[0] as unknown as Slide;
 return <Stage><Brand label="DIRECT → BUILD"/><Type size={88}>Your AI directs.<br/><span style={{color:P.cyan}}>Slide Agent builds.</span></Type>
  <div style={{position:'absolute',left:80,top:410,display:'flex',gap:14}}>{['Story','Design','Layout'].map((s,i)=><div key={s} style={{border:'1px solid #3A4B6C',background:f>45&&i===2?'#244CD1':P.panel,padding:'13px 30px',borderRadius:40,fontSize:31,scale:pop(f,i*6)}}>{s}</div>)}</div>
  <div style={{position:'absolute',left:40,top:540,width:1000,borderRadius:15,overflow:'hidden',border:'1px solid #425475',boxShadow:'0 35px 80px #0006',scale:.94+.06*out(f,0,25)}}>
   <SlideView slide={slide} width={1000} reveal={e=>e.frame.w>12&&e.frame.h>7?1:out(f,20+e.frame.x*2,38+e.frame.x*2)}/>
   <div style={{position:'absolute',inset:0,opacity:out(f,72,84)}}><SlideImage deck="architecture"/></div>
  </div>
  <div style={{position:'absolute',left:80,top:1168,fontSize:36,color:P.cyan,opacity:out(f,60,70)}}>Text fitting. Diagram geometry. Native .pptx.</div>
  <Note>ILLUSTRATIVE ASSEMBLY · REAL COMPUTED SLIDE GEOMETRY</Note>
 </Stage>;
};
