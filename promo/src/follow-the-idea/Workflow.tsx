import React from 'react';
import {Img,useCurrentFrame} from 'remotion';
import {C,deck,Head,Shell,Tag,Thread,tween} from './kit';

export const Workflow:React.FC = () => {const f=useCurrentFrame();return <Shell><Head>One place to ask.<br/>A deck to show.</Head>
 <div style={{position:'absolute',left:80,top:355,width:920,display:'flex',alignItems:'center',gap:20,fontSize:34}}><span style={{color:C.blue,fontWeight:700}}>Install Slide Agent</span><span>→</span><span>Codex / Claude Code</span></div>
 <div style={{position:'absolute',left:80,top:425,width:920,height:480,background:'#fff',border:'2px solid #d8dff1',borderRadius:20,boxShadow:'0 16px 45px #162b5510',overflow:'hidden'}}>
 <div style={{padding:'22px 28px',borderBottom:'1px solid #e3e7f1',fontSize:27,color:C.muted}}>AI AGENT · PRESENTATION REQUEST</div>
 <div style={{padding:'24px 28px',fontSize:40,lineHeight:1.25}}>Create a 5-slide AI platform review.<br/>For engineers. Dark, clear diagrams.</div>
 {[['slides_build','Build the deck'],['slides_view','Review the slides'],['slides_finalize','Export PowerPoint']].map(([tool,label],i)=>{const p=tween(f,40+i*28,61+i*28);return <div key={tool} style={{margin:'10px 28px',display:'flex',gap:18,alignItems:'center',opacity:p,transform:`translateX(${(1-p)*26}px)`,fontSize:32}}><span style={{color:C.teal,fontSize:30}}>✓</span><span style={{fontWeight:700}}>{label}</span><code style={{marginLeft:'auto',fontSize:22,color:C.muted}}>{tool}</code></div>;})}
 </div>
 <Thread path="M110 772 L110 945 Q110 985 150 985 L350 985" from={60} to={135}/>
 <div style={{position:'absolute',left:380,top:937,display:'flex',gap:24,alignItems:'center',opacity:tween(f,115,140)}}><Img src={deck('architecture',1)} style={{width:210,borderRadius:5}}/><div style={{fontSize:32,lineHeight:1.25,fontWeight:700}}>5 related slides<br/><span style={{fontSize:28,color:C.muted,fontWeight:400}}>Architecture review.pptx</span></div></div>
 <Tag top={1070}>Workflow recreation · steps condensed</Tag>
 </Shell>};
