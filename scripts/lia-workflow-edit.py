"""Edit the stylized workflow film around one continuous voice performance."""
import difflib
import importlib.util
import json
import math
import re
import subprocess
import sys
import unicodedata
import wave
from pathlib import Path

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFont

PROJECT=Path(__file__).resolve().parents[1]
ROOT=PROJECT/'generated-media/lia-workflow-animado-v3'
FFMPEG=imageio_ffmpeg.get_ffmpeg_exe()
SECTIONS=[(0,8.15,.15),(8.15,14.9,10.15),(14.9,23.1,20.15)]
FPS=30


def wav_read(path):
    with wave.open(str(path),'rb') as f:
        assert f.getsampwidth()==2 and f.getnchannels()==1
        return np.frombuffer(f.readframes(f.getnframes()),dtype='<i2').astype(float)/32768,f.getframerate()


def wav_write(path, samples, rate):
    with wave.open(str(path),'wb') as f:
        f.setnchannels(1 if samples.ndim==1 else samples.shape[1]); f.setsampwidth(2); f.setframerate(rate)
        f.writeframes((np.clip(samples,-.999,.999)*32767).astype('<i2').tobytes())


def flat_words(timing):
    return [word for phrase in timing['phrases'] for word in phrase.get('words',[])]


def norm(value):
    return re.sub(r'[^a-z0-9]','',unicodedata.normalize('NFKD',value.lower()).encode('ascii','ignore').decode())


