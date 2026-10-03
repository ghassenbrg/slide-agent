import type React from 'react';
import {interpolate,useCurrentFrame} from 'remotion';
import {Brand,clamp,ease,enter,Foot,P,SlideImage,Stage} from '../shared';

export const Reveal:React.FC=()=>{
 const f=useCurrentFrame();
 const breadth=interpolate(f,[36,78],[0,1],{...clamp,easing:ease.inOut});
 return <Stage><Brand label="OPEN SOURCE"/>
  <div style={{position:'absolute',left:80,top:190,fontSize:110,fontWeight:700,lineHeight:1.02,letterSpacing:'-0.055em'}}>Meet<br/><span style={{color:P.cyan}}>Slide Agent.</span></div>
  <div style={{position:'absolute',left:84,top:443,fontSize:43,lineHeight:1.2,color:P.muted}}>Your brief. Your AI assistant.<br/>Editable PowerPoint.</div>
  <div style={{position:'absolute',left:40+110*breadth,top:612-47*breadth,width:1000-220*breadth,border:'1px solid #425475',borderRadius:14,overflow:'hidden',boxShadow:'0 36px 100px #0008'}}><SlideImage deck="architecture"/></div>
  <div style={{position:'absolute',left:90,right:90,top:1022,display:'flex',gap:40,opacity:enter(f,59,20),translate:`0 ${(1-enter(f,59,26))*46}px`}}>{[{deck:'executive',slide:1},{deck:'analytics',slide:1}].map(e=><div key={e.deck} style={{width:430,borderRadius:9,overflow:'hidden',boxShadow:'0 20px 50px #0006'}}><SlideImage deck={e.deck} slide={e.slide}/></div>)}</div>
  <Foot>REAL PRESENTATIONS · ARCHITECTURE · BUSINESS · DATA</Foot>
 </Stage>;
};
