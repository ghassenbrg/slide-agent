import React from 'react';
import {Img,interpolate,useCurrentFrame} from 'remotion';
import {deck,Head,Shell,Tag,tween} from './kit';

export const DataStory:React.FC = () => {
 const f=useCurrentFrame();
 const z=tween(f,135,170,920/970,.6);
 const cx=tween(f,135,170,549,800),cy=tween(f,135,170,533,450);
 const reveal=interpolate(f,[12,82],[0,100],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
 return <Shell cream><Head color="#1c1b20">Data with<br/>a point of view.</Head>
 <div style={{position:'absolute',left:80,top:348,color:'#c44612',fontSize:29}}>DATA STORYTELLING · GROWTH TO RETENTION</div>
 <div style={{position:'absolute',left:60,top:407,width:960,height:tween(f,135,170,540,630),overflow:'hidden',borderRadius:14}}>
  <div style={{position:'absolute',width:1600,height:900,transformOrigin:'0 0',transform:`translate(${480-cx*z}px,${315-cy*z}px) scale(${z})`}}>
   <Img src={deck('analytics',2)} style={{width:1600,height:900}}/>
   <div style={{position:'absolute',left:176,top:288,width:784,height:436,background:'#f6f3ec',clipPath:`inset(0 0 0 ${reveal}%)`}}/>
  </div>
 </div>
 <div style={{position:'absolute',left:90,top:950,display:'flex',gap:27,alignItems:'center',opacity:tween(f,88,106)*(1-tween(f,117,124)),background:'#f6f3ec',padding:'5px 15px'}}><div style={{fontSize:82,fontFamily:'Georgia, serif',color:'#c44612'}}>+88%</div><div style={{fontSize:34,lineHeight:1.3}}>Six-month growth<br/><span style={{fontSize:27,color:'#68645c'}}>42K → 79K monthly active users</span></div></div>
 <Tag top={1070}>Illustrative analytics data · real generated chart</Tag>
 </Shell>};
