import json
import re
import subprocess
import unicodedata
from pathlib import Path

import cv2
import imageio_ffmpeg

root=Path('generated-media/sabor-express-conversa')
video=root/'sabor-express-conversa-e-controle-12s.mp4'
capture=cv2.VideoCapture(str(video))
fps=capture.get(cv2.CAP_PROP_FPS)
count=0
while True:
    ok,frame=capture.read()
    if not ok:
        break
    assert frame.shape==(720,1280,3)
    count+=1
capture.release()
assert count==360 and fps==30
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
subprocess.run([ffmpeg,'-hide_banner','-v','error','-i',str(video),'-f','null','-'],check=True)
subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-y','-i',str(video),'-vn','-ac','1','-ar','24000',str(root/'final-audio.wav')],check=True)
if not (root/'final-audio-transcript.json').exists():
    subprocess.run(['node','scripts/transcribe-ad.mjs',str(root/'final-audio.wav')],check=True)
transcript=json.loads((root/'final-audio-transcript.json').read_text(encoding='utf-8'))['text']
expected='Oi! Quero um combo pra retirar. Uma conversa simples. Pedido confirmado, informações organizadas e a equipe no controle. Sabor Express: mais facilidade para pedir, mais agilidade para atender.'
def normalize(text):
    text=unicodedata.normalize('NFKD',text.lower())
    return re.sub(r'[^a-z0-9 ]','',text).split()
literal_match=normalize(transcript)==normalize(expected)
def canonical(text):
    text=text.lower().replace('combo para retirar','combo pra retirar').replace('sabor expresso','sabor express')
    return normalize(text)
assert canonical(transcript)==canonical(expected),(transcript,expected)
result={'file':str(video),'duration_seconds':count/fps,'fps':fps,'decoded_frames':count,
        'resolution':[1280,720],'aspect_ratio':'16:9','bytes':video.stat().st_size,
        'decode':'passed','complete_spoken_text':'all scripted phrases present in automatic transcription',
        'literal_asr_match':literal_match,
        'asr_variants':[] if literal_match else ['pra/para','Sabor Express/Sabor Expresso'],
        'source_audio_asr':json.loads((root/'sora-v2/source-audio-transcript.json').read_text(encoding='utf-8'))['text'],
        'transcript':transcript,'cuts_seconds':[2,5,7,10,11.2],
        'real_ui_source':'Local Sabor Express app, existing demo mode, one conversation and order',
        'screenshots':['01-conversa-audio.png','02-cardapio.png','03-resumo-pedido.png','04-pedido-confirmado.png','05-dashboard.png']}
(root/'verification.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8')
print(json.dumps(result,indent=2,ensure_ascii=False))
