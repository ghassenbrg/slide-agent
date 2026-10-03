import React from 'react';
import {Img,useCurrentFrame} from 'remotion';
import {C,deck,Head,Shell,tween} from './kit';

export const Deliverable:React.FC = () => {const f=useCurrentFrame();const p=tween(f,24,63);return <Shell><Head>The complete deck.<br/>Editable PowerPoint.</Head>
 {[1,2,3,4,5].map((n,i)=><div key={n} style={{position:'absolute',left:80+(i%2)*472,top:427+Math.floor(i/2)*162,width:440,height:247.5,transform:`translate(${(540-(80+(i%2)*472)-220)*p}px, ${(681-(427+Math.floor(i/2)*162)-123)*p}px) scale(${1-p*.4}) rotate(${(i-2)*(1-p)*2}deg)`,opacity:1-tween(f,50,68),boxShadow:'0 18px 40px #162b5530',borderRadius:9,overflow:'hidden'}}><Img src={deck('architecture',n)} style={{width:440,height:247.5}}/></div>)}
 <div style={{position:'absolute',left:155,top:555,width:770,height:360,background:'#fff',border:'2px solid #d8dff1',borderRadius:24,boxShadow:'0 22px 70px #162b551c',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',opacity:tween(f,50,70),transform:`translateY(${tween(f,50,76,25,0)}px)`}}><div style={{fontSize:55,color:C.blue,fontWeight:700}}>Architecture review.pptx</div><div style={{fontSize:36,color:C.muted,marginTop:27}}>5 slides · native, editable content</div><div style={{height:5,width:tween(f,65,91,0,530),background:C.blue,marginTop:38}}/></div>
 <div style={{position:'absolute',left:80,top:1030,fontSize:35,color:C.muted,opacity:tween(f,72,92)}}>Text. Diagrams. Charts. Yours to use.</div>
 </Shell>};
