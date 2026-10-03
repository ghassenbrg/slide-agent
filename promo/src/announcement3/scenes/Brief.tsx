import type React from 'react';
import {Img,staticFile,useCurrentFrame} from 'remotion';
import {Brand,enter,Foot,Heading,P,Stage} from '../shared';

export const Brief:React.FC=()=>{
 const f=useCurrentFrame();
 return <Stage><Brand label="01 / DESCRIBE"/><Heading>Start with<br/><span style={{color:P.cyan}}>your context.</span></Heading>
  <div style={{position:'absolute',left:80,right:80,top:420,borderRadius:24,border:`1px solid ${P.line}`,background:P.panel,overflow:'hidden',boxShadow:'0 28px 70px #0004',opacity:enter(f,8)}}>
   <div style={{padding:'25px 32px',borderBottom:`1px solid ${P.line}`,display:'flex',alignItems:'center',gap:16,fontSize:27,color:P.muted}}><Img src={staticFile('icon.png')} style={{width:36,height:36}}/>Your AI assistant</div>
   <div style={{margin:'30px 28px',padding:'30px 32px',borderRadius:'20px 20px 5px 20px',background:'#244CD1',fontSize:40,lineHeight:1.27,letterSpacing:'-0.015em'}}>Create a presentation on our AI platform.<br/><br/>Explain the architecture, retrieval, security and operations.</div>
   <div style={{display:'flex',gap:14,padding:'0 28px 30px',opacity:enter(f,34)}}>{['System notes','Architecture brief'].map(x=><div key={x} style={{flex:1,padding:'20px',borderRadius:12,border:`1px solid ${P.line}`,fontSize:27,color:P.muted}}><span style={{color:P.cyan,marginRight:12}}>↗</span>{x}</div>)}</div>
  </div>
  <div style={{position:'absolute',left:92,top:1076,right:80,display:'flex',gap:22,opacity:enter(f,80),translate:`0 ${(1-enter(f,80))*20}px`}}><span style={{color:P.cyan,fontSize:38}}>↳</span><div style={{fontSize:38,lineHeight:1.25}}>A technical story.<br/>A design shaped for your audience.</div></div>
  <Foot>ILLUSTRATED WORKFLOW · BRIEF BASED ON THE REAL DECK</Foot>
 </Stage>;
};
