import type React from 'react';
import {AbsoluteFill,interpolate,spring,useCurrentFrame} from 'remotion';
import {Brand,clamp,display,ease,mono,P,SlideImage,Stage} from '../announcement3/shared';
export {Brand,clamp,display,ease,mono,P,SlideImage,Stage};
export const pop=(f:number,delay=0)=>spring({frame:f-delay,fps:30,config:{damping:20,stiffness:210,mass:.65}});
export const out=(f:number,start=0,end=14)=>interpolate(f,[start,end],[0,1],{...clamp,easing:ease.out});
export const Type:React.FC<{children:React.ReactNode;top?:number;size?:number;delay?:number;color?:string;center?:boolean}>=({children,top=195,size=110,delay=0,color,center})=>{
 const f=useCurrentFrame();const t=out(f,delay,delay+12);
 return <div style={{position:'absolute',left:80,right:80,top,fontSize:size,fontWeight:800,lineHeight:.99,letterSpacing:'-.055em',color,textAlign:center?'center':'left',opacity:t,translate:`0 ${(1-t)*42}px`}}>{children}</div>;
};
export const Note:React.FC<{children:React.ReactNode;light?:boolean}>=({children,light})=><div style={{position:'absolute',left:80,right:80,bottom:55,fontFamily:mono,fontSize:18,color:light?'#657187':P.muted}}>{children}</div>;
export const Card:React.FC<{deck:string;slide?:number;style?:React.CSSProperties;children?:React.ReactNode}>=({deck,slide=1,style,children})=><div style={{position:'absolute',width:960,borderRadius:15,overflow:'hidden',boxShadow:'0 24px 60px #07142D33',...style}}><SlideImage deck={deck} slide={slide}/>{children}</div>;
export const Blue:React.FC<{children:React.ReactNode}>=({children})=><AbsoluteFill style={{background:'radial-gradient(ellipse at 80% 15%,#557EFF,#234AE1 60%,#192E90)',color:'#fff',fontFamily:display}}>{children}</AbsoluteFill>;
