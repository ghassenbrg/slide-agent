import json,pathlib,subprocess,hashlib
import numpy as np
import soundfile as sf
from scipy.signal import correlate,correlation_lags
R=pathlib.Path(__file__).resolve().parents[1];O=R/'out/ask-for-a-deck';Q=O/'qa'
def run(args):return subprocess.run(args,check=True,capture_output=True,text=True).stdout
meta=json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(O/'slide-agent-announcement.mp4')]))
run(['ffmpeg','-v','error','-y','-i',str(O/'slide-agent-announcement.mp4'),'-map','0:a','-ar','48000','-c:a','pcm_s16le',str(Q/'rendered-audio.wav')])
x,sr=sf.read(R/'public/ask-for-a-deck/audio/combined-review.wav',always_2d=True);y,ysr=sf.read(Q/'rendered-audio.wav',always_2d=True);assert sr==ysr==48000
rows=[]
for t in [1,5,9,13,19,26,34,37,41,48]:
 a=round(t*sr);n=12000;pad=3000;xx=x[a:a+n].mean(axis=1);yy=y[a-pad:a+n+pad].mean(axis=1)
 c=correlate(yy,xx,mode='valid',method='fft');lag=int(np.argmax(c))-pad;aligned=y[a+lag:a+n+lag].mean(axis=1)
 rows.append({'time':t,'lagMs':lag/sr*1000,'correlation':float(np.corrcoef(xx,aligned)[0,1])})
beat=json.loads((R/'ask-for-a-deck/analysis/beat_data.json').read_text());timing=json.loads((R/'ask-for-a-deck/timing.json').read_text())
hits=np.array([h['t']-beat['sourceExcerptStart'] for h in beat['hits']]);offset=np.median([r['lagMs'] for r in rows])/1000
cuts=[]
for s in timing['shots'][1:]:
 t=s['from']/30;err=float(np.min(abs(hits-(t-offset))));cuts.append({'shot':s['id'],'frame':s['from'],'nearestAttackMs':err*1000,'passWithin3Frames':err<=.1})
events=[]
for k,f in timing['events'].items():
 t=f/30;err=float(np.min(abs(hits-(t-offset))));events.append({'event':k,'frame':f,'nearestAttackMs':err*1000,'passWithin3Frames':err<=.1})
hashes=[]
for f in ['slide-agent-announcement.mp4','slide-agent-announcement-no-music.mp4']:
 data=run(['ffmpeg','-v','error','-i',str(O/f),'-map','0:v','-c','copy','-f','hash','-hash','sha256','-']);hashes.append(data.strip())
report={'metadata':meta,'audioAlignment':rows,'cuts':cuts,'events':events,'videoStreamHashes':hashes,'identicalVideoMainAndNoMusic':hashes[0]==hashes[1]}
(O/'technical-review.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items()if k!='metadata'},indent=2))
