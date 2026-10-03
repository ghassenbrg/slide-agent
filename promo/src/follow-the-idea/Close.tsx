import React from 'react';
import {Img,staticFile,useCurrentFrame} from 'remotion';
import {C,Shell,tween} from './kit';

export const Close:React.FC<{website?:string}> = ({website='slide-agent.ghassen.io'}) => {const f=useCurrentFrame();return <Shell><div style={{position:'absolute',left:80,right:80,top:267,textAlign:'center'}}><Img src={staticFile('follow-the-idea/icon.png')} style={{width:145,height:145,borderRadius:30,transform:`translateY(${tween(f,0,27,20,0)}px)`}}/><div style={{fontSize:92,fontWeight:700,letterSpacing:-4,marginTop:37}}>Slide Agent</div><div style={{fontSize:49,lineHeight:1.2,marginTop:32}}>Professional presentations.<br/>Through your AI agent.</div><div style={{fontSize:56,fontWeight:700,letterSpacing:-1.2,color:C.blue,marginTop:96}}>{website}</div><div style={{height:5,width:tween(f,0,40,0,745),background:C.blue,margin:'20px auto 0'}}/><div style={{fontSize:36,color:C.muted,marginTop:47}}>Explore examples. Get started.</div></div></Shell>};
