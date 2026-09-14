"""Edit pauses only; never time-stretch or change the narrator's speaking speed."""
import json
import wave
from pathlib import Path
import numpy as np

root=Path('generated-media/sabor-express-45s')
records=json.loads((root/'voiceover-trim.json').read_text(encoding='utf-8'))
for record in records:
    with wave.open(str(root/record['file']),'rb') as wav:
        sr=wav.getframerate()
        x=np.frombuffer(wav.readframes(wav.getnframes()),np.int16).copy()
    x=x[round(record['trim_start']*sr):round(record['trim_end']*sr)]
    hop=round(sr*.01)
    rms=np.array([np.sqrt(np.mean((x[i:i+hop].astype(float)/32768)**2)) for i in range(0,len(x),hop)])
    quiet=rms<.004
    spans=[]
    start=None
    for i,value in enumerate(np.r_[quiet,False]):
        if value and start is None:start=i
        if not value and start is not None:
            if (i-start)*.01>.34 and start>0 and i<len(quiet):
                spans.append((start*hop,i*hop))
            start=None
    keep=np.ones(len(x),bool)
    for a,b in spans:
        center=(a+b)//2
        removal=(b-a)-round(.21*sr)
        keep[center-removal//2:center+(removal-removal//2)]=False
    x=x[keep]
    fade=min(round(sr*.012),len(x)//2)
    x[:fade]=(x[:fade]*np.linspace(0,1,fade)).astype(np.int16)
    x[-fade:]=(x[-fade:]*np.linspace(1,0,fade)).astype(np.int16)
    filename=f"vo-{record['take']:02d}-edit.wav"
    with wave.open(str(root/filename),'wb') as out:
        out.setnchannels(1);out.setsampwidth(2);out.setframerate(sr);out.writeframes(x.tobytes())
    record['edited_file']=filename
    record['edited_seconds']=len(x)/sr
    record['pause_edits']=len(spans)
    print(record['take'],round(record['edited_seconds'],3),'pause edits',len(spans))
(root/'voiceover-edited.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
print('Total edited narration:',sum(r['edited_seconds'] for r in records))
