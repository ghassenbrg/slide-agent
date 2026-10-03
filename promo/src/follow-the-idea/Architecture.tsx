import React from 'react';
import {Img,interpolate,useCurrentFrame} from 'remotion';
import {deck,ease,Head,Shell,Tag,tween} from './kit';

export const Architecture:React.FC = () => {
 const f=useCurrentFrame();
 const z=interpolate(f,[0,28,65,105,140,170,197],[.6,1.12,1.12,1.12,1.12,.6,.6],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:ease});
 const cx=interpolate(f,[0,28,65,105,140,170],[800,620,700,1100,1170,800],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:ease});
 const cy=interpolate(f,[0,28,140,170],[450,450,450,450],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
 const paths=[{d:'M600 462 L654 462',a:25,b:57,c:'#38bdf8'}, {d:'M834 462 L855 462 L855 313 L876 313',a:57,b:95,c:'#38bdf8'}, {d:'M1135 313 L1161 313 L1161 258 L1200 258',a:95,b:125,c:'#a78bfa'}, {d:'M834 462 L855 462 L855 609 L876 609 M1135 604 L1161 604 L1161 534 L1200 534',a:125,b:155,c:'#14d4bb'}];
 return <Shell dark><Head>Follow the<br/>connections.</Head><div style={{position:'absolute',left:80,top:346,color:'#8eaccb',fontSize:29}}>01 / 05 · AI PLATFORM ARCHITECTURE</div>
 <div style={{position:'absolute',left:60,top:407,width:960,height:630,overflow:'hidden',background:'#111a33',borderRadius:18}}><div style={{position:'absolute',width:1600,height:900,transformOrigin:'0 0',transform:`translate(${480-cx*z}px, ${315-cy*z}px) scale(${z})`}}><Img src={deck('architecture',1)} style={{width:1600,height:900}}/><svg width="1600" height="900" style={{position:'absolute',inset:0}}>{paths.map(p=><path key={p.d} d={p.d} fill="none" stroke={p.c} strokeWidth={5} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1-tween(f,p.a,p.b)} opacity={1-tween(f,168,190)}/>)}</svg></div></div>
 <Tag top={1070} dark>Gateway → services → model + data</Tag></Shell>;
};
