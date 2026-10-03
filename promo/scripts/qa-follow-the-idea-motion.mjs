import {bundle} from '@remotion/bundler';
import {selectComposition,renderStill} from '@remotion/renderer';
import {mkdir} from 'node:fs/promises';
const serveUrl=await bundle({entryPoint:'src/follow-the-idea-motion/index.ts'});
const composition=await selectComposition({serveUrl,id:'SlideAgentActions'});
await mkdir('out/follow-the-idea-motion/qa',{recursive:true});
const frames=[20,60,150,230,290,380,432,454,510,605,690,722,790,835,895,943,990,1050,1125,1190,1260,1325,1360,1420,1530];
for(let i=0;i<frames.length;i+=3){await Promise.all(frames.slice(i,i+3).map(async frame=>{
 await renderStill({serveUrl,composition,frame,output:`out/follow-the-idea-motion/qa/frame-${String(frame).padStart(4,'0')}.png`,imageFormat:'png',logLevel:'error'});console.log('frame',frame);
}));}
