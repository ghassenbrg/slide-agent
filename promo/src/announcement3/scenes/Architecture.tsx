import type React from 'react';
import {interpolate,useCurrentFrame} from 'remotion';
import {Brand,Camera,clamp,ease,Foot,Heading,mono,P,Stage} from '../shared';

export const Architecture:React.FC=()=>{
 const f=useCurrentFrame();
 const zoom=interpolate(f,[0,45,95,215,274,302],[1,1,2.18,2.18,1,1],{...clamp,easing:ease.inOut});
 const x=interpolate(f,[0,45,95,135,200,215,274],[.5,.5,.39,.39,.765,.765,.5],{...clamp,easing:ease.inOut});
 const y=interpolate(f,[0,45,95,135,200,215,274],[.5,.5,.51,.51,.49,.49,.5],{...clamp,easing:ease.inOut});
 const phase=f<144?0:f<255?1:2;
 return <Stage><Brand label="03 / BUILD"/><Heading>Complex systems.<br/><span style={{color:P.cyan}}>Clearly connected.</span></Heading>
  <div style={{position:'absolute',left:80,top:388,fontSize:25,color:P.muted}}>Slide Agent computes the layout, text fit and diagram geometry.</div>
  <div style={{position:'absolute',left:20,top:440,width:1040,height:650,borderRadius:18,overflow:'hidden',border:'1px solid #425475',boxShadow:'0 30px 70px #0005'}}><Camera deck="architecture" width={1040} height={650} zoom={zoom} x={x} y={y}/></div>
  <div style={{position:'absolute',left:80,top:1132,right:80,display:'flex',gap:25,alignItems:'center'}}><div style={{fontFamily:mono,fontSize:22,color:P.cyan}}>0{phase+1}</div><div style={{fontSize:38,fontWeight:600}}>{['Request routing → services','AI runtime + data plane','Layout. Text fit. Native PowerPoint.'][phase]}</div></div>
  <Foot>ACTUAL ARCHITECTURE SLIDE · CAMERA MOVEMENT FOR DETAIL</Foot>
 </Stage>;
};
