import {Composition,Still} from 'remotion';
import {Film} from './Film';
import {Opening} from './Scenes';
const Cover=()=> <Opening cover/>;
export const MotionRoot=()=> <><Composition id="SlideAgentActions" component={Film} width={1080} height={1350} fps={30} durationInFrames={1560} defaultProps={{bgm:true}}/><Still id="SlideAgentActionsCover" component={Cover} width={1080} height={1350}/></>;
