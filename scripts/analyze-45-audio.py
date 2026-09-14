import json
import wave
from pathlib import Path
import numpy as np

root=Path('generated-media/sabor-express-45s')
records=json.loads((root/'voiceover-takes.json').read_text(encoding='utf-8'))
for record in records:
    with wave.open(str(root/record['file']),'rb') as wav:
        x=np.frombuffer(wav.readframes(wav.getnframes()),np.int16).astype(float)/32768
        sr=wav.getframerate()
    hop=int(sr*.01)
    rms=np.array([np.sqrt(np.mean(x[i:i+hop]**2)) for i in range(0,len(x),hop)])
    active=np.flatnonzero(rms>max(.004,rms.max()*.025))
    start=max(0,int(active[0])*hop-int(sr*.055))
    end=min(len(x),(int(active[-1])+1)*hop+int(sr*.10))
    record['trim_start']=start/sr
    record['trim_end']=end/sr
    record['trimmed_seconds']=(end-start)/sr
    print(record['take'],round(record['seconds'],3),'->',round(record['trimmed_seconds'],3),'budget',record['end']-record['start'])
(root/'voiceover-trim.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
print('Total voice after edge trimming:',sum(r['trimmed_seconds'] for r in records))
