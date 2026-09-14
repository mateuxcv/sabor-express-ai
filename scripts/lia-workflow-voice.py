"""Record a single expressive animated-film performance for Lia's revised script."""
import asyncio
import base64
import json
import sys
import wave
from pathlib import Path
from urllib.parse import quote

from dotenv import load_dotenv
from websockets.asyncio.client import connect

PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT/'generated-media/lia-workflow-animado-v3'
sys.path.insert(0,str(PROJECT/'services/concierge'))
from realtime_config import RealtimeConfig

PARAGRAPHS = [
    'Oi, eu sou a Lia! Veja como funciona o atendimento: primeiro, eu acolho o cliente com atenção e entendo o pedido.',
    'Direciono a resposta, aciono a equipe se precisar e mostro o status da entrega em tempo real!',
    'Confirmo a resolução, registro a conversa e acompanho se necessário. Simples, organizado e humano!',
]
STYLE = '''Você é uma atriz brasileira adulta de dublagem interpretando Lia, uma personagem
carismática de um filme de animação 3D. Português brasileiro nativo, sotaque brasileiro natural.
Voz feminina adulta de registro médio, calorosa e luminosa, expressiva, conversacional e segura.
Interprete com sorriso audível, intenção, pequenas variações melódicas e curiosidade divertida.
Energia de uma personagem viva conversando diretamente com o espectador, não voz de locutora
institucional nem voz solene de publicidade. Não infantilize, não grite, não sussurre.
Fale com ritmo claro e dinâmico, pausas expressivas naturais, sem arrastar cada palavra.
Uma gravação contínua de estúdio, mesmo timbre e volume do começo ao fim, sem música e sem efeitos.
Leia exatamente o texto fornecido, apenas uma vez. Não acrescente apresentações, comentários,
explicações ou despedidas. O nome Lia deve soar brasileiro. Duração-alvo de 29 a 30 segundos.
Primeiro parágrafo em aproximadamente dez segundos, segundo nos próximos dez e terceiro nos
dez finais. Use pausas naturais entre parágrafos. Não leia as orientações de interpretação.'''


async def until(ws, kind):
    while True:
        event=json.loads(await asyncio.wait_for(ws.recv(), timeout=120))
        if event.get('type')=='error':
            raise RuntimeError(str(event.get('error',{})))
        if event.get('type')==kind:
            return event


async def main():
    ROOT.mkdir(parents=True,exist_ok=True)
    destination=ROOT/'voz-continua-original.wav'
    if destination.exists():
        raise RuntimeError('Preserving the existing continuous performance.')
    load_dotenv(PROJECT/'.env')
    config=RealtimeConfig.from_env()
    url=config.base_url.replace('https://','wss://',1)+'realtime?model='+quote(config.deployment)
    async with connect(url,additional_headers=config.headers,open_timeout=30,max_size=16_000_000) as ws:
        await until(ws,'session.created')
        await ws.send(json.dumps({'type':'session.update','session':{
            'type':'realtime','instructions':STYLE,'output_modalities':['audio'],
            'audio':{'input':{'turn_detection':None},'output':{'voice':'marin','format':{'type':'audio/pcm','rate':24000}}},
            'tools':[],'tool_choice':'none','max_output_tokens':2600,
        }}))
        await until(ws,'session.updated')
        await ws.send(json.dumps({'type':'response.create','response':{
            'conversation':'none','output_modalities':['audio'],
            'instructions':STYLE+'\nTEXTO EXATO:\n'+'\n\n'.join(PARAGRAPHS),
            'max_output_tokens':2600,
        }}))
        chunks=[]
        transcript=''
        while True:
            event=json.loads(await asyncio.wait_for(ws.recv(),timeout=120))
            kind=event.get('type')
            if kind=='error':
                raise RuntimeError(str(event.get('error',{})))
            if kind in ('response.output_audio.delta','response.audio.delta'):
                chunks.append(base64.b64decode(event['delta']))
            if kind in ('response.output_audio_transcript.done','response.audio_transcript.done'):
                transcript=event.get('transcript','')
            if kind=='response.done':
                result=event.get('response',{})
                if result.get('status')!='completed':
                    raise RuntimeError(str(result.get('status_details')))
                break
    pcm=b''.join(chunks)
    if not pcm:
        raise RuntimeError('No audio returned.')
    with wave.open(str(destination),'wb') as audio:
        audio.setnchannels(1);audio.setsampwidth(2);audio.setframerate(24000);audio.writeframes(pcm)
    report={'voice':'marin','provider':config.deployment,'direction':STYLE,'paragraphs':PARAGRAPHS,
            'transcript':transcript,'duration_seconds':len(pcm)/48000,'single_continuous_take':True}
    (ROOT/'voice-performance.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'transcript':transcript,'duration_seconds':len(pcm)/48000,'file':str(destination)},ensure_ascii=False))


if __name__=='__main__':
    asyncio.run(main())
