import {bundle} from '@remotion/bundler';
import {selectComposition,renderStill} from '@remotion/renderer';
import {mkdir} from 'node:fs/promises';
const serveUrl=await bundle({entryPoint:'src/ask-for-a-deck/index.ts'});
const composition=await selectComposition({serveUrl,id:'SlideAgentAskForADeck'});
await mkdir('out/ask-for-a-deck/qa',{recursive:true});
const frames=[15,40,68,82,90,150,220,265,303,357,399,414,483,522,575,620,705,770,810,847,890,931,970,1045,1130,1211,1245,1285,1325,1350,1395,1490,1550];
for(let i=0;i<frames.length;i+=3){await Promise.all(frames.slice(i,i+3).map(async frame=>{await renderStill({serveUrl,composition,frame,output:`out/ask-for-a-deck/qa/frame-${String(frame).padStart(4,'0')}.png`,imageFormat:'png',logLevel:'error'});console.log('frame',frame);}));}
