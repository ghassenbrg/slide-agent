import React from 'react';
import {Audio} from '@remotion/media';
import {AbsoluteFill,Series,staticFile} from 'remotion';
import {Opening} from './Opening';
import {Workflow} from './Workflow';
import {Architecture} from './Architecture';
import {Coherence} from './Coherence';
import {Planning} from './Planning';
import {DataStory} from './DataStory';
import {Deliverable} from './Deliverable';
import {Close} from './Close';
import {CaptionLayer} from './Captions';

export const Film:React.FC<{bgm:boolean}> = ({bgm=true}) => <AbsoluteFill>
 <Series>
  <Series.Sequence name="Request becomes a deck" durationInFrames={180} premountFor={30}><Opening/></Series.Sequence>
  <Series.Sequence name="Supported agent workflow" durationInFrames={210} premountFor={30}><Workflow/></Series.Sequence>
  <Series.Sequence name="Follow diagram connections" durationInFrames={240} premountFor={30}><Architecture/></Series.Sequence>
  <Series.Sequence name="A coherent deck" durationInFrames={210} premountFor={30}><Coherence/></Series.Sequence>
  <Series.Sequence name="Light project planning" durationInFrames={210} premountFor={30}><Planning/></Series.Sequence>
  <Series.Sequence name="Editorial data storytelling" durationInFrames={210} premountFor={30}><DataStory/></Series.Sequence>
  <Series.Sequence name="PowerPoint delivery" durationInFrames={120} premountFor={30}><Deliverable/></Series.Sequence>
  <Series.Sequence name="Explore Slide Agent" durationInFrames={180} premountFor={30}><Close/></Series.Sequence>
 </Series>
 <CaptionLayer/>
 <Audio name="Opening narration" src={staticFile('follow-the-idea/audio/opening.wav')} from={0} durationInFrames={180} premountFor={30}/>
 <Audio name="Workflow narration" src={staticFile('follow-the-idea/audio/workflow.wav')} from={180} durationInFrames={210} premountFor={30}/>
 <Audio name="Architecture narration" src={staticFile('follow-the-idea/audio/architecture.wav')} from={390} durationInFrames={240} premountFor={30}/>
 <Audio name="Consistency narration" src={staticFile('follow-the-idea/audio/coherence.wav')} from={630} durationInFrames={210} premountFor={30}/>
 <Audio name="Planning narration" src={staticFile('follow-the-idea/audio/planning.wav')} from={840} durationInFrames={210} premountFor={30}/>
 <Audio name="Analytics narration" src={staticFile('follow-the-idea/audio/data.wav')} from={1050} durationInFrames={210} premountFor={30}/>
 <Audio name="PowerPoint narration" src={staticFile('follow-the-idea/audio/deliverable.wav')} from={1260} durationInFrames={120} premountFor={30}/>
 <Audio name="Website narration" src={staticFile('follow-the-idea/audio/close.wav')} from={1380} durationInFrames={180} premountFor={30}/>
 <Audio name="Air cues for scene gestures" src={staticFile('follow-the-idea/audio/motion.wav')} volume={.2} durationInFrames={1560} premountFor={30}/>
 {bgm&&<Audio name="Original 120 BPM score" src={staticFile('follow-the-idea/audio/music.wav')} volume={.18} durationInFrames={1560} premountFor={30}/>}
 </AbsoluteFill>;
