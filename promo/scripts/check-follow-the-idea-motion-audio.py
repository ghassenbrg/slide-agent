# Compare rendered audio to the same frozen voice/SFX timeline, including AAC output shift.
import wave,array,math,json,pathlib,subprocess
R=pathlib.Path(__file__).resolve().parents[1];O=R/'out/follow-the-idea-motion';Q=O/'qa';Q.mkdir(exist_ok=True)
subprocess.run(['ffmpeg','-v','error','-y','-i',str(O/'voiceover.wav'),'-i',str(R/'public/follow-the-idea-motion/audio/actions.wav'),'-filter_complex','[1:a]volume=0.42[s];[0:a][s]amix=inputs=2:normalize=0,aresample=48000[out]','-map','[out]','-ac','1','-c:a','pcm_s16le',str(Q/'expected-audio.wav')],check=True)
subprocess.run(['ffmpeg','-v','error','-y','-i',str(O/'slide-agent-actions-no-music.mp4'),'-ar','48000','-ac','1','-c:a','pcm_s16le',str(Q/'rendered-audio.wav')],check=True)
def read(p):
 with wave.open(str(p))as w:
  a=array.array('h');a.frombytes(w.readframes(w.getnframes()));return a
x=read(Q/'expected-audio.wav');y=read(Q/'rendered-audio.wav');rows=[]
for t in [1,8.25,14.8667,22.0667,29.8333,38.6,42.7667,47]:
 a=round(t*48000);window=range(a,a+4000);sxx=sum(x[i]*x[i]for i in window);best=(-2,0)
 for lag in range(-80,81):
  sxy=sum(x[i]*y[i+lag]for i in window);syy=sum(y[i+lag]*y[i+lag]for i in window);c=sxy/math.sqrt(sxx*syy)if sxx*syy else 0
  if c>best[0]:best=(c,lag)
 rows.append({'time':t,'lagSamples':best[1],'lagMs':best[1]/48,'correlation':round(best[0],5)})
(O/'audio-alignment.json').write_text(json.dumps(rows,indent=2));print(json.dumps(rows,indent=2))
