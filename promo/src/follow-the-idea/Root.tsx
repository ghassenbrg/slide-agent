import React from 'react';
import {Composition,Folder,Still} from 'remotion';
import {Film} from './Film';
import {Opening} from './Opening';
import {Workflow} from './Workflow';
import {Architecture} from './Architecture';
import {Coherence} from './Coherence';
import {Planning} from './Planning';
import {DataStory} from './DataStory';
import {Deliverable} from './Deliverable';
import {Close} from './Close';
import {Cover} from './Cover';

export const IdeaRoot:React.FC = () => <>
 <Composition id="FollowTheIdea" component={Film} width={1080} height={1350} fps={30} durationInFrames={1560} defaultProps={{bgm:true}}/>
 <Still id="FollowTheIdeaCover" component={Cover} width={1080} height={1350}/>
 <Folder name="Follow-The-Idea-Scenes">
 <Composition id="IdeaOpening" component={Opening} width={1080} height={1350} fps={30} durationInFrames={180}/>
 <Composition id="IdeaWorkflow" component={Workflow} width={1080} height={1350} fps={30} durationInFrames={210}/>
 <Composition id="IdeaArchitecture" component={Architecture} width={1080} height={1350} fps={30} durationInFrames={240}/>
 <Composition id="IdeaCoherence" component={Coherence} width={1080} height={1350} fps={30} durationInFrames={210}/>
 <Composition id="IdeaPlanning" component={Planning} width={1080} height={1350} fps={30} durationInFrames={210}/>
 <Composition id="IdeaDataStory" component={DataStory} width={1080} height={1350} fps={30} durationInFrames={210}/>
 <Composition id="IdeaDeliverable" component={Deliverable} width={1080} height={1350} fps={30} durationInFrames={120}/>
 <Composition id="IdeaClose" component={Close} width={1080} height={1350} fps={30} durationInFrames={180}/>
 </Folder>
</>;
