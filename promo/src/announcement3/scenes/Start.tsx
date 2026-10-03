import type React from 'react';
import {useCurrentFrame} from 'remotion';
import {Brand,COMMAND,enter,Foot,Heading,mono,P,Stage} from '../shared';

export const Start:React.FC=()=>{
 const f=useCurrentFrame();
 return <Stage><Brand label="GET STARTED"/><Heading>Your next deck<br/><span style={{color:P.cyan}}>starts here.</span></Heading>
  <div style={{position:'absolute',left:80,right:80,top:421}}>
   <div style={{fontSize:37,fontWeight:600}}><span style={{color:P.cyan,marginRight:20}}>01</span>Install Slide Agent</div>
   <div style={{background:'#14203A',border:`1px solid ${P.line}`,borderRadius:20,padding:'28px 30px',marginTop:22,boxShadow:'0 20px 50px #0003'}}>
    <div style={{fontFamily:mono,fontSize:30,lineHeight:1.65,display:'flex',flexWrap:'wrap',columnGap:18}}><span style={{color:P.cyan}}>$</span>{COMMAND.split(' ').map((word,i)=><span key={i} style={{whiteSpace:'nowrap'}}>{word}</span>)}</div>
   </div>
   <div style={{fontSize:29,color:P.muted,marginTop:20}}>Or install the Slide Agent extension in VS Code.</div>
   <div style={{marginTop:54,opacity:enter(f,76)}}>
    <div style={{fontSize:37,fontWeight:600}}><span style={{color:P.cyan,marginRight:20}}>02</span>Open a new assistant chat</div>
    <div style={{fontSize:28,color:P.muted,marginTop:16}}>Claude Code · Codex · Copilot · Gemini · MCP</div>
   </div>
   <div style={{marginTop:54,opacity:enter(f,155)}}>
    <div style={{fontSize:37,fontWeight:600}}><span style={{color:P.cyan,marginRight:20}}>03</span>Describe your presentation</div>
    <div style={{marginTop:22,padding:'22px 28px',background:'#244CD1',borderRadius:18,fontSize:36,lineHeight:1.25}}>“Create a deck explaining our system architecture.”</div>
   </div>
  </div>
  <Foot>NODE.JS 22.12+ · ACCESS TO AN AI ASSISTANT / MODEL</Foot>
 </Stage>;
};
