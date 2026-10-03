// Original, restrained 120 BPM score. Newly authored for Follow the Idea.
// Reuses synthesis utilities only; no prior announcement score/arrangement.
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {addAt,clap,hat,kick,midiToHz,mulberry32,Reverb,SR,stereo,writeWav} from './dsp.mjs';
const OUT=join(dirname(fileURLToPath(import.meta.url)),'../public/follow-the-idea/audio');
const DURATION=52;
const mix=stereo(DURATION), rand=mulberry32(1036);
const progression=[[50,57,60,64],[48,55,59,62],[46,53,57,60],[48,55,60,64]];
const rl=new Reverb(1.2),rr=new Reverb(1.4);
const phase=[0,0,0,0];
for(let i=0;i<mix[0].length;i++){
 const t=i/SR;const chord=progression[Math.min(3,Math.floor(t/4)%4)];
 const fade=Math.min(1,t/.3)*Math.min(1,Math.max(0,(52-t)/1.6));
 let l=0,r=0;
 for(let v=0;v<4;v++){
  phase[v]+=2*Math.PI*midiToHz(chord[v])/SR;
  const s=Math.sin(phase[v])*.6+Math.sin(phase[v]*2+.2)*.12;
  const pulse=.7+.3*Math.sin(2*Math.PI*t/4+v);
  l+=s*pulse*(v%2?.75:1); r+=s*pulse*(v%2?1:.75);
 }
 const bass=Math.sin(2*Math.PI*midiToHz(chord[0]-12)*t)*Math.exp(-(t%.5)/.18)*.08;
 mix[0][i]+=(l*.065+rl.process(l*.022)+bass)*fade;
 mix[1][i]+=(r*.065+rr.process(r*.022)+bass)*fade;
}
for(let t=0;t<46;t+=.5){
 const energy=t>=42?.7:1;
 addAt(mix,kick(rand),t,.21*energy);
 addAt(mix,hat(rand,.035),t+.25,.055*energy,t%1?-.3:.3);
 if(t%1===.5)addAt(mix,clap(rand),t,.075*energy);
}
// Music and motion cues remain independent; the no-music export retains cues.
writeWav(OUT,'music.wav',mix,-2);
const motion=stereo(DURATION);
// Subtle airy gesture cues, made for the actual motion beats.
const cues=[{t:6,d:.35},{t:13,d:.35},{t:21,d:.3},{t:24.4667,d:.25},{t:28,d:.4},{t:35,d:.3},{t:43.6,d:.3},{t:46,d:.45}];
for(const cue of cues){
 let prev=0; const s=new Float32Array(Math.ceil(cue.d*SR));
 for(let i=0;i<s.length;i++){
  const p=i/s.length;prev=.9*prev+.1*(rand()*2-1);
  s[i]=prev*Math.sin(p*Math.PI)**2*.17;
 }
 addAt(motion,s,cue.t,.32);
}
for(let i=0;i<mix[0].length;i++){
 const t=i/SR;const fade=t>50?Math.max(0,(52-t)/2):1;
 mix[0][i]=Math.tanh(mix[0][i])*fade;mix[1][i]=Math.tanh(mix[1][i])*fade;
}
writeWav(OUT,'motion.wav',motion,-16);
