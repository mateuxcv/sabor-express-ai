"""Obtain word timestamps for precise placement of the continuous HD takes."""
import json
import sys
from pathlib import Path
from urllib.parse import urlsplit
from dotenv import load_dotenv
import httpx

PROJECT=Path(__file__).resolve().parents[1]
ROOT=PROJECT/'generated-media/sabor-express-45s/voz-natural-v2'
sys.path.insert(0,str(PROJECT/'services/concierge'))
from realtime_config import RealtimeConfig
load_dotenv(PROJECT/'.env')
config=RealtimeConfig.from_env()
name=urlsplit(config.base_url).hostname.split('.')[0]
endpoint=f'https://{name}.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe'
part=int(sys.argv[1])
if len(sys.argv)>2:
    path=Path(sys.argv[2])
    ROOT=path.parent
else:
    path=ROOT/f'hd-parte-{part}.wav'
with path.open('rb') as audio:
    response=httpx.post(endpoint,params={'api-version':'2025-10-15'},
        headers={'Ocp-Apim-Subscription-Key':config.key},
        files={'audio':(path.name,audio,'audio/wav'),'definition':(None,json.dumps({'locales':['pt-BR']}),'application/json')},timeout=150)
print('Timed transcription status:',response.status_code)
if not response.is_success:
    print(response.text[:700]);raise SystemExit(1)
result=response.json()
path.with_name(path.stem+'-timing.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'combinedPhrases':result.get('combinedPhrases'),
                  'phrases':[{'start':r.get('offsetMilliseconds'),'duration':r.get('durationMilliseconds'),'text':r.get('text')} for r in result.get('phrases',[])]},ensure_ascii=False,indent=2))