def build_audio():
    original,sr=wav_read(ROOT/'voz-continua-original.wav')
    master=np.zeros(sr*30)
    timing=json.loads((ROOT/'voz-continua-original-timing.json').read_text(encoding='utf-8'))
    words=flat_words(timing)
    target_words=[]
    for section,(start,end,at) in enumerate(SECTIONS):
        fragment=original[round(start*sr):round(end*sr)]
        # Native performance is unchanged; only inter-section pauses are extended.
        ramp=min(120,len(fragment)//2)
        fragment=fragment.copy()
        fragment[:ramp]*=np.linspace(0,1,ramp)
        fragment[-ramp:]*=np.linspace(1,0,ramp)
        first=round(at*sr)
        master[first:first+len(fragment)]+=fragment
        for word in words:
            onset=word['offsetMilliseconds']/1000
            if start <= onset < end:
                target_words.append({'text':word['text'],'start':onset-start+at,
                    'end':onset-start+at+word['durationMilliseconds']/1000,'section':section})
    # Leave comfortable transient headroom while preserving vocal expression.
    rms=float(np.sqrt(np.mean(master**2)))
    gain=min(.115/max(rms,1e-8),.76/max(np.max(np.abs(master)),1e-8))
    master*=gain
    wav_write(ROOT/'voz-master-30s.wav',master,sr)
    rng=np.random.default_rng(7123)
    music=np.zeros(sr*30)

    def add(start, samples, gain=1):
        i=round(start*sr)
        if i >= len(music): return
        count=min(len(samples),len(music)-i)
        music[i:i+count]+=samples[:count]*gain

    def string(freq, duration=2.4):
        # Karplus–Strong plucked string: a physical-model acoustic-guitar timbre.
        delay=round(sr/freq-.5)
        count=round(sr*duration)
        samples=np.zeros(count)
        noise=rng.uniform(-1,1,delay)
        noise=np.convolve(noise,[.25,.5,.25],mode='same')
        samples[:delay]=noise
        for i in range(delay,count):
            samples[i]=.4975*(samples[i-delay]+samples[i-delay+1])
        samples[:120]*=np.linspace(0,1,120)
        samples[-1000:]*=np.linspace(1,0,1000)
        return samples

    chords=[(130.813,164.814,195.998,261.626,329.628),
            (110,164.814,220,261.626,329.628),
            (87.307,130.813,174.614,220,261.626),
            (97.999,146.832,195.998,246.942,293.665)]
    beat=60/102
    bank={freq:string(freq) for chord in chords for freq in chord}
    for b in range(math.ceil(30/beat)):
        onset=b*beat
        if b%2==0:
            chord=chords[(b//8)%4]
            for index,freq in enumerate(chord):
                add(onset+index*.018,bank[freq],.20 if b%4==0 else .135)
        length=round(sr*.1)
        local=np.arange(length)/sr
        shaker=rng.normal(0,1,length)
        shaker=np.concatenate(([0],np.diff(shaker)))
        add(onset,shaker*np.exp(-local*58),.018)
        if b%2==1:
            tap=np.sin(2*np.pi*185*local)*np.exp(-local*55)
            add(onset,tap,.04)
    time=np.arange(len(music))/sr
    music*=np.clip(time/.45,0,1)*np.clip((30-time)/.8,0,1)
    voice_rms=np.sqrt(np.mean(master**2))
    music*=voice_rms*10**(-18/20)/max(np.sqrt(np.mean(music**2)),1e-9)
    wav_write(ROOT/'trilha-violao-percussao.wav',music,sr)
    effects=np.zeros_like(music)

    def fx(at, samples, level):
        i=round(at*sr);count=min(len(samples),len(effects)-i)
        effects[i:i+count]+=samples[:count]*level

    local=np.arange(round(sr*.28))/sr
    pop=np.sin(2*np.pi*(720*local-850*local**2))*np.exp(-local*24)
    fx(2.0,pop,.065)
    local=np.arange(round(sr*.5))/sr
    whoosh=rng.normal(0,1,len(local))*np.sin(np.pi*np.arange(len(local))/len(local))**2
    whoosh=np.convolve(whoosh,np.ones(12)/12,mode='same')
    fx(12.8,whoosh,.055)
    local=np.arange(round(sr*.85))/sr
    chime=(np.sin(2*np.pi*1046.5*local)+.5*np.sin(2*np.pi*1568*local))*np.exp(-local*5)
    fx(22.7,chime,.045)
    motor_t=np.arange(round(sr*4))/sr
    motor=(np.sin(2*np.pi*88*motor_t)+.25*np.sin(2*np.pi*176*motor_t))*(.75+.25*np.sin(2*np.pi*8*motor_t))
    motor*=np.minimum(np.clip(motor_t/.5,0,1),np.clip((4-motor_t)/.5,0,1))
    fx(14.2,motor,.008)
    mixed=master+music+effects
    if np.max(np.abs(mixed)) >= .98:
        raise RuntimeError('Mix would clip.')
    stereo=np.column_stack([mixed,mixed])
    wav_write(ROOT/'audio-master-30s.wav',stereo,sr)
    report={'speech_speed_change':False,'source_take_seconds':len(original)/sr,'final_seconds':30,
        'music_relative_rms_db':float(20*np.log10(np.sqrt(np.mean(music**2))/voice_rms)),
        'peak_dbfs':float(20*np.log10(np.max(np.abs(mixed)))),'words':target_words}
    (ROOT/'master-timing.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='words'},ensure_ascii=False,indent=2))


def correspondence(index, master):
    native=json.loads((ROOT/f'cena-{index+1}-audio-timing.json').read_text(encoding='utf-8'))
    source=flat_words(native)
    target=[w for w in master['words'] if w['section']==index]
    matcher=difflib.SequenceMatcher(None,[norm(w['text']) for w in source],[norm(w['text']) for w in target],autojunk=False)
    matched=[]
    for block in matcher.get_matching_blocks():
        for delta in range(block.size):
            matched.append((source[block.a+delta],target[block.b+delta]))
    ratio=len(matched)/len(target)
    if ratio < .80:
        raise RuntimeError(f'Native guide speech differs too much in scene {index+1}: {ratio:.2%}')
    pairs=[]
    for s,t in matched:
        pairs.append((t['start']-index*10,s['offsetMilliseconds']/1000))
        pairs.append((t['end']-index*10,(s['offsetMilliseconds']+s['durationMilliseconds'])/1000))
    pairs.sort()
    filtered=[(0,max(0,pairs[0][1]-pairs[0][0]))]
    for t,s in pairs:
        if t > filtered[-1][0]+.008 and s > filtered[-1][1]+.008 and t < 9.8 and s < 11.9:
            filtered.append((t,s))
    filtered.append((10,min(11.9666667,max(filtered[-1][1]+.15,filtered[-1][1]+10-filtered[-1][0]))))
    return {'scene':index+1,'matched_words':len(matched),'target_words':len(target),'match_ratio':ratio,
        'target_times':[x[0] for x in filtered],'source_times':[x[1] for x in filtered]}


def correct_understanding_label(raw, source_time):
    """Track the small mint badge and correct the generator's spelling in place."""
    if source_time < 7.9:
        return raw
    array=np.frombuffer(raw,dtype=np.uint8).reshape(720,1280,3)
    roi=array[360:445,870:1065].astype(np.int16)
    mask=(roi[:,:,0]<145)&(roi[:,:,1]>175)&(roi[:,:,2]>135)&((roi[:,:,1]-roi[:,:,0])>65)
    yy,xx=np.nonzero(mask)
    if len(xx)<1000 or xx.max()-xx.min()<95:
        return raw
    left,top=870+int(xx.min()),360+int(yy.min())
    right,bottom=870+int(xx.max()),360+int(yy.max())
    image=Image.frombytes('RGB',(1280,720),raw)
    draw=ImageDraw.Draw(image)
    draw.rounded_rectangle((left,top,right,bottom),radius=min(17,(bottom-top)//2),fill=(65,215,184))
    label_font=ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf',17)
    draw.text(((left+right)/2,(top+bottom)/2-1),'Entendimento',font=label_font,fill='white',anchor='mm')
    return image.tobytes()


def edit():
    master=json.loads((ROOT/'master-timing.json').read_text(encoding='utf-8'))
    production=json.loads((ROOT/'production.json').read_text(encoding='utf-8'))
    maps=[correspondence(i,master) for i in range(3)]
    (ROOT/'visual-voice-alignment.json').write_text(json.dumps(maps,ensure_ascii=False,indent=2),encoding='utf-8')
    output=ROOT/'Lia-Workflow-Animado-30s.mp4'
    if output.exists():
        raise RuntimeError('Preserving existing final video.')
    command=[FFMPEG,'-hide_banner','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s','1280x720','-r','30','-i','pipe:0','-i',str(ROOT/'audio-master-30s.wav'),'-map','0:v','-map','1:a','-c:v','libx264','-preset','medium','-crf','17','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-t','30','-movflags','+faststart',str(output)]
    encoder=subprocess.Popen(command,stdin=subprocess.PIPE)
    try:
        for scene,clip in enumerate(production['clips']):
            guide=maps[scene]
            decoder=subprocess.Popen([FFMPEG,'-v','error','-i',clip['file'],'-vf','fps=30,scale=1280:720','-an','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
            frame_index=-1
            current=None
            try:
                for frame in range(300):
                    t=frame/30
                    source_t=float(np.interp(t,guide['target_times'],guide['source_times']))
                    desired=min(359,round(source_t*30))
                    while frame_index < desired:
                        raw=decoder.stdout.read(1280*720*3)
                        if len(raw)!=1280*720*3:
                            if current is None: raise RuntimeError('Empty video.')
                            break
                        current=raw
                        frame_index+=1
                    encoder.stdin.write(correct_understanding_label(current,source_t) if scene==0 else current)
                print(f'Aligned scene {scene+1}, matched {guide["matched_words"]}/{guide["target_words"]} spoken words.',flush=True)
            finally:
                decoder.stdout.close()
                decoder.terminate()
                decoder.wait()
    finally:
        encoder.stdin.close()
        code=encoder.wait()
    if code: raise RuntimeError(f'Encoding failed: {code}')
    subprocess.run([FFMPEG,'-v','error','-i',str(output),'-f','null','-'],check=True)
    probe=subprocess.run([FFMPEG,'-hide_banner','-i',str(output),'-map','0:v:0','-c','copy','-f','null','-'],capture_output=True,text=True,check=True)
    duration=re.findall(r'Duration: ([\d:.]+)',probe.stderr)[0]
    frames=int(re.findall(r'frame=\s*(\d+)',probe.stderr)[-1])
    report={'file':output.name,'duration':duration,'frames':frames,'resolution':[1280,720],
        'voice_source':'single_continuous_performance','voice_speed_changed':False,
        'video_word_timing_alignment':maps,'music_relative_rms_db':master['music_relative_rms_db'],
        'decode_ok':True,'size_bytes':output.stat().st_size}
    (ROOT/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    if duration!='00:00:30.00' or frames!=900:
        raise RuntimeError('Invalid final duration.')
    sheet=Image.new('RGB',(1280,4*388),'#143F45')
    fnt=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',20)
    for i,t in enumerate([1,4,7,12,16,21.5,25,28.5]):
        path=ROOT/f'final-{t:04.1f}.jpg'
        subprocess.run([FFMPEG,'-v','error','-y','-ss',str(t),'-i',str(output),'-frames:v','1','-q:v','2',str(path)],check=True)
        image=Image.open(path).resize((640,360),Image.Resampling.LANCZOS)
        x,y=i%2*640,i//2*388
        sheet.paste(image,(x,y))
        ImageDraw.Draw(sheet).text((x+12,y+362),f'{t:.1f} s',font=fnt,fill='white')
    sheet.save(ROOT/'contato-final.jpg',quality=94)
    Image.open(ROOT/'final-01.0.jpg').save(ROOT/'poster.jpg',quality=94)
    print(json.dumps({'file':str(output),'duration':duration,'frames':frames,'size_bytes':output.stat().st_size},ensure_ascii=False))


if __name__=='__main__':
    if sys.argv[1]=='inspect':
        spec=importlib.util.spec_from_file_location('story_tools',PROJECT/'scripts/lia-story-edit.py')
        tools=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(tools)
        tools.ROOT=ROOT
        tools.inspect([Path(p) for p in sys.argv[2:]])
    elif sys.argv[1]=='audio':
        build_audio()
    elif sys.argv[1]=='edit':
        edit()
