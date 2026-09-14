"""Query the official Speech endpoint of the same configured Azure resource."""
import json
import sys
from pathlib import Path
from urllib.parse import urlsplit
from dotenv import load_dotenv
import httpx

project=Path(__file__).resolve().parents[1]
load_dotenv(project/'.env')
sys.path.insert(0,str(project/'services/concierge'))
from realtime_config import RealtimeConfig
config=RealtimeConfig.from_env()
host=urlsplit(config.base_url).hostname
if not host.endswith(('.openai.azure.com','.cognitiveservices.azure.com','.services.ai.azure.com')):
    raise RuntimeError('Expected the configured Azure resource hostname.')
resource=host.split('.')[0]
endpoint=f'https://{resource}.cognitiveservices.azure.com'
response=httpx.get(endpoint+'/tts/cognitiveservices/voices/list',headers={'Ocp-Apim-Subscription-Key':config.key},timeout=30)
print('Speech voice catalog status:',response.status_code)
if response.is_success:
    rows=response.json()
    selected=[r for r in rows if r.get('Locale')=='pt-BR' or ('DragonHD' in r.get('ShortName','') and 'pt-BR' in r.get('SecondaryLocaleList',[]))]
    root=project/'generated-media/sabor-express-45s/voz-natural-v2'
    root.mkdir(parents=True,exist_ok=True)
    (root/'speech-voices.json').write_text(json.dumps(selected,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(selected,ensure_ascii=False,indent=2))
else:
    print(response.text[:600])
