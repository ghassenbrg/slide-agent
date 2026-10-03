import React from 'react';
import {AbsoluteFill,Sequence} from 'remotion';
import {Audio} from '@remotion/media';
import {Opening} from './Opening';import {Connect} from './Connect';import {Create} from './Create';import {Preview} from './Preview';import {Edit} from './Edit';import {Range} from './Range';import {Export} from './Export';import {Close} from './Close';
import {asset,FontGate} from './kit';import {CaptionLayer} from './Captions';import timing from './timing.json';
export const SHOTS=timing.shots;
export const Film:React.FC<{bgm:boolean}>=({bgm=true})=><AbsoluteFill><FontGate/>
 <Sequence name="Brief manual work → agent and Atlas reveal" from={0} durationInFrames={236} premountFor={30}><Opening/></Sequence>
 <Sequence name="Connect to a supported agent" from={236} durationInFrames={89} premountFor={30}><Connect/></Sequence>
 <Sequence name="Request → send → real deck" from={325} durationInFrames={206} premountFor={30}><Create/></Sequence>
 <Sequence name="Preview the complete Atlas deck" from={531} durationInFrames={207} premountFor={30}><Preview/></Sequence>
 <Sequence name="Request a real headline edit" from={738} durationInFrames={206} premountFor={30}><Edit/></Sequence>
 <Sequence name="Three contrasting deck styles" from={944} durationInFrames={236} premountFor={30}><Range/></Sequence>
 <Sequence name="Export and open the real PowerPoint" from={1180} durationInFrames={177} premountFor={30}><Export/></Sequence>
 <Sequence name="Brand and website hold" from={1357} durationInFrames={203} premountFor={30}><Close/></Sequence>
 <CaptionLayer/>
 <Audio name="Concise professional narration" src={asset('audio/voiceover.wav')} durationInFrames={1560} premountFor={30}/>
 <Audio name="Physical typing, send, motion and export sounds" src={asset('audio/actions.wav')} durationInFrames={1560} premountFor={30}/>
 {bgm&&<Audio name="Approved A — House Vibez, arranged and ducked" src={asset('audio/music-mix.wav')} durationInFrames={1560} premountFor={30}/>} 
</AbsoluteFill>;
