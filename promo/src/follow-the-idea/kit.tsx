import React from 'react';
import {AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';

export const C = {blue:'#2f5bff', teal:'#14b8a6', ink:'#121a2e', paper:'#f5f6fa', muted:'#647087', dark:'#080f20'};
export const ease = Easing.bezier(0.22, 1, 0.36, 1);
export const tween = (f:number, a:number, b:number, x=0, y=1) => interpolate(f,[a,b],[x,y],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:ease});
export const deck = (name:string, n:number) => staticFile(`follow-the-idea/decks/${name}/0${n}.png`);

export const Brand: React.FC<{dark?:boolean}> = ({dark=false}) => <div style={{position:'absolute',left:80,top:62,display:'flex',alignItems:'center',gap:18,color:dark?'#fff':C.ink,fontSize:32,fontWeight:700}}><Img src={staticFile('follow-the-idea/icon.png')} style={{width:48,height:48,borderRadius:10}}/>Slide Agent</div>;
export const Shell: React.FC<{children:React.ReactNode; dark?:boolean; cream?:boolean}> = ({children,dark=false,cream=false}) => <AbsoluteFill style={{background:dark?C.dark:cream?'#f6f3eb':C.paper,color:dark?'#edf1fb':C.ink,fontFamily:'Arial, sans-serif'}}><Brand dark={dark}/>{children}</AbsoluteFill>;
export const Head: React.FC<{children:React.ReactNode; sub?:string; color?:string}> = ({children,sub,color}) => <div style={{position:'absolute',left:80,top:154,right:80}}><div style={{fontSize:78,lineHeight:1.04,letterSpacing:-3.3,fontWeight:700,color}}>{children}</div>{sub&&<div style={{fontSize:32,lineHeight:1.25,marginTop:24,opacity:.7}}>{sub}</div>}</div>;
export const Tag: React.FC<{children:React.ReactNode; top?:number; dark?:boolean}> = ({children,top=1070,dark=false}) => <div style={{position:'absolute',left:80,top,fontSize:28,letterSpacing:.3,color:dark?'#abb7d1':C.muted}}>{children}</div>;
export const Slide: React.FC<{name:string;n:number;x?:number;y?:number;w?:number;style?:React.CSSProperties}> = ({name,n,x=60,y=480,w=960,style}) => <div style={{position:'absolute',left:x,top:y,width:w,height:w*9/16,overflow:'hidden',borderRadius:14,boxShadow:'0 22px 64px rgba(10,20,42,.16)',...style}}><Img src={deck(name,n)} style={{width:'100%',height:'100%'}}/></div>;

/** Authentic pixels, positioned in the original 1600 x 900 coordinate system. */
export const Crop: React.FC<{name:string;n:number;box:[number,number,number,number];w:number;x:number;y:number;style?:React.CSSProperties}> = ({name,n,box,w,x,y,style}) => <div style={{position:'absolute',left:x,top:y,width:w,height:box[3]*w/box[2],overflow:'hidden',...style}}><Img src={deck(name,n)} style={{position:'absolute',width:1600*w/box[2],height:900*w/box[2],left:-box[0]*w/box[2],top:-box[1]*w/box[2]}}/></div>;

export const Thread: React.FC<{path:string;from?:number;to?:number;color?:string;opacity?:number}> = ({path,from=0,to=45,color=C.blue,opacity=1}) => {const f=useCurrentFrame();const p=tween(f,from,to); return <svg width="1080" height="1350" style={{position:'absolute',inset:0,pointerEvents:'none',opacity}}><path d={path} fill="none" stroke={color} strokeWidth="5" pathLength="1" strokeDasharray="1" strokeDashoffset={1-p} strokeLinecap="round"/></svg>;};
