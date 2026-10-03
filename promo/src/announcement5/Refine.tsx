import type React from 'react';
import {Img,interpolate,staticFile,useCurrentFrame} from 'remotion';
import {Brand,Card,clamp,ease,Note,out,P,pop,SlideImage,Stage,Type} from './kit';
import architecture from '../announcement3/data/architecture.json';

export const Refine:React.FC=()=>{
 const f=useCurrentFrame();const change=interpolate(f,[45,67],[0,100],{...clamp,easing:ease.inOut});
 return <Stage light><Brand light label="REVIEW → REFINE"/><Type size={112}>Keep creating.</Type>
  <div style={{position:'absolute',left:80,top:367,right:80,padding:'24px 30px',background:'#2F5BFF',color:'#fff',borderRadius:20,fontSize:43,fontWeight:600,scale:.94+.06*pop(f)}}>“Make the accent colour blue.”</div>
  <div style={{position:'absolute',left:40,top:546,width:1000,borderRadius:14,overflow:'hidden',boxShadow:'0 30px 80px #10203026'}}><SlideImage deck="analytics" slide={1}/><Img src={staticFile('announcement5/analytics-blue.png')} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'fill',clipPath:`inset(0 ${100-change}% 0 0)`}}/></div>
  <div style={{position:'absolute',left:80,top:1166,fontSize:39,fontWeight:600,color:'#2F5BFF',opacity:out(f,72,84)}}>Your direction. Updated across the deck.</div>
  <Note light>REAL ENGINE REVISION · ANALYTICS SLIDE 1</Note>
 </Stage>;
};

export const Output:React.FC=()=>{
 const f=useCurrentFrame();const collapse=interpolate(f,[42,74],[0,1],{...clamp,easing:ease.inOut});
 const node=architecture.slides[0].elements.find(e=>e.id==='architecture/row83-surface')!;
 const ppi=920/13.3333;
 return <Stage><Brand label="EDITABLE OUTPUT"/><Type size={105}>A real PowerPoint.<br/><span style={{color:P.cyan}}>Ready to edit.</span></Type>
  {[5,4,3,2,1].map((n)=>{const i=n-1;return <Card key={n} deck="architecture" slide={n} style={{left:80+(i-2)*30*(1-collapse),top:510+i*80*(1-collapse),width:920,rotate:`${(i-2)*3*(1-collapse)}deg`,scale:1-.08*i*(1-collapse),opacity:1-collapse*.18*i,translate:`0 ${(1-out(f,(4-i)*3,(4-i)*3+16))*150}px`}}>{n===1?<div style={{position:'absolute',left:node.frame.x*ppi,top:node.frame.y*ppi,width:node.frame.w*ppi,height:node.frame.h*ppi,border:'2px solid #69DDFF',opacity:out(f,84,95)}}>{[[0,0],[100,0],[0,100],[100,100]].map(([x,y],j)=><span key={j} style={{position:'absolute',left:`${x}%`,top:`${y}%`,width:7,height:7,background:'#fff',translate:'-50% -50%'}}/>)}</div>:null}</Card>;})}
  <div style={{position:'absolute',left:80,right:80,top:1055,fontSize:29,textAlign:'center',color:P.cyan,opacity:out(f,84,95)}}>Editable text · Native shapes · Diagram paths</div>
  <div style={{position:'absolute',left:235,right:235,top:1118,padding:'20px 32px',borderRadius:18,background:'#244CD1',fontSize:38,textAlign:'center',fontWeight:600,scale:pop(f,60)}}>↓ architecture.pptx</div>
  <Note>FIVE REAL SLIDES · NATIVE POWERPOINT</Note>
 </Stage>;
};
