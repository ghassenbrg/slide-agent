import type React from 'react';
import {Img,interpolate,staticFile,useCurrentFrame} from 'remotion';
import {Blue,Brand,Card,clamp,Note,out,pop,Stage,Type} from './kit';

export const Hook:React.FC=()=>{
 const f=useCurrentFrame();
 const cards=[{deck:'architecture',at:0},{deck:'analytics',at:45},{deck:'executive',at:68}];
 return <Stage light><Brand light label="INTRODUCING"/>
  <div style={{position:'absolute',left:80,right:80,top:190,fontSize:116,fontWeight:800,lineHeight:1,letterSpacing:'-.055em'}}>One brief.<br/><span style={{color:'#2F5BFF'}}>Your next deck.</span></div>
  <div style={{position:'absolute',left:84,top:455,fontSize:38,color:'#52627D'}}>Your AI assistant → editable PowerPoint.</div>
  {cards.map((c,i)=>{const t=i===0?1:out(f,c.at,c.at+14);return <Card key={c.deck} deck={c.deck} style={{left:40+1050*(1-t),top:570+i*14,width:1000,rotate:`${i===0?interpolate(f,[0,40],[-3,0],clamp):(1-t)*9}deg`,scale:i===0?interpolate(f,[0,55],[1.04,1],clamp):1,opacity:i===0?1:out(f,c.at,c.at+5),border:'1px solid #CFD7E5'}}/>;})}
  <div style={{position:'absolute',left:84,top:1200,fontSize:31,fontWeight:600,color:'#2F5BFF'}}>Real slides. Ready to make your own.</div>
 </Stage>;
};

export const Product:React.FC=()=>{
 const f=useCurrentFrame();const p=pop(f);
 return <Blue>
  <div style={{position:'absolute',left:240,top:225,width:600,height:600,border:'2px solid #FFFFFF66',borderRadius:'50%',scale:interpolate(f,[0,32],[.4,1.8],clamp),opacity:interpolate(f,[0,32],[.6,0],clamp)}}/>
  <Img src={staticFile('icon.png')} style={{position:'absolute',width:230,height:230,left:425,top:250,scale:.6+.4*p,rotate:`${(1-p)*-16}deg`,filter:'drop-shadow(0 30px 50px #07174666)'}}/>
  <Type top={555} size={128} center>Slide Agent.</Type>
  <div style={{position:'absolute',left:80,right:80,top:743,textAlign:'center',fontSize:46,lineHeight:1.25,opacity:out(f,6,18)}}>An open-source presentation tool<br/>for your AI assistant.</div>
  <div style={{position:'absolute',left:80,right:80,top:1010,textAlign:'center',fontSize:35,opacity:out(f,18,28)}}>Brief → design → editable .pptx</div>
  <Note>INTRODUCING SLIDE AGENT</Note>
 </Blue>;
};
