import pathlib,json,subprocess,shutil
import numpy as np
import soundfile as sf
from scipy.signal import butter,sosfilt
from scipy.ndimage import maximum_filter1d
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=ROOT/'public/ask-for-a-deck/audio';SR=48000;N=SR*52
timing=json.loads((ROOT/'ask-for-a-deck/timing.json').read_text());E=timing['events'];S=timing['shots']
voice=np.zeros((N,2),np.float32);actions=np.zeros_like(voice)
records=json.loads((ROOT/'ask-for-a-deck/audio-evidence.json').read_text())
def add(dst,sample,t,g=1):
    pos=round(t*SR);off=max(0,-pos);pos=max(0,pos);size=min(len(sample)-off,len(dst)-pos)
    if size>0:dst[pos:pos+size]+=sample[off:off+size]*g
for r in records:
    a,sr=sf.read(OUT/(r['id']+'.wav'),always_2d=True);assert sr==SR;add(voice,a,r['start'])
music,sr=sf.read(OUT/'music.wav',always_2d=True);assert sr==SR
music=music[:N];tt=np.arange(N)/SR
# Filtered opening and edit break give the selected track a deliberate musical arc.
low=sosfilt(butter(2,1100,fs=SR,output='sos'),music,axis=0)
hi=sosfilt(butter(2,280,btype='highpass',fs=SR,output='sos'),music,axis=0)
reveal=E['reveal']/30
opening=np.clip((tt-(reveal-.12))/.25,0,1)
music=low*(1-opening[:,None])+music*opening[:,None]
edit_start=S[4]['from']/30;edit_end=E['editResult']/30
br=np.clip((tt-edit_start)/.22,0,1)*np.clip((edit_end-tt)/.22,0,1)
music=music*(1-br[:,None])+hi*br[:,None]
env=np.full(N,.94)
# Duck locally; leave long music-led intervals between concise spoken actions.
for r in records:
    a=max(0,r['start']-.10);b=r['start']+r['duration']
    duck=np.clip((tt-a)/.10,0,1)*np.clip((b+.25-tt)/.25,0,1)
    env*=1-.51*duck
env*=.32+.68*opening
env*=np.clip(tt/.10,0,1)*np.clip((52-tt)/.65,0,1)
music*=env[:,None]
library=pathlib.Path.home()/'.agents/skills/video-shotcraft/assets/audio/sfx'
sources={'tap':'ui/switch-tap.mp3','sweep':'transition/sweep-fast-small.mp3','paper':'paper/paper-move-quick.mp3','impact':'impact/impact-zoom-quick.mp3'}
samples={};source_records=[]
for key,p in sources.items():
    dest=OUT/(key+'-source.mp3')
    if not dest.exists():shutil.copyfile(library/p,dest)
    wav=OUT/(key+'.wav');subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-i',str(dest),'-t','1.3','-ar',str(SR),'-ac','2','-c:a','pcm_s16le','-y',str(wav)],check=True)
    a,sr=sf.read(wav,always_2d=True);a/=max(.0001,float(np.max(abs(a))));samples[key]=a
    source_records.append({'key':key,'source':p,'peakOffset':float(np.argmax(np.max(abs(a),axis=1))/SR)})
cues=[]
def cue(key,frame,gain,label):
    a=samples[key]; peak=float(np.argmax(np.max(abs(a),axis=1))/SR)
    t=frame/30-peak;add(actions,a,t,gain);cues.append({'key':key,'frame':frame,'startSeconds':t,'peakOffsetSeconds':peak,'peakGain':gain,'label':label})
for frame,label in [(32,'Manual alignment'),(E['connect'],'Choose supported agent'),(E['send'],'Send deck request'),(E['preview2'],'Select slide 2'),(E['preview5'],'Select slide 5'),(E['editSend'],'Send headline change'),(E['editResult'],'Headline applied'),(E['exportPress'],'Export PowerPoint'),(E['nativeSelect'],'Select native text')]:cue('tap',frame,.12,label)
for frame,label in [(E['reveal'],'Manual canvas becomes agent/result'),(E['result'],'Actual deck expands'),(E['rangeTech'],'Technical deck enters'),(E['rangeData'],'Data deck enters')]:cue('sweep',frame,.105,label)
cue('paper',E['powerpoint'],.13,'File opens into PowerPoint')
cue('impact',E['brand'],.12,'Brand resolves')
# Seeded soft keyboard texture, mixed as actual stereo samples.
rng=np.random.default_rng(20261003)
for a,b in [(0.15,.77),((S[2]['from']+8)/30,(E['send']-11)/30),((S[4]['from']+9)/30,(E['editSend']-16)/30)]:
    t=a
    while t<b:
        d=.026;u=np.arange(round(SR*d))/SR
        sample=sosfilt(butter(2,4000,fs=SR,output='sos'),rng.uniform(-1,1,len(u)))*np.exp(-u/.005)*.075
        add(actions,np.column_stack((sample,sample)),t,rng.uniform(.6,1));t+=rng.uniform(.055,.105)
combined=voice+music+actions
gain=10**(4.1/20)
peak=np.max(abs(combined*gain),axis=1)
# Shared 15ms lookahead / 15ms hold ceiling applied equally to all stems.
# Removing music retains the exact narration and SFX from the main version.
limiter=np.minimum(1,10**(-1.2/20)/(maximum_filter1d(peak,size=1441)+1e-9))
for a in [voice,music,actions]:a*=gain*limiter[:,None]
for name,a in [('voiceover',voice),('music-mix',music),('actions',actions)]:sf.write(OUT/(name+'.wav'),a,SR,subtype='PCM_16')
sf.write(OUT/'combined-review.wav',voice+music+actions,SR,subtype='PCM_16')
evidence={'narrationSeconds':sum(r['duration']for r in records),'musicGainDuringSpeech':.94*.49,'musicGainInGaps':.94,'openingFilteredUntil':reveal,'editBreak':[edit_start,edit_end],'masterGainDb':4.1,'sharedCeilingDb':-1.2,'minimumLimiterGain':float(min(limiter)),'cueSources':source_records,'cues':cues,'peakDbFS':float(20*np.log10(np.max(abs(voice+music+actions))))}
(ROOT/'ask-for-a-deck/analysis/audio-mix.json').write_text(json.dumps(evidence,indent=2))
print(json.dumps({k:v for k,v in evidence.items()if k not in ['cues','cueSources']},indent=2))
