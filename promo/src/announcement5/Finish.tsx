import type React from 'react';
import {Img,staticFile,useCurrentFrame} from 'remotion';
import {COMMAND,URL} from '../announcement3/shared';
import {Brand,mono,Note,out,P,pop,Stage,Type} from './kit';

export const Install:React.FC=()=>{
 const f=useCurrentFrame();
 return <Stage light><Brand light label="TRY SLIDE AGENT"/><Type size={114}>Install it.<br/><span style={{color:'#2F5BFF'}}>Ask for a deck.</span></Type>
  <div style={{position:'absolute',left:80,right:80,top:528,background:'#0B1430',padding:'34px 30px',borderRadius:22,boxShadow:'0 25px 60px #0B143033',color:'#E7EDFF',fontFamily:mono,fontSize:31,lineHeight:1.7,display:'flex',flexWrap:'wrap',columnGap:18}}><span style={{color:P.cyan}}>$</span>{COMMAND.split(' ').map((s,i)=><span key={i} style={{whiteSpace:'nowrap'}}>{s}</span>)}</div>
  <div style={{position:'absolute',left:80,right:80,top:765,fontSize:35,lineHeight:1.3,color:'#53627A'}}>Claude Code · Codex · Copilot · Gemini<br/>Or install the VS Code extension.</div>
  <div style={{position:'absolute',left:80,right:80,top:957,padding:'24px 30px',background:'#E1E9FC',borderRadius:18,fontSize:36,color:'#2245BD',fontWeight:600,opacity:out(f,60,72),translate:`0 ${(1-out(f,60,72))*30}px`}}>Open a new chat. Describe your presentation.</div>
  <div style={{position:'absolute',left:80,top:1150,fontSize:38,fontWeight:700,color:'#2F5BFF'}}>{URL}</div>
  <Note light>NODE.JS 22.12+ · YOUR AI ASSISTANT / MODEL</Note>
 </Stage>;
};

export const Close:React.FC=()=>{
 const f=useCurrentFrame();
 return <Stage>
  <div style={{position:'absolute',left:0,right:0,top:150,textAlign:'center'}}><Img src={staticFile('icon.png')} style={{width:210,height:210,scale:.6+.4*pop(f),rotate:`${(1-pop(f))*-12}deg`,filter:'drop-shadow(0 25px 50px #315BFF55)'}}/></div>
  <Type top={438} size={134} center>Slide Agent.</Type>
  <div style={{position:'absolute',left:80,right:80,top:636,textAlign:'center',fontSize:54,fontWeight:600,lineHeight:1.13,opacity:out(f,6,18)}}>From idea<br/><span style={{color:P.cyan}}>to presentation.</span></div>
  <div style={{position:'absolute',left:80,right:80,top:878,padding:'27px 14px',borderRadius:22,background:'#244CD1',textAlign:'center',fontSize:63,fontWeight:700,letterSpacing:'-.03em',scale:.94+.06*pop(f,12)}}>{URL}</div>
  <div style={{position:'absolute',left:80,right:80,top:1035,textAlign:'center',fontSize:34,color:P.muted}}>Install · Explore examples · Get the code</div>
  <div style={{position:'absolute',left:80,right:80,top:1164,textAlign:'center',fontSize:29,color:P.white}}>Open source · MIT · Editable PowerPoint</div>
 </Stage>;
};
