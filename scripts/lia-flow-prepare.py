"""Prepare a reference frame and one continuous Brazilian voice take for Lia."""
import io
import json
import sys
import wave
from pathlib import Path
from urllib.parse import urlsplit
from xml.sax.saxutils import escape

import httpx
import numpy as np
from dotenv import load_dotenv
from PIL import Image, ImageDraw

PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT / 'generated-media/lia-flow-30s'
LINES = [
    'Oi, eu sou a Lia! Veja como funciona o atendimento.',
    'Primeiro, acolho o cliente.',
    'Depois, entendo o pedido e peço as informações necessárias.',
    'Com tudo certo, sigo para a solução ou encaminho à equipe.',
    'Aqui, o cliente recebe uma atualização sobre a entrega.',
    'Confirmo se ficou tudo claro e registro a conversa.',
    'Se necessário, combinamos um retorno.',
    'Simples, organizado e próximo!',
]


def reference():
    ROOT.mkdir(parents=True, exist_ok=True)
    target = ROOT / 'lia-reference-1280x720.png'
    if target.exists():
        raise RuntimeError('Reference already exists; preserving it.')
    yy, xx = np.mgrid[0:720, 0:1280]
    blend = np.clip(xx / 1280, 0, 1)[..., None]
    pixels = np.broadcast_to(np.array([195, 225, 219]) * (1-blend) + np.array([240, 244, 234]) * blend, (720, 1280, 3))
    frame = Image.fromarray(pixels.astype('uint8'))
    avatar = Image.open(PROJECT / 'generated-media/lia-avatar.png').convert('RGB').resize((680, 680), Image.Resampling.LANCZOS)
    ay, ax = np.mgrid[0:680, 0:680]
    alpha = np.minimum(np.clip((680-ax)/60, 0, 1), np.clip(ay/25, 0, 1))
    frame.paste(avatar, (0, 40), Image.fromarray((alpha*255).astype('uint8')))
    draw = ImageDraw.Draw(frame)
    draw.rounded_rectangle((675, 125, 1240, 605), radius=32, fill=(249, 251, 247), outline=(175, 207, 201), width=2)
    frame.save(target)
    print(target)


def voice():
    output = ROOT / 'lia-narracao-original.wav'
    if output.exists():
        raise RuntimeError('Voice take already exists; preserving it.')
    sys.path.insert(0, str(PROJECT / 'services/concierge'))
    from realtime_config import RealtimeConfig
    load_dotenv(PROJECT / '.env')
    config = RealtimeConfig.from_env()
    resource = urlsplit(config.base_url).hostname.split('.')[0]
    voice_name = 'pt-BR-Luana:MAI-Voice-2'
    text = ' '.join(escape(line) for line in LINES)
    ssml = f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="pt-BR"><voice name="{voice_name}"><mstts:express-as style="hopeful" styledegree="0.65">{text}</mstts:express-as></voice></speak>'
    response = httpx.post(f'https://{resource}.cognitiveservices.azure.com/tts/cognitiveservices/v1', headers={
        'Ocp-Apim-Subscription-Key': config.key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'riff-48khz-16bit-mono-pcm',
        'User-Agent': 'LiaFlowVideoProduction',
    }, content=ssml.encode('utf-8'), timeout=180)
    print('Azure voice status:', response.status_code)
    if not response.is_success:
        print(response.text[:800])
        raise SystemExit(1)
    if not response.content.startswith(b'RIFF'):
        raise RuntimeError('Expected WAV audio.')
    output.write_bytes(response.content)
    with wave.open(io.BytesIO(response.content), 'rb') as audio:
        duration = audio.getnframes() / audio.getframerate()
    meta = {'voice': voice_name, 'provider': 'Azure Speech MAI-Voice-2', 'text': ' '.join(LINES), 'lines': LINES, 'duration_seconds': duration, 'single_take': True}
    (ROOT / 'narracao.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(meta, ensure_ascii=False))


if __name__ == '__main__':
    {'reference': reference, 'voice': voice}[sys.argv[1]]()
