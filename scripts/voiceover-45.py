"""Record a consistent Brazilian narrator using the configured Azure Realtime voice.
No customer-service session, CRM record or phone call is created.
"""
import asyncio
import base64
import json
import sys
import wave
from pathlib import Path
from urllib.parse import quote

from dotenv import load_dotenv
from websockets.asyncio.client import connect

PROJECT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(PROJECT/'services/concierge'))
from realtime_config import RealtimeConfig

ROOT=PROJECT/'generated-media/sabor-express-45s'
LINES=[
    (0,6,'Quarenta e duas lojas. Mais de três mil mensagens por dia.'),
    (6,11,'Até quarenta minutos de espera. E um chatbot que travava.'),
    (11,14,'Nossa proposta: agilidade, contexto e controle.'),
    (17,24,'A assistente usa as informações da unidade e ajuda o cliente a escolher.'),
    (24,30,'Pedido confirmado. E, quando precisa, uma pessoa assume com todo o histórico.'),
    (30,35,'Atendimento organizado, conexão com o RD Station e satisfação acompanhada.'),
    (35,40,'Começamos em três lojas. Treinamos a equipe. Medimos os resultados.'),
    (40,45,'HeadOffice.ai para Sabor Express. Vamos começar pelas primeiras lojas?'),
]
STYLE='''Você é uma narradora brasileira adulta gravando um único comercial cinematográfico.
Voz feminina de timbre quente, natural, próxima e segura. Português brasileiro nativo.
Interpretação contida, humana, sem tom robótico, sem voz de telemarketing e sem entusiasmo artificial.
As próximas respostas são tomadas consecutivas da MESMA narração: mantenha exatamente o mesmo
timbre, energia, sotaque, distância de microfone e volume. Diga somente o texto solicitado.
Nunca adicione saudação, explicação, numeração de cena, aspas ou comentários.
Leia os nomes Sabor Express, RD Station e HeadOffice.ai com clareza, preservando a marca.
HeadOffice.ai é pronunciado "Héd Ófis êi ái"; RD Station, "érre dê stêichon".
Gravação seca de estúdio, sem música, ruído ambiente ou efeitos. Não sussurre.
Use pausas naturais curtas entre frases. Nenhuma aceleração eletrônica.'''

async def receive_until(ws,kind):
    while True:
        event=json.loads(await asyncio.wait_for(ws.recv(),timeout=80))
        if event.get('type')=='error':
            error=event.get('error',{})
            raise RuntimeError(f"Azure Realtime: {error.get('code')} — {error.get('message')}")
        if event.get('type')==kind:
            return event

async def main():
    ROOT.mkdir(parents=True,exist_ok=True)
    load_dotenv(PROJECT/'.env')
    config=RealtimeConfig.from_env()
    url=config.base_url.replace('https://','wss://',1)+'realtime?model='+quote(config.deployment)
    records=[]
    async with connect(url,additional_headers=config.headers,open_timeout=25,max_size=8_000_000) as ws:
        await receive_until(ws,'session.created')
        await ws.send(json.dumps({'type':'session.update','session':{
            'type':'realtime','instructions':STYLE,'output_modalities':['audio'],
            'audio':{'input':{'turn_detection':None},'output':{'voice':'marin','format':{'type':'audio/pcm','rate':24000}}},
            'tools':[],'tool_choice':'none','max_output_tokens':1200,
        }}))
        await receive_until(ws,'session.updated')
        for index,(start,end,text) in enumerate(LINES,1):
            filename=ROOT/f'vo-{index:02d}.wav'
            if filename.exists():
                raise RuntimeError(f'Preserving existing voice take: {filename.name}')
            budget=end-start
            instructions=f'{STYLE}\nEsta tomada deve durar aproximadamente {budget-0.5:.1f} segundos, com dicção natural. Leia exatamente uma vez, sem acrescentar palavras:\n{text}'
            await ws.send(json.dumps({'type':'response.create','response':{
                'conversation':'none','output_modalities':['audio'],'instructions':instructions,
                'metadata':{'take':str(index)},'max_output_tokens':1200,
            }}))
            chunks=[]
            transcript=''
            while True:
                event=json.loads(await asyncio.wait_for(ws.recv(),timeout=80))
                kind=event.get('type')
                if kind=='error':
                    raise RuntimeError(str(event.get('error',{})))
                if kind in ('response.output_audio.delta','response.audio.delta'):
                    chunks.append(base64.b64decode(event['delta']))
                if kind in ('response.output_audio_transcript.done','response.audio_transcript.done'):
                    transcript=event.get('transcript','')
                if kind=='response.done':
                    response=event.get('response',{})
                    if response.get('status')!='completed':
                        raise RuntimeError(f"Take {index} did not complete: {response.get('status_details')}")
                    break
            pcm=b''.join(chunks)
            if not pcm:
                raise RuntimeError('Azure returned no audio')
            with wave.open(str(filename),'wb') as out:
                out.setnchannels(1);out.setsampwidth(2);out.setframerate(24000);out.writeframes(pcm)
            duration=len(pcm)/48000
            record={'take':index,'start':start,'end':end,'text':text,'transcript':transcript,
                    'seconds':duration,'file':filename.name,'voice':'marin','provider':config.deployment}
            records.append(record)
            (ROOT/'voiceover-takes.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
            print(json.dumps(record,ensure_ascii=False))

asyncio.run(main())
