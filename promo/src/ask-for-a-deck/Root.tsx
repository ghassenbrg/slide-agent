import {Composition,Folder,Still} from 'remotion';
import {Film} from './Film';import {Opening,Cover} from './Opening';import {Connect} from './Connect';import {Create} from './Create';import {Preview} from './Preview';import {Edit} from './Edit';import {Range} from './Range';import {Export} from './Export';import {Close} from './Close';import {FontGate} from './kit';
const CoverWithFont=()=> <><FontGate/><Cover/></>;
export const Root=()=> <>
 <Composition id="SlideAgentAskForADeck" component={Film} width={1080} height={1350} fps={30} durationInFrames={1560} defaultProps={{bgm:true}}/>
 <Still id="SlideAgentAskForADeckCover" component={CoverWithFont} width={1080} height={1350}/>
 <Folder name="Scenes">
  <Composition id="Opening" component={Opening} width={1080} height={1350} fps={30} durationInFrames={236} defaultProps={{headline:'Professional presentations.\nThrough your AI agent.'}}/>
  <Composition id="Connect" component={Connect} width={1080} height={1350} fps={30} durationInFrames={89} defaultProps={{headline:'In your AI agent.'}}/>
  <Composition id="Create" component={Create} width={1080} height={1350} fps={30} durationInFrames={206} defaultProps={{request:'Create a five-slide Project Atlas update. Light, polished. Show the decisions.'}}/>
  <Composition id="Preview" component={Preview} width={1080} height={1350} fps={30} durationInFrames={207} defaultProps={{headline:'Preview.'}}/>
  <Composition id="Edit" component={Edit} width={1080} height={1350} fps={30} durationInFrames={206} defaultProps={{request:'Change the title to: Atlas is on track. One decision remains.'}}/>
  <Composition id="Range" component={Range} width={1080} height={1350} fps={30} durationInFrames={236} defaultProps={{headline:'Different stories.\nDifferent looks.'}}/>
  <Composition id="Export" component={Export} width={1080} height={1350} fps={30} durationInFrames={177} defaultProps={{headline:'Export.'}}/>
  <Composition id="Close" component={Close} width={1080} height={1350} fps={30} durationInFrames={203} defaultProps={{website:'slide-agent.ghassen.io'}}/>
 </Folder>
</>;
