import React from 'react';
import {Img,useCurrentFrame} from 'remotion';
import {AtlasPieces,Brand,C,deck,ease,Kinetic,Pointer,pop,smooth,Stage} from './kit';
import timing from './timing.json';
export const Opening:React.FC<{headline?:string}>=({headline='Professional presentations.\nThrough your AI agent.'})=>{
 const f=useCurrentFrame(),r=timing.events.reveal,m=smooth(f,r,r+14),brand=pop(f,r),manual=1-ease(f,r-4,r+6),word=f<25?'Writing.':f<48?'Formatting.':'Moving boxes.';
 return <Stage brand={false}>
  <div style={{opacity:manual,transform:`translateY(${-60*m}px)`}}>
   <Kinetic key={word} text={word} at={f<25?0:f<48?25:48} size={95} style={{position:'absolute',left:80,top:174}}/>
   <div style={{position:'absolute',left:80,top:335,width:920,height:635,background:'#fff',borderRadius:22,boxShadow:'0 30px 75px #101c351c',overflow:'hidden'}}>
    <div style={{height:80,display:'flex',alignItems:'center',gap:32,padding:'0 32px',background:'#e9edf4',fontSize:25,color:C.muted}}><span style={{fontWeight:700,color:C.ink}}>Slide editor</span><span>Text</span><span>Shape</span><span>Align</span><span style={{marginLeft:'auto'}}>•••</span></div>
    <div style={{position:'absolute',left:36,top:116,width:848,height:478,background:'#f8f9fc',border:'1px solid #e1e6ef'}}>
     <div style={{position:'absolute',left:58,top:49,fontSize:48,fontWeight:700}}>{f<25?'Project'.slice(0,Math.floor(f/3)+1):'Project update'}<span style={{color:C.blue,opacity:f%20<10?1:0}}>│</span></div>
     <div style={{position:'absolute',left:smooth(f,30,44,94,58),top:smooth(f,48,61,178,165),width:326,height:209,background:'#e7edf9',border:'2px solid #2f5bff',borderRadius:10}}>{[[0,0],[326,0],[0,209],[326,209]].map(([x,y],i)=><i key={i} style={{position:'absolute',left:x-5,top:y-5,width:10,height:10,background:'white',border:`2px solid ${C.blue}`}}/>)}</div>
     <div style={{position:'absolute',left:435,top:165,width:326,height:209,background:'#edf0f5',borderRadius:10}}/>
     <div style={{position:'absolute',left:58,top:395,width:703,height:7,background:'#dce3ef'}}/>
     <div style={{position:'absolute',left:58,top:137,width:1,height:287,background:C.blue,opacity:ease(f,26,30)*(1-ease(f,48,60))}}/>
    </div>
   </div>
  </div>
  <div style={{position:'absolute',left:80,top:166,opacity:Math.min(1,brand*2),transform:`translateY(${(1-brand)*35}px)`}}><Brand size={73}/></div>
  <Kinetic text={headline} at={r+2} size={64} style={{position:'absolute',left:80,top:304,right:65,color:C.ink,lineHeight:1.11,opacity:m}}/>
  <div style={{position:'absolute',left:80,top:477,width:920,height:128,boxSizing:'border-box',padding:'24px 28px',background:'#fff',border:`1px solid ${C.line}`,borderRadius:22,fontSize:36,lineHeight:1.16,fontWeight:550,opacity:m,transform:`translateY(${(1-m)*30}px)`}}>“Create a polished Project Atlas update.”</div>
  <div style={{position:'absolute',left:80,top:617,fontSize:25,fontWeight:650,color:C.blue,opacity:m}}>YOUR REQUEST <span style={{margin:'0 14px'}}>↓</span> REAL SLIDE AGENT OUTPUT</div>
  <div style={{position:'absolute',left:745*(1-m)+80*m,top:974*(1-m)+663*m,width:255*(1-m)+920*m,height:(255*(1-m)+920*m)*9/16,borderRadius:16,boxShadow:'0 25px 70px #101c3525',overflow:'hidden',transform:`rotate(${(1-m)*-5}deg)`}}>{f<r?<Img src={deck()} style={{width:'100%'}}/>:<AtlasPieces f={f-r+10} w={255*(1-m)+920*m}/>}</div>
  <Pointer x={smooth(f,24,44,618,297)+smooth(f,48,64,0,150)} y={smooth(f,24,44,782,616)+smooth(f,48,64,0,-30)} f={f} press={32} opacity={manual}/>
  <div style={{position:'absolute',left:80,top:1030,fontSize:27,color:C.muted,opacity:manual}}>Writing. Formatting. Moving boxes.</div>
 </Stage>;
};
export const Cover=()=> <Stage brand={false}><Brand size={74} style={{position:'absolute',left:80,top:125}}/><Kinetic text={'Professional presentations.\nThrough your AI agent.'} at={-100} size={67} style={{position:'absolute',left:80,top:299,right:65,lineHeight:1.12}}/><div style={{position:'absolute',left:80,top:493,width:920,padding:'25px 28px',boxSizing:'border-box',borderRadius:20,background:'white',fontSize:36,fontWeight:550}}>“Create a polished Project Atlas update.”</div><div style={{position:'absolute',left:80,top:646,width:920,height:517.5,borderRadius:16,overflow:'hidden',boxShadow:'0 20px 60px #101c3525'}}><Img src={deck()} style={{width:920}}/></div><div style={{position:'absolute',left:80,top:1210,fontSize:40,fontWeight:650,color:C.blue}}>slide-agent.ghassen.io</div></Stage>;
