"""Read voice model metadata from the project's configured Azure resource."""
import json
import sys
from pathlib import Path
from dotenv import load_dotenv
import httpx

project=Path(__file__).resolve().parents[1]
load_dotenv(project/'.env')
sys.path.insert(0,str(project/'services/concierge'))
from realtime_config import RealtimeConfig
config=RealtimeConfig.from_env()
if '--deployments' in sys.argv:
    root=config.base_url.split('/openai/')[0]
    response=httpx.get(root+'/openai/deployments',params={'api-version':'2023-03-15-preview'},headers=config.headers,timeout=25)
    print('Deployment listing status:',response.status_code)
    if response.is_success:
        body=response.json()
        rows=body.get('data',body.get('value',[]))
        print(json.dumps([{'id':row.get('id',row.get('name')),'model':row.get('model',row.get('properties',{}).get('model'))} for row in rows],indent=2))
    else:
        error=response.json().get('error',{})
        print(json.dumps({'code':error.get('code'),'message':error.get('message')}))
    raise SystemExit(0)
response=httpx.get(config.base_url+'models',headers=config.headers,timeout=25)
print('Model catalog status:',response.status_code)
if response.is_success:
    data=response.json()
    rows=data.get('data',data.get('value',[]))
    print(json.dumps([{'id':r.get('id',r.get('name')),'capabilities':r.get('capabilities')} for r in rows if any(w in str(r.get('id',r.get('name',''))).lower() for w in ('tts','audio','speech','realtime','whisper'))],indent=2))
else:
    body=response.json()
    error=body.get('error',{})
    print(json.dumps({'code':error.get('code'),'message':error.get('message')},ensure_ascii=False))
