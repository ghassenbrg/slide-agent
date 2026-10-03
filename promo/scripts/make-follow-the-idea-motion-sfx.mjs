// Seeded physical keyboard, mouse and paper/air textures; no notification tones.
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {addAt,mulberry32,SR,stereo,writeWav} from './dsp.mjs';
const out=join(dirname(fileURLToPath(import.meta.url)),'../public/follow-the-idea-motion/audio');
const mix=stereo(52),rand=mulberry32(10103);
function click(d=.045){const a=new Float32Array(d*SR);let lp=0;for(let i=0;i<a.length;i++){lp=.6*lp+.4*(rand()*2-1);a[i]=lp*Math.exp(-i/SR/.009)*.8;}return a;}
function air(d=.38){const a=new Float32Array(d*SR);let lp=0;for(let i=0;i<a.length;i++){const p=i/a.length;lp=.9*lp+.1*(rand()*2-1);a[i]=lp*Math.sin(p*Math.PI)**2;}return a;}
const clicks=[6+68/30,12+86/30,19+92/30,19+170/30,27+85/30,34+72/30,34+138/30,41+53/30];
const stereoSample=(sample)=>[sample,sample];
for(const t of clicks)addAt(mix,stereoSample(click()),t,.65);
for(const [a,b]of[[12+10/30,12+78/30],[27+10/30,27+72/30]])for(let t=a;t<b;t+=.09+rand()*.07)addAt(mix,stereoSample(click(.028)),t,.12+rand()*.14,rand()*.6-.3);
for(const t of [0.4,6,12,16.2,19,22.07,24.67,27,30.5,34,36.4,38.6,41,43.67,46])addAt(mix,stereoSample(air()),Math.max(0,t-.16),.24);
writeWav(out,'actions.wav',mix,-9);
