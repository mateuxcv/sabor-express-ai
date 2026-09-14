import json
import subprocess
import sys
from pathlib import Path
import cv2
import imageio_ffmpeg

BASE=Path('generated-media/sabor-express-45s')
ROOT=BASE/'voz-natural-v2'
if len(sys.argv)>1:ROOT=Path(sys.argv[1])
old=BASE/'Sabor-Express-Comercial-45s-FINAL.mp4'
mix_info=json.loads((ROOT/'mix-info.json').read_text(encoding='utf-8'))
new=Path(mix_info['file'])
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
def video_hash(path):
    result=subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-i',str(path),
        '-map','0:v:0','-c:v','copy','-f','hash','-hash','sha256','-'],capture_output=True,text=True,check=True)
    return result.stdout.strip()
original_hash=video_hash(old)
revised_hash=video_hash(new)
assert original_hash==revised_hash,'The approved video stream must remain identical.'
cap=cv2.VideoCapture(str(new))
frames=int(cap.get(cv2.CAP_PROP_FRAME_COUNT));fps=cap.get(cv2.CAP_PROP_FPS)
width=int(cap.get(cv2.CAP_PROP_FRAME_WIDTH));height=int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
cap.release()
assert (frames,fps,width,height)==(1350,30,1280,720)
subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-i',str(new),'-f','null','-'],check=True)
subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-y','-i',str(new),'-vn','-ar','24000','-ac','1',str(ROOT/'final-audio.wav')],check=True)
subprocess.run(['node','scripts/transcribe-ad.mjs',str(ROOT/'final-audio.wav')],check=True)
transcript=json.loads((ROOT/'final-audio-transcript.json').read_text(encoding='utf-8'))['text']
character_transcript=None
if 'combo' not in transcript.lower():
    character=ROOT/'character-check.wav'
    subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-y','-i',str(new),'-ss','14.2','-t','1.95','-vn','-ar','24000','-ac','1',str(character)],check=True)
    subprocess.run(['node','scripts/transcribe-ad.mjs',str(character)],check=True)
    character_transcript=json.loads((ROOT/'character-check-transcript.json').read_text(encoding='utf-8'))['text']
    assert 'combo' in character_transcript.lower() and 'retirar' in character_transcript.lower()
timing=mix_info['timeline']
for a,b in zip(timing,timing[1:]):assert a['end']<b['start']
assert timing[2]['end']<14.2 and 14.2+1.95<timing[3]['start']
assert timing[-1]['end']<45
report={'file':str(new),'duration_seconds':frames/fps,'resolution':[width,height],'fps':fps,
        'video_stream_identical':True,'video_sha256':revised_hash,'full_decode':'passed',
        'voice':mix_info['voice'],'voice_type':'Brazilian synthetic expressive voice',
        'time_stretch':False,'within_phrase_edits':mix_info['within_phrase_edits'],'narrator_overlap':'none',
        'transcript':transcript,'character_transcript':character_transcript,'file_bytes':new.stat().st_size}
(ROOT/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
