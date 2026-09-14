"""Inspect and edit the cinematic, natively voiced Lia revision."""
import json
import math
import re
import subprocess
import sys
import wave
from pathlib import Path

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFont

PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT / 'generated-media/lia-historia-30s'
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
FONT = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 20)


def run(args, **kwargs):
    return subprocess.run([FFMPEG, '-hide_banner', '-y'] + args, check=True, **kwargs)


def inspect(paths, broll=False):
    manifest = json.loads((ROOT/'production.json').read_text(encoding='utf-8'))
    if broll:
        manifest['broll'] = []
    for i, path in enumerate(paths, 1):
        prefix = f'broll-{i}' if broll else f'cena-{i}'
        if broll:
            manifest['broll'].append({'file':str(path.resolve()),'order':i})
        else:
            manifest['clips'][i-1]['file'] = str(path.resolve())
        audio = ROOT/f'{prefix}-audio.wav'
        run(['-v', 'error', '-i', str(path), '-vn', '-ac', '1', '-ar', '48000', str(audio)])
        stamps = [.5, 1.5, 3, 4.5, 6, 7.5, 9, 10.5]
        sheet = Image.new('RGB', (1280, 4*388), '#102C32')
        for k, stamp in enumerate(stamps):
            frame = ROOT/f'{prefix}-{stamp:04.1f}.jpg'
            run(['-v', 'error', '-ss', str(stamp), '-i', str(path), '-frames:v', '1', '-q:v', '2', str(frame)])
            image = Image.open(frame).resize((640, 360), Image.Resampling.LANCZOS)
            x, y = k%2*640, k//2*388
            sheet.paste(image, (x, y))
            ImageDraw.Draw(sheet).text((x+12, y+362), f'{prefix} / {stamp:.1f}s', font=FONT, fill='white')
        sheet.save(ROOT/f'{prefix}-contato.jpg', quality=94)
        print(f'Inspected scene {i}', flush=True)
    (ROOT/'production.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')


