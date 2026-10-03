"""Beat grid + energy profile of the approved track (House Vibez, Mixkit)."""
import json, numpy as np, librosa, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[1]
src = ROOT / 'public/ask-for-a-deck/audio/house-vibez-source.mp3'
y, sr = librosa.load(src, sr=22050, mono=True)
tempo, beats = librosa.beat.beat_track(y=y, sr=sr, tightness=400, units='time')
i = np.arange(len(beats)); A = np.vstack([i, np.ones_like(i)]).T
(T, t0), *_ = np.linalg.lstsq(A, beats, rcond=None)
res = beats - (t0 + i * T)
print(f'BPM={60/T:.3f} t0={t0:.4f} T={T:.5f} resid max={np.abs(res).max()*1000:.0f}ms med={np.median(np.abs(res))*1000:.0f}ms')
# kick-ish onsets in low band
S = np.abs(librosa.stft(y, n_fft=2048, hop_length=256))
f = librosa.fft_frequencies(sr=sr, n_fft=2048)
low = S[f < 150].sum(0); low = low / low.max()
times = librosa.frames_to_time(np.arange(len(low)), sr=sr, hop_length=256)
rms = librosa.feature.rms(y=y, hop_length=sr // 2)[0]
print('RMS per 0.5s (first 90s):'); print(' '.join(f'{v:.2f}' for v in rms[:180]))
# downbeat phase: which beat mod 4 has the strongest low energy
grid = t0 + np.arange(int((len(y) / sr - t0) / T)) * T
lowAt = np.interp(grid, times, low)
print('mod4 low energy', [round(float(lowAt[k::4].mean()), 3) for k in range(4)])
json.dump({'bpm': 60 / T, 't0': t0, 'T': T, 'duration': len(y) / sr}, open(ROOT / 'one-sentence/music-grid.json', 'w'), indent=1)
