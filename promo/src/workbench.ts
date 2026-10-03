import {Opening} from './follow-the-idea/Opening';
import {Workflow} from './follow-the-idea/Workflow';
import {Architecture} from './follow-the-idea/Architecture';
import {Coherence} from './follow-the-idea/Coherence';
import {Planning} from './follow-the-idea/Planning';
import {DataStory} from './follow-the-idea/DataStory';
import {Deliverable} from './follow-the-idea/Deliverable';
import {Close} from './follow-the-idea/Close';
import {CaptionLayer} from './follow-the-idea/Captions';
import {Film} from './follow-the-idea/Film';
import {SHOTS,TOTAL} from './follow-the-idea/timeline';
import {C} from './follow-the-idea/kit';
export const WORKBENCH={
 name:'Slide Agent — Follow the idea',fps:30,width:1080,height:1350,total:TOTAL,background:C.paper,
 shots:[
  {id:'opening',label:'Request and real deck',...SHOTS.opening,component:Opening},
  {id:'workflow',label:'Supported agent workflow',...SHOTS.workflow,component:Workflow},
  {id:'architecture',label:'Follow connections',...SHOTS.architecture,component:Architecture},
  {id:'coherence',label:'A coherent deck',...SHOTS.coherence,component:Coherence},
  {id:'planning',label:'Light project planning',...SHOTS.planning,component:Planning},
  {id:'data',label:'Editorial data storytelling',...SHOTS.data,component:DataStory},
  {id:'deliverable',label:'Editable PowerPoint',...SHOTS.deliverable,component:Deliverable},
  {id:'close',label:'Explore Slide Agent',...SHOTS.close,component:Close,props:{website:'slide-agent.ghassen.io'},schema:[{type:'text',key:'website',label:'Website',default:'slide-agent.ghassen.io'}]},
 ],
 captions:[{id:'captions',label:'English captions',from:0,duration:TOTAL,component:CaptionLayer}],
 sfx:[
  ...Object.entries(SHOTS).map(([id,s])=>({from:s.from,duration:s.duration,src:`follow-the-idea/audio/${id}.wav`,volume:1})),
  {from:0,duration:TOTAL,src:'follow-the-idea/audio/motion.wav',volume:.2},
 ],
 bgm:[{from:0,duration:TOTAL,src:'follow-the-idea/audio/music.wav',volume:.18}],
 original:Film,
};
