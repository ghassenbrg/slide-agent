import React from 'react';
import {Img,useCurrentFrame} from 'remotion';
import {C,Crop,deck,Head,Shell,Tag,Thread,tween} from './kit';

export const Planning:React.FC = () => {const f=useCurrentFrame();const pull=tween(f,112,143);return <Shell><Head>Plans with<br/>a lighter touch.</Head>
 <div style={{position:'absolute',left:80,top:348,color:C.blue,fontSize:29}}>PROJECT PLANNING · ATLAS</div>
 <div style={{opacity:1-pull}}><Crop name="executive" n={1} box={[810,427,730,221]} x={80} y={488} w={920} style={{borderRadius:16,boxShadow:'0 18px 70px #192c5215'}}/>
 <Thread path="M160 667 L900 667" from={15} to={95}/>
 {['Foundation','MVP release','Public beta'].map((s,i)=><div key={s} style={{position:'absolute',left:100+i*308,top:830,width:275,textAlign:'center',fontSize:37,fontWeight:700,opacity:tween(f,12+i*27,32+i*27),color:i===1?C.blue:C.ink}}><div style={{fontSize:23,color:C.muted,marginBottom:16}}>{['COMPLETED','IN PROGRESS','PLANNED'][i]}</div>{s}</div>)}
 </div>
 <div style={{position:'absolute',left:60,top:440,width:960,height:540,opacity:pull,transform:`translateY(${(1-pull)*60}px)`,borderRadius:14,overflow:'hidden',boxShadow:'0 22px 65px #192c5224'}}><Img src={deck('executive',1)} style={{width:960,height:540}}/></div>
 <div style={{position:'absolute',left:80,top:1000,color:C.blue,fontSize:35,fontWeight:700,opacity:pull}}>Milestones. Workstreams. Decisions.</div>
 <Tag top={1070}>Illustrative project data · real generated deck</Tag></Shell>};
