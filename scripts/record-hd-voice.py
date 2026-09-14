"""Synthesize native Brazilian HD narration in two long, flowing takes."""
import io
import json
import sys
import wave
from pathlib import Path
from urllib.parse import urlsplit
from xml.sax.saxutils import escape
from dotenv import load_dotenv
import httpx

PROJECT=Path(__file__).resolve().parents[1]
ROOT=PROJECT/'generated-media/sabor-express-45s/voz-natural-v2'
sys.path.insert(0,str(PROJECT/'services/concierge'))
from realtime_config import RealtimeConfig

TEXTS=[
    'Quarenta e duas lojas, mais de três mil mensagens por dia. Até quarenta minutos de espera, e um chatbot que travava. Nossa proposta: agilidade, contexto e controle.',
    'A assistente usa as informações da unidade e ajuda o cliente a escolher. Pedido confirmado. E, quando precisa, uma pessoa assume com todo o histórico. Atendimento organizado, conexão com o RD Station e satisfação acompanhada. Começamos em três lojas, treinamos a equipe, medimos os resultados. HeadOffice.ai para Sabor Express. Vamos começar pelas primeiras lojas?',
]

def main():
    load_dotenv(PROJECT/'.env')
    config=RealtimeConfig.from_env()
    name=urlsplit(config.base_url).hostname.split('.')[0]
    endpoint=f'https://{name}.cognitiveservices.azure.com'
    part=int(sys.argv[1]) if len(sys.argv)>1 else 1
    output=ROOT/f'hd-parte-{part}.wav'
    ROOT.mkdir(parents=True,exist_ok=True)
    if output.exists():raise RuntimeError('Preserving existing HD voice take.')
    voice='pt-BR-Thalita:DragonHDLatestNeural'
    text=escape(TEXTS[part-1])
    text=text.replace('HeadOffice.ai','<sub alias="Head Office AI">HeadOffice.ai</sub>')
    ssml=f'''<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="pt-BR"><voice name="{voice}" parameters="temperature=0.9"><lang xml:lang="pt-BR">{text}</lang></voice></speak>'''
    response=httpx.post(endpoint+'/tts/cognitiveservices/v1',headers={
        'Ocp-Apim-Subscription-Key':config.key,'Content-Type':'application/ssml+xml',
        'X-Microsoft-OutputFormat':'riff-48khz-16bit-mono-pcm','User-Agent':'SaborExpressCommercialProduction',
    },content=ssml.encode('utf-8'),timeout=150)
    print('HD synthesis status:',response.status_code)
    if not response.is_success:
        print(response.text[:800]);raise SystemExit(1)
    if not response.content.startswith(b'RIFF'):raise RuntimeError('Expected WAV synthesis.')
    output.write_bytes(response.content)
    with wave.open(io.BytesIO(response.content),'rb') as audio:
        duration=audio.getnframes()/audio.getframerate()
        rate=audio.getframerate()
    metadata={'voice':voice,'provider':'Azure Speech DragonHD','part':part,'text':TEXTS[part-1],
              'duration_seconds':duration,'sample_rate':rate,'native_speaking_rate':True,'file':output.name}
    (ROOT/f'hd-parte-{part}.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf-8')
    (ROOT/f'hd-parte-{part}.ssml').write_text(ssml,encoding='utf-8')
    print(json.dumps(metadata,ensure_ascii=False))

main()
