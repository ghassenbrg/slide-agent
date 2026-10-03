import type React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {clamp, display, ease, mono} from '../launch/theme';

export {clamp, display, ease, mono};
export const P = {night: '#080F22', panel: '#111C35', line: '#25334F', white: '#F1F5FC', muted: '#A9B8D2', cyan: '#69DDFF', violet: '#B4A0FF', paper: '#EEF2F8', ink: '#10203B'};
export const URL = 'slide-agent.ghassen.io';
export const COMMAND = 'npx --yes --package @slide-agent/core@latest -- slide-agent install';
export const asset = (deck: string, slide = 1) => staticFile(`announcement3/${deck}/0${slide}.png`);
export const enter = (f: number, at = 0, length = 20) => interpolate(f, [at, at + length], [0, 1], {...clamp, easing: ease.out});

export const Stage: React.FC<{children: React.ReactNode; light?: boolean}> = ({children, light = false}) => <AbsoluteFill style={{background: light ? P.paper : P.night, color: light ? P.ink : P.white, fontFamily: display}}>
  <AbsoluteFill style={{background: light ? 'radial-gradient(ellipse at 100% 20%, #DCE7FA88, transparent 60%)' : 'radial-gradient(ellipse at 90% 50%, #20346566, transparent 62%), radial-gradient(ellipse at 0% 95%, #28204955, transparent 60%)'}} />
  {children}
</AbsoluteFill>;

export const Brand: React.FC<{light?: boolean; label?: string}> = ({light, label = 'INTRODUCING'}) => <div style={{position:'absolute',left:80,right:80,top:72,display:'flex',alignItems:'center',gap:14,color:light?P.ink:P.white}}>
  <Img src={staticFile('icon.png')} style={{width:48,height:48}} />
  <span style={{fontFamily:display,fontSize:32,fontWeight:700,letterSpacing:'-0.035em'}}>Slide Agent</span>
  <span style={{marginLeft:'auto',fontFamily:mono,fontSize:19,letterSpacing:'0.13em',color:light?'#566783':P.muted}}>{label}</span>
</div>;

export const Heading: React.FC<{children: React.ReactNode; top?:number; size?:number; at?:number}> = ({children,top=190,size=88,at=0}) => {
  const f=useCurrentFrame(); const a=enter(f,at);
  return <div style={{position:'absolute',left:80,right:72,top,fontSize:size,fontWeight:700,lineHeight:1.04,letterSpacing:'-0.047em',opacity:a,translate:`0 ${(1-a)*22}px`}}>{children}</div>;
};

export const Foot: React.FC<{children:React.ReactNode;light?:boolean}> = ({children,light}) => <div style={{position:'absolute',left:80,right:80,bottom:62,fontFamily:mono,fontSize:18,letterSpacing:'0.025em',color:light?'#566783':P.muted}}>{children}</div>;

export const SlideImage: React.FC<{deck:string;slide?:number;style?:React.CSSProperties}> = ({deck,slide=1,style}) => <Img src={asset(deck,slide)} style={{width:'100%',height:'auto',display:'block',...style}} />;

// A viewport around an actual PowerPoint export. x/y are normalized slide
// coordinates; the camera never substitutes a fabricated slide design.
export const Camera: React.FC<{deck:string;slide?:number;width:number;height:number;zoom?:number;x?:number;y?:number;children?:React.ReactNode}> = ({deck,slide=1,width,height,zoom=1,x=.5,y=.5,children}) => {
  const h=width*9/16; const left=width/2-x*width*zoom;const top=height/2-y*h*zoom;
  return <div style={{width,height,overflow:'hidden',position:'relative',background:'#0A1022'}}>
    <div style={{position:'absolute',left,top,width,height:h,scale:zoom,transformOrigin:'0 0'}}><SlideImage deck={deck} slide={slide}/>{children}</div>
  </div>;
};