def cuts():
    manifest = json.loads((ROOT/'production.json').read_text(encoding='utf-8'))
    result=[]
    for clip in manifest['clips']+manifest.get('broll',[]):
        probe = run(['-i',clip['file'],'-vf',"select='gt(scene,0.22)',showinfo",'-an','-f','null','-'],capture_output=True,text=True)
        times = re.findall(r'pts_time:([\d.]+)',probe.stderr)
        result.append({'file':clip['file'],'cuts':times})
    (ROOT/'shot-cuts.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False,indent=2))


def soundtrack():
    sr = 48000
    tt = np.arange(sr*30)/sr
    output = np.zeros_like(tt)
    # Original light rhythmic score, gently upbeat rather than corporate fanfare.
    bpm = 104
    beat = 60/bpm
    chords = [(261.626,329.628,391.995), (220,261.626,329.628), (174.614,220,261.626), (195.998,246.942,293.665)]
    for b in range(math.ceil(30/beat)):
        start = b*beat
        local = tt-start
        mask = (local >= 0) & (local < 1.7)
        chord = chords[(b//8)%4]
        freq = chord[b%3]
        env = np.where(mask, (1-np.exp(-np.maximum(local,0)*160))*np.exp(-np.maximum(local,0)*4), 0)
        output += .011*env*(np.sin(2*np.pi*freq*local)+.2*np.sin(2*np.pi*freq*2*local))
        if b%2 == 0:
            drum = np.where((local >= 0) & (local < .15), np.exp(-np.maximum(local,0)*35), 0)
            output += .009*drum*np.sin(2*np.pi*75*local)
    output *= np.clip(tt/.6,0,1)*np.clip((30-tt)/1,0,1)
    with wave.open(str(ROOT/'trilha-dinamica-original.wav'),'wb') as out:
        out.setnchannels(1); out.setsampwidth(2); out.setframerate(sr)
        out.writeframes((output*32767).astype('<i2').tobytes())


def edit():
    manifest = json.loads((ROOT/'production.json').read_text(encoding='utf-8'))
    plan = json.loads((ROOT/'edit-plan.json').read_text(encoding='utf-8'))
    soundtrack()
    inputs = []
    for clip in manifest['clips']:
        inputs += ['-i',clip['file']]
    inputs += ['-i',str(ROOT/'trilha-dinamica-original.wav')]
    for clip in manifest.get('broll',[]):
        inputs += ['-i',clip['file']]
    filters = []
    audio_pieces = []
    for i, scene in enumerate(plan['scenes']):
        for j, (start, end) in enumerate(scene['keep']):
            key = f's{i}p{j}'
            filters.append(f'[{i}:a]atrim=start={start}:end={end},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,afade=t=in:d=0.012,areverse,afade=t=in:d=0.012,areverse[{key}a]')
            audio_pieces += [f'[{key}a]']
    filters.append(''.join(audio_pieces)+f'concat=n={len(audio_pieces)}:v=0:a=1[acat]')
    video_pieces=[]
    for i, piece in enumerate(plan['video_segments']):
        source,start,end=piece['input'],piece['start'],piece['end']
        duration=piece.get('duration',end-start)
        speed=duration/(end-start)
        framing=piece.get('framing','')
        framing=(framing+',') if framing else ''
        filters.append(f'[{source}:v]trim=start={start}:end={end},setpts=(PTS-STARTPTS)*{speed},fps=30,{framing}scale=1280:720,setsar=1,tpad=stop_mode=clone:stop_duration=0.1,trim=duration={duration}[v{i}]')
        video_pieces.append(f'[v{i}]')
    filters.append(''.join(video_pieces)+f'concat=n={len(video_pieces)}:v=1:a=0[vcat]')
    # Preserve native speech timing and lip-sync; only unused tail/silence is trimmed.
    filters.append('[vcat]tpad=stop_mode=clone:stop_duration=2,trim=duration=30,format=yuv420p[v]')
    filters.append('[acat]loudnorm=I=-16:TP=-2:LRA=9,apad,atrim=duration=30[dialogue]')
    filters.append('[3:a]volume=0.9[music]')
    filters.append('[dialogue][music]amix=inputs=2:normalize=0,alimiter=limit=0.95:level=false,afade=t=out:st=29.8:d=0.2[a]')
    target = ROOT/'Lia-Historia-Animada-30s.mp4'
    if target.exists():
        raise RuntimeError('Preserving the current final edit.')
    run(['-v','error']+inputs+['-filter_complex',';'.join(filters),'-map','[v]','-map','[a]','-c:v','libx264','-preset','medium','-crf','17','-c:a','aac','-b:a','192k','-t','30','-movflags','+faststart',str(target)])
    run(['-v','error','-i',str(target),'-vn','-ac','1',str(ROOT/'audio-final.wav')])
    run(['-v','error','-i',str(target),'-f','null','-'])
    probe = run(['-i',str(target),'-map','0:v:0','-c','copy','-f','null','-'],capture_output=True,text=True)
    duration = re.findall(r'Duration: ([\d:.]+)', probe.stderr)[0]
    frames = int(re.findall(r'frame=\s*(\d+)', probe.stderr)[-1])
    report = {'file':target.name,'duration':duration,'frames':frames,'resolution':[1280,720],'native_sora_dialogue':True,'speech_retimed':False,'decode_ok':True,'size_bytes':target.stat().st_size}
    (ROOT/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
    if frames != 900 or duration != '00:00:30.00':
        raise RuntimeError('Invalid final duration.')
    sheet = Image.new('RGB',(1280,4*388),'#102C32')
    for i, t in enumerate([1,4,7,12.5,16.5,21,24.5,28.5]):
        frame = ROOT/f'final-{t:04.1f}.jpg'
        run(['-v','error','-ss',str(t),'-i',str(target),'-frames:v','1','-q:v','2',str(frame)])
        image=Image.open(frame).resize((640,360),Image.Resampling.LANCZOS)
        x,y=i%2*640,i//2*388
        sheet.paste(image,(x,y))
        ImageDraw.Draw(sheet).text((x+10,y+361),f'{t:.1f} s',font=FONT,fill='white')
    sheet.save(ROOT/'contato-final.jpg',quality=94)
    Image.open(ROOT/'final-01.0.jpg').save(ROOT/'poster.jpg',quality=94)


if __name__ == '__main__':
    if sys.argv[1] == 'inspect':
        inspect([Path(p) for p in sys.argv[2:]])
    elif sys.argv[1] == 'inspect-broll':
        inspect([Path(p) for p in sys.argv[2:]], broll=True)
    elif sys.argv[1] == 'cuts':
        cuts()
    elif sys.argv[1] == 'edit':
        edit()
