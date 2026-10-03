import React from 'react';
import {Img,useCurrentFrame} from 'remotion';
import {asset,Brand,C,deck,ease,Kinetic,Pointer,pop,Proof,Stage} from './kit';
import timing from './timing.json';
export const Connect:React.FC<{headline?:string}>=({headline='In your AI agent.'})=>{const f=useCurrentFrame(),press=timing.events.connect-timing.shots[1].from,p=pop(f,press);return <Stage brand={false}>
 <Brand size={73} style={{position:'absolute',left:80,top:166}}/>
 <Kinetic text={headline} size={76} style={{position:'absolute',left:80,top:326}}/>
 <div style={{position:'absolute',left:80,top:471,width:920,height:291,background:'white',borderRadius:24,boxShadow:'0 20px 60px #101c3517',padding:32,boxSizing:'border-box'}}><div style={{fontSize:34,color:C.muted}}>Choose a supported agent</div><div style={{display:'flex',gap:24,marginTop:26}}>{['Codex','Claude Code'].map((s,i)=><div key={s} style={{width:414,height:126,borderRadius:18,border:`2px solid ${i===0&&f>=press?C.blue:C.line}`,background:i===0&&f>=press?'#eef2ff':'#f7f8fc',display:'flex',alignItems:'center',justifyContent:'center',gap:22,fontSize:44,fontWeight:650}}>{s}{i===0&&f>=press&&<span style={{color:C.blue}}>✓</span>}</div>)}</div></div>
 <div style={{position:'absolute',left:80,top:799,width:920,height:164,background:C.ink,color:'white',borderRadius:24,display:'flex',alignItems:'center',gap:26,padding:'0 35px',boxSizing:'border-box',opacity:ease(f,press,press+8),transform:`translateY(${(1-p)*35}px)`}}><Img src={asset('icon.png')} style={{width:70,height:70}}/><div style={{fontSize:40,fontWeight:650}}>Slide Agent <span style={{display:'block',fontSize:29,color:'#8be1cc',marginTop:9}}>Installed in your agent ✓</span></div><Img src={deck()} style={{width:235,marginLeft:'auto',borderRadius:8}}/></div>
 <Pointer x={ease(f,9,press,805,337)} y={ease(f,9,press,850,647)} press={press} f={f} opacity={1-ease(f,press+12,press+24)}/>
 <Proof>Setup illustration · Follow the installation guide</Proof>
 </Stage>;};
