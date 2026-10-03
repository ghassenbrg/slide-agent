import type React from 'react';
import {interpolate,useCurrentFrame} from 'remotion';
import scene from '../data/architecture.json';
import {Brand,Camera,clamp,ease,enter,Foot,Heading,mono,P,Stage} from '../shared';

const node=scene.slides[0].elements.find(e=>e.id==='architecture/row83-surface')!;
export const Native:React.FC=()=>{
 const f=useCurrentFrame(); const q=interpolate(f,[0,42],[1,2.1],{...clamp,easing:ease.inOut});
 const x=interpolate(f,[0,42],[.5,.72],{...clamp,easing:ease.inOut});
 const y=interpolate(f,[0,42],[.5,.435],{...clamp,easing:ease.inOut});
 const ppi=920/13.3333;const a=enter(f,48);
 return <Stage><Brand label="04 / KEEP CONTROL"/><Heading>Real PowerPoint.<br/><span style={{color:P.cyan}}>Ready to refine.</span></Heading>
  <div style={{position:'absolute',left:80,top:424,width:920,borderRadius:18,overflow:'hidden',border:'1px solid #425475',boxShadow:'0 30px 80px #0005'}}>
   <div style={{padding:'20px 26px',background:P.panel,fontSize:26,color:P.muted,display:'flex',justifyContent:'space-between'}}><span>architecture.pptx</span><span style={{color:P.cyan}}>EDITABLE OUTPUT</span></div>
   <Camera deck="architecture" width={920} height={526} zoom={q} x={x} y={y}>
    <div style={{position:'absolute',left:node.frame.x*ppi-3,top:node.frame.y*ppi-3,width:node.frame.w*ppi+6,height:node.frame.h*ppi+6,border:'1px solid #69DDFF',opacity:a,boxShadow:'0 0 20px #69DDFF33'}}>{[[0,0],[50,0],[100,0],[0,100],[50,100],[100,100]].map(([xx,yy],i)=><span key={i} style={{position:'absolute',left:`${xx}%`,top:`${yy}%`,width:5,height:5,background:'#FFF',border:'1px solid #69DDFF',translate:'-50% -50%'}}/>)}</div>
   </Camera>
  </div>
  <div style={{position:'absolute',left:80,right:80,top:1065,fontSize:40,lineHeight:1.22,opacity:enter(f,70)}}>Editable text, shapes<br/>and diagram paths.</div>
  <div style={{position:'absolute',left:80,top:1184,fontFamily:mono,fontSize:23,color:P.cyan,opacity:enter(f,95)}}>170 NATIVE OBJECTS IN THIS SLIDE</div>
  <Foot>SELECTION OVERLAY · VERIFIED AGAINST THE ACTUAL .PPTX</Foot>
 </Stage>;
};
