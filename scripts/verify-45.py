import json
import subprocess
from pathlib import Path
import cv2
import imageio_ffmpeg

ROOT=Path('generated-media/sabor-express-45s')
video=ROOT/'Sabor-Express-Comercial-45s-FINAL.mp4'
cap=cv2.VideoCapture(str(video))
fps=cap.get(cv2.CAP_PROP_FPS)
count=0
review={round(t*30):t for t in [6.2,19.7,22.7,26.8,32.7,35.4,44.5]}
while True:
    ok,frame=cap.read()
    if not ok:break
    assert frame.shape==(720,1280,3)
    if count in review:cv2.imwrite(str(ROOT/f'encoded-{review[count]:05.2f}.png'),frame)
    count+=1
cap.release()
assert count==1350 and fps==30,(count,fps)
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
subprocess.run([ffmpeg,'-hide_banner','-v','error','-i',str(video),'-f','null','-'],check=True)
subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-y','-i',str(video),'-vn','-ac','1','-ar','24000',str(ROOT/'final-audio.wav')],check=True)
subprocess.run(['node','scripts/transcribe-ad.mjs',str(ROOT/'final-audio.wav')],check=True)
transcript=json.loads((ROOT/'final-audio-transcript.json').read_text(encoding='utf-8'))
timeline=json.loads((ROOT/'voiceover-timeline.json').read_text(encoding='utf-8'))
for line in timeline:assert 0<=line['master_start']<line['master_end']<45
for left,right in zip(timeline,timeline[1:]):assert left['master_end']<right['master_start']
assert timeline[2]['master_end']<14.2
assert 14.2+1.95<timeline[3]['master_start']
result={'video':str(video),'duration_seconds':45,'frames':count,'fps':fps,'width':1280,'height':720,
        'aspect_ratio':'16:9','bytes':video.stat().st_size,'full_decode':'passed',
        'narration_overlap_check':'passed','voice_speed_change':False,
        'transcript':transcript['text'],
        'source_narration_transcripts':[line['transcript'] for line in timeline],
        'product_capture':json.loads((ROOT/'capture-info.json').read_text(encoding='utf-8')),
        'review_frames':[f'encoded-{t:05.2f}.png' for t in review.values()]}
(ROOT/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k not in ('product_capture','source_narration_transcripts')},ensure_ascii=False,indent=2))
