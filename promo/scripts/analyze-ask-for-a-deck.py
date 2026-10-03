import pathlib,json,subprocess
import numpy as np
import librosa
from scipy.signal import butter,sosfilt,find_peaks
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'ask-for-a-deck/analysis'
src=ROOT/'public/ask-for-a-deck/audio/house-vibez-source.mp3'
y,sr=librosa.load(src,sr=22050,mono=True)
tempo,beats=librosa.beat.beat_track(y=y,sr=sr,tightness=400,units='time')
# Fit the dense central groove; discard sparse introduction and ending.
b=beats[(beats>20)&(beats<85)]
T,t0=np.linalg.lstsq(np.column_stack((np.arange(len(b)),np.ones(len(b)))),b,rcond=None)[0]
hop=128
def band(lo,hi):
    z=sosfilt(butter(4,[lo,hi],btype='bandpass',fs=sr,output='sos'),y)
    e=librosa.onset.onset_strength(y=z,sr=sr,hop_length=hop)
    times=librosa.times_like(e,sr=sr,hop_length=hop)
    p,_=find_peaks(e,distance=int(.16*sr/hop),prominence=np.max(e)*.035)
    return times[p],e[p]
hits=[]
for kind,lo,hi in [('kick',40,160),('snare',150,3000),('hihat',6000,10000)]:
    ts,ss=band(lo,hi)
    hits += [{'t':float(t),'s':float(s),'k':kind} for t,s in zip(ts,ss)]
kick=np.array([h['t'] for h in hits if h['k']=='kick' and 20<h['t']<85])
# Refine period/phase against measured kick attacks, not the tempo scalar.
ii=np.round((kick-t0)/T).astype(int)
res=kick-(t0+ii*T)
sel=np.abs(res)<.025
TT,phase=np.linalg.lstsq(np.column_stack((ii[sel],np.ones(sum(sel)))),kick[sel],rcond=None)[0]
grid=phase+np.arange(-100,250)*TT
grid=grid[(grid>24)&(grid<76)]
all_attacks=np.array([h['t'] for h in hits if 20<h['t']<85])
errs=np.array([all_attacks[np.argmin(abs(all_attacks-g))]-g for g in grid])
origin=float(kick[np.argmin(abs(kick-grid[0]))])
# Begin the excerpt on this measured attack. Music arrangement lasts 52 seconds.
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-ss',str(origin),'-i',str(src),'-t','52','-af','loudnorm=I=-17:TP=-2:LRA=9','-ar','48000','-ac','2','-c:a','pcm_s16le','-y',str(ROOT/'public/ask-for-a-deck/audio/music.wav')],check=True)
rms=librosa.feature.rms(y=y,hop_length=512)[0]
data={'bpm':float(60/TT),'t0':float(phase),'T':float(TT),'sourceExcerptStart':origin,'outputBeat0':0,'beats':[float(n*TT) for n in range(108)],'hits':sorted(hits,key=lambda h:h['t']),'rms':[{'t':float(i*512/sr),'rms':float(v)} for i,v in enumerate(rms)],'sections':[{'from':0,'to':2.5,'direction':'restrained manual work'},{'from':2.5,'to':25,'direction':'fuller product groove'},{'from':25,'to':28,'direction':'edit break'},{'from':28,'to':45,'direction':'range and export lift'},{'from':45,'to':52,'direction':'brand resolution'}]}
(OUT/'beat_data.json').write_text(json.dumps(data,indent=2))
report={'method':'librosa beat grid least-squares fit refined against inlier kick attacks; validation against kick/snare/hat union','rawTempo':np.asarray(tempo).tolist(),'fittedBpm':data['bpm'],'meanAbsoluteMs':float(np.mean(abs(errs))*1000),'maxAbsoluteMs':float(np.max(abs(errs))*1000),'matchWithin33ms':float(np.mean(abs(errs)<.033)),'cumulativeDriftMs':float(np.polyfit(grid,errs,1)[0]*52*1000),'note':'Sparse attacks are reported honestly; key impacts use measured hit times.'}
(OUT/'grid_drift.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2),flush=True)
