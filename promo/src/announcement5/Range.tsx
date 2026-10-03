import type React from 'react';
import {interpolate,useCurrentFrame} from 'remotion';
import {Brand,clamp,ease,Note,out,pop,SlideImage,Stage,Type} from './kit';

const cases={
 executive:{title:'Lead the review.',accent:'#2563EB',label:'BUSINESS / PROJECTS',words:['Status','Milestones','Decisions']},
 analytics:{title:'Make the case.',accent:'#C2410C',label:'DATA / EVIDENCE',words:['Growth','Retention','Activation']},
 nova:{title:'Launch the idea.',accent:'#6D28D9',label:'PRODUCT / MARKETING',words:['Concept','Story','Visual identity']},
 transformation:{title:'Show the way.',accent:'#0F7C86',label:'STRATEGY / PLANNING',words:['Direction','Roadmap','Delivery']},
};
export const Work:React.FC<{deck:keyof typeof cases}>=({deck})=>{
 const f=useCurrentFrame(),c=cases[deck];const a=pop(f,0);
 const detail=interpolate(f,[55,74],[0,1],{...clamp,easing:ease.inOut});
 const height=562.5;
 return <Stage light><Brand light label={c.label}/><Type top={182} size={110} color={c.accent}>{c.title}</Type>
  <div style={{position:'absolute',left:80,top:345,display:'flex',gap:20,fontSize:31,color:'#53627A'}}>{c.words.map((w,i)=><span key={w} style={{opacity:out(f,i*8,i*8+9)}}>{w}{i<2?' /':''}</span>)}</div>
  <div style={{position:'absolute',left:40,top:478,width:1000,height,borderRadius:15,overflow:'hidden',boxShadow:'0 24px 60px #07142D33',translate:`${(1-a)*520}px ${-detail*18}px`,rotate:`${(1-a)*4}deg`,scale:1+detail*.015,border:'1px solid #D2DAE5'}}><SlideImage deck={deck} slide={1}/></div>
  <div style={{position:'absolute',left:80,top:1100,fontSize:48,fontWeight:700,color:c.accent,opacity:out(f,48,60),translate:`0 ${(1-out(f,48,60))*35}px`}}>{deck==='analytics'?'Charts with their data.':deck==='executive'?'Built for the decisions ahead.':deck==='nova'?'Give the story a visual identity.':'A plan people can follow.'}</div>
  <div style={{position:'absolute',left:80,top:1175,fontSize:30,color:'#53627A',opacity:out(f,64,76)}}>A different story. Its own design language.</div>
  <Note light>{deck==='nova'?'PRESENTATION SAMPLE · FICTIONAL PRODUCT AND UI':'ACTUAL SHOWCASE · ILLUSTRATIVE EXAMPLE DATA'}</Note>
 </Stage>;
};
