import type React from 'react';
import {useCurrentFrame} from 'remotion';
import {Brand,enter,Foot,Heading,mono,P,SlideImage,Stage} from '../shared';

export const Direction:React.FC=()=>{
 const f=useCurrentFrame();
 return <Stage><Brand label="02 / DESIGN"/><Heading>A story.<br/><span style={{color:P.cyan}}>A visual language.</span></Heading>
  <div style={{position:'absolute',left:80,right:80,top:420,display:'flex',gap:32}}>
   <div style={{width:404}}>{['System architecture','Request lifecycle','Governed retrieval','Trust boundaries','Release & observe'].map((x,i)=><div key={x} style={{padding:'20px 0',borderBottom:`1px solid ${P.line}`,fontSize:29,display:'flex',gap:18,opacity:enter(f,8+i*6),translate:`${(1-enter(f,8+i*6))*20}px 0`}}><span style={{color:P.cyan,fontFamily:mono,fontSize:21,paddingTop:4}}>0{i+1}</span>{x}</div>)}</div>
   <div style={{flex:1,padding:'26px 26px',borderRadius:20,background:P.panel,border:`1px solid ${P.line}`,opacity:enter(f,28)}}>
    <div style={{fontSize:23,color:P.muted,fontFamily:mono}}>DESIGN DIRECTION</div>
    <div style={{fontSize:41,fontWeight:600,lineHeight:1.12,marginTop:25}}>Technical.<br/>Precise.<br/>Connected.</div>
    <div style={{display:'flex',gap:13,marginTop:30}}>{['#0A1022','#38BDF8','#A78BFA','#2DD4BF'].map(c=><span key={c} style={{width:48,height:48,borderRadius:48,background:c,border:'1px solid #62718B'}}/>)}</div>
    <div style={{fontSize:25,marginTop:24,color:P.muted}}>Helvetica Neue<br/>Structured hierarchy</div>
   </div>
  </div>
  <div style={{position:'absolute',left:80,right:80,top:923,display:'flex',gap:16,opacity:enter(f,54)}}>{[1,3,4].map(n=><div key={n} style={{width:296,border:'1px solid #425475',borderRadius:8,overflow:'hidden'}}><SlideImage deck="architecture" slide={n}/></div>)}</div>
  <div style={{position:'absolute',left:80,top:1155,fontSize:35,color:P.muted}}>Your assistant directs the story and design.</div>
  <Foot>ONE COHERENT DECK · ACTUAL NARRATIVE & DESIGN TOKENS</Foot>
 </Stage>;
};
