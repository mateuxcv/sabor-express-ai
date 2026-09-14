"""Replace only the soundtrack; preserve the approved H.264 image stream byte-for-byte."""
import json
import subprocess
import sys
import wave
from pathlib import Path
import numpy as np
import imageio_ffmpeg

BASE=Path('generated-media/sabor-express-45s')
ROOT=BASE/'voz-natural-v2'
config=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8')) if len(sys.argv)>1 else {}
if config:ROOT=Path(config['root'])
SR=48000
N=45*SR
voice=np.zeros(N,np.float64)
mix=np.zeros((N,2),np.float64)

def read(path):
    with wave.open(str(path),'rb') as wav:
        sr=wav.getframerate();channels=wav.getnchannels()
        x=np.frombuffer(wav.readframes(wav.getnframes()),np.int16).astype(np.float64)/32768
    if channels>1:x=x.reshape(-1,channels).mean(1)
    if sr!=SR:x=np.interp(np.arange(round(len(x)*SR/sr))*sr/SR,np.arange(len(x)),x)
    return x

parts={i:read(ROOT/config.get('parts',{}).get(str(i),f'hd-parte-{i}.wav')) for i in (1,2)}
active=np.concatenate([x[np.abs(x)>.008] for x in parts.values()])
gain=min(3.0,.105/np.sqrt(np.mean(active**2)))

# Place only complete phrases at natural breaks, using the service's word
# timestamps. No within-phrase cuts, pitch processing or time stretching.
edits=[
    (1,0,3.90,.25,'Volume de mensagens'),
    (1,3.90,7.82,5.25,'Espera e chatbot anterior'),
    (1,7.82,len(parts[1])/SR,9.99,'Proposta'),
    (2,0,4.83,16.50,'Contexto da unidade'),
    (2,4.83,9.87,21.90,'Confirmação e atendimento humano'),
    (2,9.87,15.47,27.90,'CRM e satisfação'),
    (2,15.47,20.27,34.50,'Piloto'),
    (2,20.27,len(parts[2])/SR,39.86,'Convite final'),
]
if config:
    edits=[(row['part'],row['source_start'],row['source_end'],row['start'],row['label']) for row in config['edits']]
