import type React from 'react';
import {Audio} from '@remotion/media';
import {AbsoluteFill,interpolate,Sequence,Series,staticFile,useCurrentFrame,useVideoConfig} from 'remotion';
import {clamp} from './kit';
import {Hook} from './Opening';
import {Ask,Build} from './Workflow';
import {Systems} from './Technical';
import {Work} from './Range';
import {Refine,Output} from './Refine';
import {Close} from './Finish';

const Wipe:React.FC=()=>{const f=useCurrentFrame();return <AbsoluteFill style={{background:'#2F5BFF',translate:`${interpolate(f,[0,4,8],[-1080,0,1080],clamp)}px 0`}}/>;};
export const AnnouncementV5:React.FC<{bgm?:boolean}>=({bgm=true})=>{
 const {fps}=useVideoConfig();
 return <AbsoluteFill style={{background:'#080F22'}}>
  <Series>
   <Series.Sequence name="Ideas in PowerPoint" durationInFrames={90} premountFor={fps}><Hook/></Series.Sequence>
   <Series.Sequence name="Just ask" durationInFrames={90} premountFor={fps}><Ask/></Series.Sequence>
   <Series.Sequence name="Direct and build" durationInFrames={120} premountFor={fps}><Build/></Series.Sequence>
   <Series.Sequence name="Connected systems" durationInFrames={120} premountFor={fps}><Systems/></Series.Sequence>
   <Series.Sequence name="Business and projects" durationInFrames={120} premountFor={fps}><Work deck="executive"/></Series.Sequence>
   <Series.Sequence name="Analytics first slide" durationInFrames={120} premountFor={fps}><Work deck="analytics"/></Series.Sequence>
   <Series.Sequence name="Product and marketing" durationInFrames={120} premountFor={fps}><Work deck="nova"/></Series.Sequence>
   <Series.Sequence name="Strategy and planning" durationInFrames={120} premountFor={fps}><Work deck="transformation"/></Series.Sequence>
   <Series.Sequence name="Ask and refine" durationInFrames={120} premountFor={fps}><Refine/></Series.Sequence>
   <Series.Sequence name="A complete deck" durationInFrames={150} premountFor={fps}><Output/></Series.Sequence>
   <Series.Sequence name="Try Slide Agent" durationInFrames={180} premountFor={fps}><Close/></Series.Sequence>
  </Series>
  <Sequence name="Wipe into the workflow" from={86} durationInFrames={8} premountFor={fps}><Wipe/></Sequence>
  <Sequence name="Wipe into the range" from={416} durationInFrames={8} premountFor={fps}><Wipe/></Sequence>
  <Sequence name="Wipe into the close" from={1166} durationInFrames={8} premountFor={fps}><Wipe/></Sequence>
  {bgm?<Audio name="Launch groove" src={staticFile('announcement5/audio/score.wav')} volume={.68} premountFor={fps}/>:null}
  {[45,68,86,180,300,360,416,540,660,780,954,1080,1166].map((at,i)=><Audio key={at} name={`Edit accent ${i+1}`} from={at} src={staticFile(i%3===0?'launch/audio/whoosh.wav':'launch/audio/land.wav')} volume={i%3===0?.18:.24} premountFor={fps}/>)}
  <Audio name="Product resolve" from={1170} src={staticFile('audio/slam.wav')} volume={.22} premountFor={fps}/>
 </AbsoluteFill>;
};
