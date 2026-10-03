import type React from 'react';
import {interpolate,useCurrentFrame} from 'remotion';
import {Brand,clamp,ease,Foot,Heading,SlideImage,Stage} from '../shared';

const examples=[
 {deck:'executive',slide:1,name:'Business & projects',copy:'Status. Milestones. Decisions.',color:'#2563EB',detail:'A clear view of the work.'},
 {deck:'analytics',slide:1,name:'Data & evidence',copy:'Native charts. Underlying data.',color:'#C2410C',detail:'Make the insight visible.'},
 {deck:'transformation',slide:1,name:'Strategy & planning',copy:'Roadmaps. Timelines. Diagrams.',color:'#0F7C86',detail:'Turn direction into a plan.'},
];
export const Range:React.FC=()=>{
 const f=useCurrentFrame();const i=Math.min(2,Math.floor(f/120));const e=examples[i];const l=f-i*120;
 const scale=interpolate(l,[0,110],[.985,1.02],{...clamp,easing:ease.inOut});
 const h=920*9/16;
 return <Stage light><Brand light label="ONE TOOL / MANY STYLES"/>
  <Heading size={86}>For the work<br/><span style={{color:e.color}}>you present.</span></Heading>
  <div style={{position:'absolute',left:80,top:422,display:'flex',gap:12}}>{examples.map((x,j)=><span key={x.deck} style={{padding:'12px 18px',fontSize:25,fontWeight:600,borderRadius:30,background:j===i?e.color:'#DDE4EF',color:j===i?'#FFF':'#52627D'}}>{x.name}</span>)}</div>
  <div key={e.deck} style={{position:'absolute',left:80,top:524,width:920,height:h,borderRadius:14,overflow:'hidden',boxShadow:'0 24px 60px #12274426',border:'1px solid #CDD6E4',scale,translate:`${interpolate(l,[0,12],[24,0],{...clamp,easing:ease.out})}px 0`,opacity:interpolate(l,[0,9],[0,1],clamp)}}>
   <SlideImage deck={e.deck} slide={e.slide}/>
  </div>
  <div style={{position:'absolute',left:80,top:1090,fontSize:42,fontWeight:600,color:e.color}}>{e.detail}</div>
  <div style={{position:'absolute',left:80,top:1150,fontSize:33,color:'#52627D'}}>{e.copy}</div>
  <Foot light>REAL SHOWCASE PRESENTATIONS · ILLUSTRATIVE BUSINESS DATA</Foot>
 </Stage>;
};
