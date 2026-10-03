import type React from 'react';
import {Audio} from '@remotion/media';
import {AbsoluteFill,staticFile,useVideoConfig} from 'remotion';
import {TransitionSeries,linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {Reveal} from './scenes/Reveal';
import {Brief} from './scenes/Brief';
import {Direction} from './scenes/Direction';
import {Architecture} from './scenes/Architecture';
import {Native} from './scenes/Native';
import {Range} from './scenes/Range';
import {Start} from './scenes/Start';
import {Close} from './scenes/Close';

// 1,884 authored frames minus seven 12-frame overlaps = 1,800 / 60 seconds.
export const Announcement:React.FC=()=>{
 const {fps}=useVideoConfig();
 return <AbsoluteFill>
  <TransitionSeries>
   <TransitionSeries.Sequence name="Meet Slide Agent" durationInFrames={132} premountFor={fps}><Reveal/></TransitionSeries.Sequence>
   <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames:12})}/>
   <TransitionSeries.Sequence name="Your brief and context" durationInFrames={192} premountFor={fps}><Brief/></TransitionSeries.Sequence>
   <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames:12})}/>
   <TransitionSeries.Sequence name="Story and design" durationInFrames={162} premountFor={fps}><Direction/></TransitionSeries.Sequence>
   <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames:12})}/>
   <TransitionSeries.Sequence name="Architecture in focus" durationInFrames={312} premountFor={fps}><Architecture/></TransitionSeries.Sequence>
   <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames:12})}/>
   <TransitionSeries.Sequence name="Native editable PowerPoint" durationInFrames={192} premountFor={fps}><Native/></TransitionSeries.Sequence>
   <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames:12})}/>
   <TransitionSeries.Sequence name="Business data and roadmaps" durationInFrames={372} premountFor={fps}><Range/></TransitionSeries.Sequence>
   <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames:12})}/>
   <TransitionSeries.Sequence name="Install and create" durationInFrames={312} premountFor={fps}><Start/></TransitionSeries.Sequence>
   <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames:12})}/>
   <TransitionSeries.Sequence name="Official website" durationInFrames={210} premountFor={fps}><Close/></TransitionSeries.Sequence>
  </TransitionSeries>
  <Audio name="Original announcement score" src={staticFile('announcement3/audio/score.wav')} volume={0.65} premountFor={fps}/>
  <Audio name="Into your brief" from={117} src={staticFile('launch/audio/whoosh.wav')} volume={0.13} premountFor={fps}/>
  <Audio name="Design reveal" from={300} src={staticFile('launch/audio/land.wav')} volume={0.15} premountFor={fps}/>
  <Audio name="Native object selection" from={798} src={staticFile('launch/audio/pop.wav')} volume={0.2} premountFor={fps}/>
  <Audio name="Range reveal" from={927} src={staticFile('launch/audio/whoosh.wav')} volume={0.12} premountFor={fps}/>
 </AbsoluteFill>;
};
