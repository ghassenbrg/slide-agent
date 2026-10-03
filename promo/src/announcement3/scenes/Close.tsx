import type React from 'react';
import {Img,staticFile,useCurrentFrame} from 'remotion';
import {enter,Foot,P,Stage,URL} from '../shared';

export const Close:React.FC=()=>{
 const f=useCurrentFrame();
 return <Stage>
  <div style={{position:'absolute',left:80,right:80,top:190,textAlign:'center'}}>
   <Img src={staticFile('icon.png')} style={{width:190,height:190,scale:.94+.06*enter(f,0,32),filter:'drop-shadow(0 24px 55px #316DFF44)'}}/>
   <div style={{fontSize:116,fontWeight:700,letterSpacing:'-0.05em',marginTop:32}}>Slide Agent.</div>
   <div style={{fontSize:47,lineHeight:1.22,color:P.muted,marginTop:22}}>Complex ideas.<br/><span style={{color:P.white}}>Clear presentations.</span></div>
   <div style={{marginTop:75,padding:'30px 10px',borderTop:`1px solid ${P.line}`,borderBottom:`1px solid ${P.line}`,opacity:enter(f,18)}}>
    <div style={{fontSize:26,letterSpacing:'.12em',color:P.muted}}>TRY IT · EXPLORE WHAT IT CAN DO</div>
    <div style={{fontSize:65,letterSpacing:'-.035em',fontWeight:700,color:P.cyan,marginTop:18}}>{URL}</div>
   </div>
   <div style={{fontSize:32,color:P.muted,marginTop:34}}>Installation · Documentation · Example decks</div>
   <div style={{fontSize:28,color:P.white,marginTop:55}}>Open source · MIT · Editable .pptx</div>
  </div>
  <Foot>OFFICIAL WEBSITE · LINKS IN THE POST</Foot>
 </Stage>;
};
