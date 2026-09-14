"""Brazilian commercial voice direction: soft delivery, warmth and restrained optimism."""
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
ROOT=PROJECT/'generated-media/sabor-express-45s/voz-comercial-v3'
sys.path.insert(0,str(PROJECT/'services/concierge'))
from realtime_config import RealtimeConfig

TEXTS=[
    'Quarenta e duas lojas, mais de três mil mensagens por dia. Até quarenta minutos de espera, e um chatbot que travava. Nossa proposta: agilidade, contexto e controle.',
    'A assistente usa as informações da unidade e ajuda o cliente a escolher. Pedido confirmado. E, quando precisa, uma pessoa assume com todo o histórico. Atendimento organizado, conexão com o RD Station e satisfação acompanhada. Começamos em três lojas, treinamos a equipe, medimos os resultados. HeadOffice.ai para Sabor Express. Vamos começar pelas primeiras lojas?',
]

def main():
    load_dotenv(PROJECT/'.env')
    config=RealtimeConfig.from_env()
    resource=urlsplit(config.base_url).hostname.split('.')[0]
    endpoint=f'https://{resource}.cognitiveservices.azure.com/tts/cognitiveservices/v1'
    part=int(sys.argv[1])
    ROOT.mkdir(parents=True,exist_ok=True)
    output=ROOT/f'comercial-parte-{part}.wav'
    if output.exists():raise RuntimeError('Preserving an existing commercial voice take.')
    voice='pt-BR-Luana:MAI-Voice-2'
    style='softvoice' if part==1 else 'hopeful'
    degree='0.8' if part==1 else '0.65'
    text=escape(TEXTS[part-1]).replace('HeadOffice.ai','<sub alias="Head Office AI">HeadOffice.ai</sub>')
    ssml=f'''<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="pt-BR"><voice name="{voice}"><mstts:express-as style="{style}" styledegree="{degree}">{text}</mstts:express-as></voice></speak>'''
    response=httpx.post(endpoint,headers={'Ocp-Apim-Subscription-Key':config.key,
        'Content-Type':'application/ssml+xml','X-Microsoft-OutputFormat':'riff-48khz-16bit-mono-pcm',
        'User-Agent':'SaborExpressCommercialProduction'},content=ssml.encode('utf-8'),timeout=180)
    print('Commercial voice synthesis status:',response.status_code)
    if not response.is_success:
        print(response.text[:1000]);raise SystemExit(1)
    if not response.content.startswith(b'RIFF'):raise RuntimeError('Expected synthesized WAV audio.')
    output.write_bytes(response.content)
    with wave.open(io.BytesIO(response.content),'rb') as audio:
        duration=audio.getnframes()/audio.getframerate()
        rate=audio.getframerate()
    metadata={'voice':voice,'provider':'Azure Speech MAI-Voice-2','style':style,'styledegree':degree,
        'part':part,'text':TEXTS[part-1],'duration_seconds':duration,'sample_rate':rate,
        'native_speaking_rate':True,'file':output.name}
    (ROOT/f'comercial-parte-{part}.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf-8')
    (ROOT/f'comercial-parte-{part}.ssml').write_text(ssml,encoding='utf-8')
    print(json.dumps(metadata,ensure_ascii=False))

main()
