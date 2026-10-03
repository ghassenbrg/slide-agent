import {Opening,Install,Create,Preview,Edit,Range,Export,Close} from './Scenes';
import {CaptionLayer} from './Captions';
import React from 'react';
import {Film,SHOTS,Curtain} from './Film';
import {C,tw} from './kit';
const Overlay:React.FC=()=>React.createElement(React.Fragment,null,React.createElement(CaptionLayer),React.createElement(Curtain));
const SCENES=[Opening,Install,Create,Preview,Edit,Range,Export,Close];
export const WORKBENCH={name:'Slide Agent — Ask. See. Shape. Present.',fps:30,width:1080,height:1350,total:1560,background:C.paper,shots:SHOTS.map((s,i)=>({...s,label:s.id,component:SCENES[i]})),captions:[{id:'captions',label:'English captions',from:0,duration:1560,component:Overlay}],sfx:[...SHOTS.map(s=>({from:s.from,duration:s.duration,src:`follow-the-idea-motion/audio/${s.id}.wav`,volume:1})),{from:0,duration:1560,src:'follow-the-idea-motion/audio/actions.wav',volume:.42}],bgm:[{from:0,duration:1560,src:'follow-the-idea/audio/music.wav',volume:(f:number)=>{const s=SHOTS.find(s=>f>=s.from&&f<s.from+s.duration)!;return .15+tw(f,s.from+s.duration-35,s.from+s.duration-15)*.08-tw(f,s.from+s.duration-10,s.from+s.duration)*.08;}}],original:Film};
