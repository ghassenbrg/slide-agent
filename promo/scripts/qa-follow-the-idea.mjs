import {bundle} from '@remotion/bundler';
import {selectComposition,renderStill} from '@remotion/renderer';
import {mkdir} from 'node:fs/promises';
const serveUrl=await bundle({entryPoint:'src/follow-the-idea/index.ts'});
const composition=await selectComposition({serveUrl,id:'FollowTheIdea'});
await mkdir('out/follow-the-idea/qa',{recursive:true});
const frames=[0,45,150,220,315,410,455,510,565,610,670,715,775,825,870,935,1010,1080,1130,1180,1240,1290,1350,1395,1470,1550];
for(let i=0;i<frames.length;i+=3){await Promise.all(frames.slice(i,i+3).map(async frame=>{
 await renderStill({serveUrl,composition,frame,output:`out/follow-the-idea/qa/frame-${String(frame).padStart(4,'0')}.png`,imageFormat:'png',logLevel:'error'});console.log('frame',frame);
}));}
