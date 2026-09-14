"""Record conversational narration with the dedicated Azure TTS model."""
import json
import sys
from pathlib import Path
from dotenv import load_dotenv
import httpx

PROJECT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(PROJECT/'services/concierge'))
from realtime_config import RealtimeConfig

ROOT=PROJECT/'generated-media/sabor-express-45s/voz-natural-v2'
TEXTS=[
    'Quarenta e duas lojas. Mais de três mil mensagens por dia. Até quarenta minutos de espera. E um chatbot que travava. Nossa proposta: agilidade, contexto e controle.',
    'A assistente usa as informações da unidade e ajuda o cliente a escolher. Pedido confirmado. E, quando precisa, uma pessoa assume com todo o histórico. Atendimento organizado, conexão com o RD Station e satisfação acompanhada. Começamos em três lojas. Treinamos a equipe. Medimos os resultados. HeadOffice.ai para Sabor Express. Vamos começar pelas primeiras lojas?',
]
STYLE='''Speak in native Brazilian Portuguese. Sound like a real Brazilian woman in her early thirties speaking warmly to one person she knows, sharing an idea she genuinely cares about. Relaxed conversational Brazilian rhythm, smooth connected words, natural melodic movement and subtle emotion. Keep it grounded, close, clear and human-sounding, with a gentle smile when describing the solution. Give the problem a small thoughtful weight, then let the solution feel lighter and reassuring. Use ordinary everyday articulation and easy breaths, not a formal commercial announcer or an automated customer-service voice. Do not stress every word, break words into syllables, exaggerate consonants, or put identical pauses after each phrase. Keep a flowing conversational pace around 150–165 words per minute. The delivery should sound spoken spontaneously rather than read off a checklist. No background music. Brand names RD Station, HeadOffice.ai and Sabor Express should sound like a Brazilian professional naturally saying those names. Say only the provided words.'''

def main():
    load_dotenv(PROJECT/'.env')
    config=RealtimeConfig.from_env()
    ROOT.mkdir(parents=True,exist_ok=True)
    part=int(sys.argv[1]) if len(sys.argv)>1 else 1
    output=ROOT/f'narracao-parte-{part}.wav'
    if output.exists():raise RuntimeError('Preserving an existing narration take.')
    payload={'model':'gpt-4o-mini-tts','voice':'coral','input':TEXTS[part-1],
             'instructions':STYLE,'response_format':'wav','speed':1.0}
    response=httpx.post(config.base_url+'audio/speech',headers=config.headers,json=payload,timeout=150)
    print('Speech synthesis status:',response.status_code)
    if not response.is_success:
        error=response.json().get('error',{})
        print(json.dumps({'code':error.get('code'),'message':error.get('message')},ensure_ascii=False))
        raise SystemExit(1)
    if not response.content.startswith(b'RIFF'):raise RuntimeError('Expected WAV audio from Azure.')
    output.write_bytes(response.content)
    (ROOT/f'narracao-parte-{part}.json').write_text(json.dumps({'model':payload['model'],'voice':'coral','text':TEXTS[part-1],'instructions':STYLE,'speed':1.0,'file':output.name},ensure_ascii=False,indent=2),encoding='utf-8')
    print('Saved:',output)

main()