timeline=[]
for edit_index,(part,a,b,start,label) in enumerate(edits):
    clip=parts[part][round(a*SR):round(b*SR)].copy()
    pause_cuts=config['edits'][edit_index].get('pause_cuts',[]) if config else []
    keep=np.ones(len(clip),bool)
    for lo,hi in pause_cuts:
        assert a<=lo<hi<=b
        keep[round((lo-a)*SR):round((hi-a)*SR)]=False
    clip=clip[keep]*gain
    fade=min(round(.006*SR),len(clip)//2)
    clip[:fade]*=np.linspace(0,1,fade)
    clip[-fade:]*=np.linspace(1,0,fade)
    k=round(start*SR)
    assert k+len(clip)<=N
    voice[k:k+len(clip)]+=clip
    timeline.append({'part':part,'source_start':a,'source_end':b,'start':start,'end':start+len(clip)/SR,'label':label,'pause_cuts':pause_cuts})

character=read('generated-media/sabor-express-conversa/cliente-voz.wav')
spoken=character[np.abs(character)>.006]
character*=min(4,.100/np.sqrt(np.mean(spoken**2)))
k=round(14.2*SR)
voice[k:k+len(character)]+=character
mix+=voice[:,None]

# Recreate the original instrumental and ambient stems without any old speech.
rng=np.random.default_rng(45)
bed=np.zeros((N,2),np.float64)
beat=60/82
chords=[[57,60,64,67],[53,57,60,64],[48,55,60,64],[55,59,62,67]]
def note(freq,duration,amplitude,pan,start):
    count=round(duration*SR);t=np.arange(count)/SR
    env=(1-np.exp(-t/.03))*np.exp(-t/1.65)*np.minimum(1,(duration-t)/.2)
    tone=(np.sin(2*np.pi*freq*t)+.22*np.sin(2*np.pi*2*freq*t)+.07*np.sin(2*np.pi*3*freq*t))*env*amplitude
    k=round(start*SR);count=min(count,N-k)
    if count>0:
        bed[k:k+count,0]+=tone[:count]*np.sqrt((1-pan)/2)
        bed[k:k+count,1]+=tone[:count]*np.sqrt((1+pan)/2)
for bar in range(16):
    when=bar*4*beat
    if when>=45:break
    chord=chords[bar%4]
    for j,midi in enumerate(chord):note(440*2**((midi-69)/12),4,.012,-.5+.33*j,when+j*.035)
    for pulse in range(4):
        start=when+pulse*beat
        if start>=45:continue
        note(440*2**((chord[0]-12-69)/12),.48,.014,0,start)
        if start>10:
            length=round(.09*SR);t=np.arange(length)/SR
            sound=rng.standard_normal(length)*np.exp(-t/.016)*.0023
            k=round(start*SR);length=min(length,N-k)
            if length>0:bed[k:k+length]+=sound[:length,None]
times=np.arange(N)/SR
bed*=np.minimum(1,times/2)[:,None]
bed*=np.clip((45-times)/1.2,0,1)[:,None]
bed*=np.where((times>6)&(times<10),.28,1)[:,None]
# Let the new voice sit clearly in front of the instrumental.
mix+=bed*.78
ambient=read(BASE/'before/source-audio.wav')[:4*SR]
ambient/=max(.02,np.sqrt(np.mean(ambient**2)))
for start in np.arange(0,45,3.6):
    k=round(start*SR);count=min(len(ambient),N-k)
    env=np.minimum(1,np.arange(count)/(.3*SR))*np.minimum(1,np.arange(count)[::-1]/(.3*SR))
    mix[k:k+count]+=ambient[:count,None]*env[:,None]*(.0025 if start<10 else .0014)
for start,freq,amp in [(16.25,880,.014),(21.94,1046,.020),(26.1,740,.014)]:
    count=round(.34*SR);t=np.arange(count)/SR
    sound=(np.sin(2*np.pi*freq*t)+.45*np.sin(2*np.pi*freq*1.5*t))*np.exp(-t/.095)*np.minimum(1,t/.005)*amp
    k=round(start*SR);mix[k:k+count]+=sound[:,None]
fade=np.minimum(1,np.arange(N)/(.08*SR))*np.minimum(1,np.arange(N)[::-1]/(.16*SR))
mix*=fade[:,None]
peak=float(np.max(np.abs(mix)))
if peak>.92:mix*=.92/peak

def save(path,x,sr):
    with wave.open(str(path),'wb') as wav:
        wav.setnchannels(1 if x.ndim==1 else x.shape[1]);wav.setsampwidth(2);wav.setframerate(sr)
        wav.writeframes((np.clip(x,-1,1)*32767).astype(np.int16).tobytes())
save(ROOT/'soundtrack-hd.wav',mix,SR)
save(ROOT/'locucao-isolada.wav',voice,SR)

ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
original=BASE/'Sabor-Express-Comercial-45s-FINAL.mp4'
target=ROOT/config.get('output','Sabor-Express-45s-VOZ-HD.mp4')
subprocess.run([ffmpeg,'-hide_banner','-loglevel','warning','-y','-i',str(original),
    '-i',str(ROOT/'soundtrack-hd.wav'),'-map','0:v:0','-map','1:a:0','-c:v','copy',
    '-c:a','aac','-b:a','256k','-ar','48000','-af','loudnorm=I=-16:TP=-1.5:LRA=11',
    '-t','45','-movflags','+faststart',str(target)],check=True)
subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-y','-i',str(ROOT/'locucao-isolada.wav'),
    '-c:a','libmp3lame','-b:a','192k',str(ROOT/'ouvir-nova-locucao.mp3')],check=True)
(ROOT/'mix-info.json').write_text(json.dumps({'file':str(target),'voice':config.get('voice','pt-BR-Thalita:DragonHDLatestNeural'),
    'provider':config.get('provider','Azure Speech DragonHD'),'source_recordings':2,'time_stretch':False,'pitch_shift':False,
    'within_phrase_edits':any(r['pause_cuts'] for r in timeline),'edit_type':'Pauses only; spoken syllables retained at native speed',
    'common_voice_gain':gain,'timeline':timeline,'images':'Original H.264 stream copied without re-encoding'},ensure_ascii=False,indent=2),encoding='utf-8')
print('Revised commercial:',target)
print('New narrator timing:',[(r['label'],r['start'],round(r['end'],3)) for r in timeline])
