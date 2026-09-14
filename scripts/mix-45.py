"""Original quiet instrumental bed, location sound, and a continuous voice master."""
import json
import wave
from pathlib import Path
import numpy as np

ROOT=Path('generated-media/sabor-express-45s')
SR=48000
N=SR*45
mix=np.zeros((N,2),np.float64)
voice=np.zeros(N,np.float64)
records=json.loads((ROOT/'voiceover-edited.json').read_text(encoding='utf-8'))
starts=[.25,5.28,9.99,16.5,21.88,27.76,34.28,39.56]

def read_wav(path):
    with wave.open(str(path),'rb') as wav:
        sr=wav.getframerate();channels=wav.getnchannels()
        a=np.frombuffer(wav.readframes(wav.getnframes()),np.int16).astype(float)/32768
    if channels>1:a=a.reshape(-1,channels).mean(1)
    if sr!=SR:a=np.interp(np.arange(round(len(a)*SR/sr))*sr/SR,np.arange(len(a)),a)
    return a

def normalize(a,rms_target=.115):
    active=a[np.abs(a)>.006]
    rms=np.sqrt(np.mean(active**2)) if len(active) else .1
    gain=min(4,rms_target/max(rms,.01))
    return a*gain

for record,start in zip(records,starts):
    a=normalize(read_wav(ROOT/record['edited_file']))
    idx=round(start*SR)
    assert idx+len(a)<=N,(record['take'],start+len(a)/SR)
    voice[idx:idx+len(a)]+=a
    record['master_start']=start
    record['master_end']=start+len(a)/SR

character=normalize(read_wav('generated-media/sabor-express-conversa/cliente-voz.wav'),.105)
pos=round(14.2*SR)
voice[pos:pos+len(character)]+=character
mix[:,0]+=voice;mix[:,1]+=voice

# Original A-minor / F / C / G felt-keyboard texture, understated 82-BPM pulse.
rng=np.random.default_rng(45)
bed=np.zeros((N,2),np.float64)
beat=60/82
chords=[[57,60,64,67],[53,57,60,64],[48,55,60,64],[55,59,62,67]]
def note(freq,duration,amplitude,pan,start):
    count=round(duration*SR)
    t=np.arange(count)/SR
    env=(1-np.exp(-t/0.03))*np.exp(-t/1.65)
    env*=np.minimum(1,(duration-t)/.2)
    tone=(np.sin(2*np.pi*freq*t)+.22*np.sin(2*np.pi*2*freq*t)+.07*np.sin(2*np.pi*3*freq*t))*env*amplitude
    k=round(start*SR);count=min(count,N-k)
    if count>0:
        bed[k:k+count,0]+=tone[:count]*np.sqrt((1-pan)/2)
        bed[k:k+count,1]+=tone[:count]*np.sqrt((1+pan)/2)

for bar in range(16):
    when=bar*4*beat
    if when>=45:break
    chord=chords[bar%4]
    for k,midi in enumerate(chord):
        note(440*2**((midi-69)/12),4,.012,(-.5+.33*k),when+k*.035)
    for pulse in range(4):
        start=when+pulse*beat
        if start>=45:continue
        note(440*2**((chord[0]-12-69)/12),.48,.014,0,start)
        if start>10:
            length=round(.09*SR)
            t=np.arange(length)/SR
            sound=rng.standard_normal(length)*np.exp(-t/.016)*.0023
            a=round(start*SR);length=min(length,N-a)
            if length>0:bed[a:a+length]+=sound[:length,None]

times=np.arange(N)/SR
bed*=np.minimum(1,times/2)[:,None]
bed*=np.clip((45-times)/1.2,0,1)[:,None]
bed*=np.where((times>6)&(times<10),.28,1)[:,None]
mix+=bed

# Quiet location ambience from the generated restaurant plate; no intelligible dialogue.
ambient=read_wav(ROOT/'before/source-audio.wav')
base=ambient[:round(4.0*SR)]
base/=max(.02,np.sqrt(np.mean(base**2)))
for start in np.arange(0,45,3.6):
    k=round(start*SR);count=min(len(base),N-k)
    env=np.minimum(1,np.arange(count)/(.3*SR))*np.minimum(1,np.arange(count)[::-1]/(.3*SR))
    level=.0035 if start<10 else .0018
    mix[k:k+count]+=base[:count,None]*env[:,None]*level

def chime(start,freq=880,amp=.028):
    count=round(.34*SR);t=np.arange(count)/SR
    sound=(np.sin(2*np.pi*freq*t)+.45*np.sin(2*np.pi*freq*1.5*t))*np.exp(-t/.095)*np.minimum(1,t/.005)*amp
    k=round(start*SR)
    mix[k:k+count]+=sound[:,None]

chime(16.25,880,.018)
chime(21.94,1046,.025)
chime(26.1,740,.018)
fade=np.minimum(1,np.arange(N)/(.08*SR))*np.minimum(1,np.arange(N)[::-1]/(.16*SR))
mix*=fade[:,None]
peak=float(np.max(np.abs(mix)))
if peak>.92:mix*=.92/peak
with wave.open(str(ROOT/'soundtrack.wav'),'wb') as wav:
    wav.setnchannels(2);wav.setsampwidth(2);wav.setframerate(SR)
    wav.writeframes((np.clip(mix,-1,1)*32767).astype(np.int16).tobytes())
with wave.open(str(ROOT/'voice-master.wav'),'wb') as wav:
    wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(24000)
    wav.writeframes((np.clip(voice[::2],-1,1)*32767).astype(np.int16).tobytes())
(ROOT/'voiceover-timeline.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
print('45-second soundtrack prepared. Peak:',round(peak,4))
print('Narrator segments:',[(r['take'],r['master_start'],round(r['master_end'],2)) for r in records])
