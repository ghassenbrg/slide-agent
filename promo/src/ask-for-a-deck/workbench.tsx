import React from 'react';
import {Opening} from './Opening';
import {Connect} from './Connect';
import {Create} from './Create';
import {Preview} from './Preview';
import {Edit} from './Edit';
import {Range} from './Range';
import {Export} from './Export';
import {Close} from './Close';
import {FontGate} from './kit';
import {CaptionLayer} from './Captions';
import {Film, SHOTS} from './Film';

export function withBrandFont<P extends object>(Component:React.ComponentType<P>):React.FC<P> {
  return props=><><FontGate/><Component {...props}/></>;
}
const components=[Opening,Connect,Create,Preview,Edit,Range,Export,Close].map(c=>withBrandFont(c as React.ComponentType<any>));
const content=[
 {headline:'Professional presentations.\nThrough your AI agent.'},
 {headline:'In your AI agent.'},
 {request:'Create a five-slide Project Atlas update. Light, polished. Show the decisions.'},
 {headline:'Preview.'},
 {request:'Change the title to: Atlas is on track. One decision remains.'},
 {headline:'Different stories.\nDifferent looks.'},
 {headline:'Export.'},
 {website:'slide-agent.ghassen.io'},
];
export const WORKBENCH={
 name:'Slide Agent · Ask for a deck',revision:'approved-2026-10-03',fps:30,width:1080,height:1350,total:1560,background:'#f3f5f9',
 shots:SHOTS.map((s,i)=>({...s,label:s.id,component:components[i],props:content[i],schema:Object.keys(content[i]).map(key=>({type:'textarea',key,label:key,default:(content[i] as Record<string,string>)[key]}))})),
 transitions:[],captions:[{id:'captions',label:'Professional English captions',from:0,duration:1560,component:withBrandFont(CaptionLayer)}],overlays:[],
 sfx:[{from:0,duration:1560,src:'ask-for-a-deck/audio/voiceover.wav',volume:1},{from:0,duration:1560,src:'ask-for-a-deck/audio/actions.wav',volume:1}],
 bgm:[{from:0,duration:1560,src:'ask-for-a-deck/audio/music-mix.wav',volume:1}],order:['captions'],original:Film,
};
