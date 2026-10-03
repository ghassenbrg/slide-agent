import type React from 'react';
import {interpolate,useCurrentFrame} from 'remotion';
import {Camera} from '../announcement3/shared';
import architecture from '../announcement3/data/architecture.json';
import {Brand,clamp,Note,out,P,Stage,Type} from './kit';

export const Systems:React.FC=()=>{
 const f=useCurrentFrame();const k=f<60?0:2,l=f%60;
 const z=k===0?interpolate(l,[0,50],[1,1.08],clamp):interpolate(l,[0,50],[2.1,2.17],clamp);
 return <Stage><Brand label="SYSTEMS / DIAGRAMS"/>
  <Type size={105}>{k===0?'Explain the system.':'Connect the detail.'}</Type>
  <div style={{position:'absolute',left:20,top:400,borderRadius:18,overflow:'hidden',border:'1px solid #425475',boxShadow:'0 35px 70px #0006',translate:`${k===0?0:interpolate(l,[0,10],[-45,0],clamp)}px 0`}}><Camera deck="architecture" width={1040} height={720} zoom={z} x={k===0?.5:.77} y={k===0?.5:.49}/></div>
  <div style={{position:'absolute',left:80,top:1170,fontSize:34,color:P.cyan}}>{['From architecture to a coherent story.','Request paths and service boundaries.','AI runtime, tools and the data plane.'][k]}</div>
  <Note>ACTUAL ARCHITECTURE SHOWCASE</Note>
 </Stage>;
};

export const Editable:React.FC=()=>{
 const f=useCurrentFrame(),node=architecture.slides[0].elements.find(e=>e.id==='architecture/row83-surface')!;
 const ppi=1000/13.3333;
 return <Stage><Brand label="NATIVE POWERPOINT"/><Type size={110}>Yours to edit.</Type>
  <div style={{position:'absolute',left:40,top:388,borderRadius:16,overflow:'hidden',border:'1px solid #425475'}}>
   <div style={{padding:'21px 30px',background:P.panel,display:'flex',justifyContent:'space-between',fontSize:28}}><span>architecture.pptx</span><span style={{color:P.cyan}}>EDITABLE</span></div>
   <Camera deck="architecture" width={1000} height={650} zoom={2.05} x={.72} y={.435}>
    <div style={{position:'absolute',left:node.frame.x*ppi-3,top:node.frame.y*ppi-3,width:node.frame.w*ppi+6,height:node.frame.h*ppi+6,border:'1.5px solid #69DDFF',opacity:out(f,6,15)}}>{[[0,0],[100,0],[0,100],[100,100]].map(([x,y],i)=><div key={i} style={{position:'absolute',left:`${x}%`,top:`${y}%`,width:6,height:6,translate:'-50% -50%',background:'#fff'}}/>)}</div>
   </Camera>
  </div>
  <div style={{position:'absolute',left:80,top:1153,fontSize:38,fontWeight:600,display:'flex',gap:22}}>{['Text','Shapes','Diagram paths'].map((s,i)=><span key={s} style={{opacity:out(f,10+i*18,20+i*18),color:i===2?P.cyan:P.white}}>{s}{i<2?' ·':''}</span>)}</div>
  <Note>SELECTION OVERLAY · ACTUAL EDITABLE OBJECTS</Note>
 </Stage>;
};
