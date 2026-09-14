"""Composite Lia's three Sora takes, animated flow, timed subtitles and continuous voice."""
import json
import math
import re
import subprocess
import sys
import wave
from functools import lru_cache
from pathlib import Path

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFont

PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT / 'generated-media/lia-flow-30s'
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
W, H, FPS = 1280, 720, 30
INK = '#143F45'
TEAL = '#197C7C'
MUTED = '#66817F'
BG = '#EDF4ED'
LIGHT = '#E0F0E9'
GOLD = '#D4A766'
STEPS = ['Recepção', 'Entendimento', 'Direcionamento', 'Solução', 'Confirmação', 'Acompanhamento']
STARTS = [3.6, 6.0, 10.0, 15.0, 20.0, 23.8]
TIMING = json.loads((ROOT / 'lia-narracao-original-timing.json').read_text(encoding='utf-8'))


@lru_cache(None)
def font(size, bold=False):
    return ImageFont.truetype('C:/Windows/Fonts/' + ('segoeuib.ttf' if bold else 'segoeui.ttf'), size)


def text(draw, xy, value, size=26, fill=INK, bold=False, anchor=None):
    draw.text(xy, value, font=font(size, bold), fill=fill, anchor=anchor)


def wrapped(draw, value, width, size=25, bold=False):
    lines = ['']
    for word in value.split():
        trial = (lines[-1] + ' ' + word).strip()
        if draw.textlength(trial, font=font(size, bold)) > width and lines[-1]:
            lines.append(word)
        else:
            lines[-1] = trial
    return lines


def ease(value):
    value = max(0, min(1, value))
    return 1 - (1-value)**3


def check(draw, x, y, scale=1, color=TEAL):
    draw.line([(x-10*scale, y), (x-3*scale, y+7*scale), (x+12*scale, y-9*scale)], fill=color, width=max(2, int(4*scale)))


def arrow(draw, a, b, color=TEAL, width=3):
    draw.line([a, b], fill=color, width=width)
    angle = math.atan2(b[1]-a[1], b[0]-a[0])
    pts = [b, (b[0]-10*math.cos(angle-.5), b[1]-10*math.sin(angle-.5)), (b[0]-10*math.cos(angle+.5), b[1]-10*math.sin(angle+.5))]
    draw.polygon(pts, fill=color)


def package(draw, x, y, scale=1):
    s = scale
    draw.rounded_rectangle((x-30*s, y-25*s, x+30*s, y+25*s), radius=6*s, fill='#E7C28A', outline='#B58D56', width=2)
    draw.rectangle((x-5*s, y-25*s, x+5*s, y+25*s), fill='#F5E1BC')
    draw.line((x-30*s, y-7*s, x+30*s, y-7*s), fill='#B58D56', width=2)


def bubble(frame, t, at, xy, message, sender='Lia', outgoing=False, width=452):
    if t < at:
        return
    p = ease((t-at)/.5)
    x, y = xy
    y += int((1-p)*18)
    layer = Image.new('RGBA', frame.size)
    d = ImageDraw.Draw(layer)
    lines = wrapped(d, message, width-36, 24)
    height = 47 + len(lines)*31
    d.rounded_rectangle((x, y, x+width, y+height), radius=18, fill=TEAL if outgoing else '#EDF2EE')
    text(d, (x+18, y+10), sender, 16, '#C6E9DF' if outgoing else MUTED, True)
    for i, line in enumerate(lines):
        text(d, (x+18, y+35+i*31), line, 24, 'white' if outgoing else INK)
    layer.putalpha(layer.getchannel('A').point(lambda v: int(v*p)))
    frame.alpha_composite(layer)


def label(draw, rect, value, active=False, size=22):
    draw.rounded_rectangle(rect, radius=15, fill=TEAL if active else LIGHT)
    text(draw, ((rect[0]+rect[2])/2, (rect[1]+rect[3])/2-2), value, size, 'white' if active else INK, True, 'mm')


def progress(draw, stage):
    for i in range(6):
        x = 710+i*93
        if i < 5:
            draw.line((x+17, 150, x+76, 150), fill=TEAL if i < stage else '#CFDED6', width=3)
        active = i <= stage
        draw.ellipse((x-17, 133, x+17, 167), fill=TEAL if active else '#E1EAE3')
        if i < stage:
            check(draw, x, 150, .6, 'white')
        else:
            text(draw, (x, 148), str(i+1), 17, 'white' if active else MUTED, True, 'mm')


def panel(frame, t):
    # A fixed composited panel keeps typography and flow perfectly stable across takes.
    side = Image.new('RGBA', (W, H))
    d = ImageDraw.Draw(side)
    d.rectangle((640, 0, W, H), fill=BG)
    for x in range(605, 640):
        d.line((x, 0, x, H), fill=(237, 244, 237, int((x-605)/35*255)))
    frame.alpha_composite(side)
    d = ImageDraw.Draw(frame)
    text(d, (686, 37), 'ATENDIMENTO, PASSO A PASSO', 16, TEAL, True)
    text(d, (686, 63), 'Clareza em cada conversa.', 29, INK, True)
    d.rounded_rectangle((657, 112, 1252, 616), radius=28, fill='#FAFCF8', outline='#D7E5DC', width=2)
    stage = max([i for i, start in enumerate(STARTS) if t >= start], default=-1)
    progress(d, stage)
    if t >= 27.15:
        text(d, (690, 190), 'Um fluxo completo.', 32, INK, True)
        text(d, (690, 233), 'Do primeiro oi ao próximo passo.', 22, MUTED)
        for i, title in enumerate(STEPS):
            col, row = i % 2, i // 2
            x, y = 686+col*276, 287+row*80
            d.rounded_rectangle((x, y, x+256, y+65), radius=15, fill=LIGHT)
            d.ellipse((x+12, y+18, x+40, y+46), fill=TEAL)
            check(d, x+26, y+32, .55, 'white')
            text(d, (x+50, y+30), title, 19, INK, True, 'lm')
        text(d, (954, 567), 'Clareza e cuidado em cada etapa.', 23, TEAL, True, 'mm')
    elif stage == -1:
        text(d, (690, 195), 'Oi! Eu sou a Lia.', 35, INK, True)
        text(d, (690, 248), 'Vamos acompanhar um atendimento?', 23, MUTED)
        bubble(frame, t, .75, (700, 318), 'Quero acompanhar meu pedido.', 'Cliente', width=474)
        d = ImageDraw.Draw(frame)
        if t > 2:
            label(d, (716, 477, 1194, 536), 'Um exemplo, seis etapas.', size=22)
    elif stage == 0:
        text(d, (690, 190), '1. Recepção', 32, INK, True)
        text(d, (690, 234), 'Toda conversa começa com acolhimento.', 21, MUTED)
        bubble(frame, t, 3.6, (697, 292), 'Quero acompanhar meu pedido.', 'Cliente', width=459)
        bubble(frame, t, 4.35, (735, 432), 'Olá! Vou ajudar você.', outgoing=True)
    elif stage == 1:
        text(d, (690, 190), '2. Entendimento', 32, INK, True)
        text(d, (690, 234), 'Identificar a necessidade e reunir os dados.', 21, MUTED)
        bubble(frame, t, 6.1, (735, 287), 'Qual é o número do pedido?', outgoing=True)
        bubble(frame, t, 7.45, (697, 408), '1234', 'Cliente', width=230)
        d = ImageDraw.Draw(frame)
        if t >= 8.25:
            p = ease((t-8.25)/.6)
            x = 1092
            y = 449+int((1-p)*12)
            package(d, x, y, .78)
            text(d, (x, y+48), 'Pedido 1234', 22, TEAL, True, 'mm')
        if t >= 9:
            text(d, (710, 563), 'Necessidade identificada: acompanhar entrega', 19, MUTED)
    elif stage == 2:
        text(d, (690, 190), '3. Direcionamento', 32, INK, True)
        text(d, (690, 234), 'A resposta certa, pelo caminho certo.', 22, MUTED)
        label(d, (823, 288, 1089, 350), 'Pedido 1234', size=23)
        if t >= 10.8:
            arrow(d, (912, 355), (825, 405))
            arrow(d, (1000, 355), (1103, 405), '#A8BAB1')
            label(d, (691, 415, 957, 479), 'Resposta direta', True, 23)
            label(d, (981, 415, 1227, 479), 'Equipe', False, 23)
        if t >= 12:
            check(d, 721, 525, .8)
            text(d, (744, 514), 'Solução disponível', 19, TEAL)
            text(d, (1000, 506), 'Com o histórico', 19, MUTED)
            text(d, (1000, 534), 'da conversa', 19, MUTED)
        if t >= 13:
            text(d, (956, 583), 'Neste exemplo, seguimos com a resposta direta.', 18, MUTED, False, 'mm')
    elif stage == 3:
        text(d, (690, 190), '4. Solução', 32, INK, True)
        text(d, (690, 234), 'Uma atualização clara para o cliente.', 22, MUTED)
        d.line((730, 368, 1168, 368), fill='#D7E5DC', width=7)
        p = ease((t-15.2)/3.4)
        px = 736+int(423*p)
        d.line((730, 368, px, 368), fill=TEAL, width=7)
        for x in [730, 949, 1168]:
            d.ellipse((x-8, 360, x+8, 376), fill=TEAL if x <= px else '#C4D8CD')
        package(d, px, 322, .8)
        text(d, (730, 398), 'Pedido 1234', 19, MUTED)
        text(d, (1168, 398), 'Entrega', 19, MUTED, False, 'ra')
        bubble(frame, t, 16.8, (735, 448), 'Seu pedido está em transporte.', outgoing=True)
    elif stage == 4:
        text(d, (690, 190), '5. Confirmação', 32, INK, True)
        text(d, (690, 234), 'Resolver também é conferir se ajudou.', 22, MUTED)
        bubble(frame, t, 20, (735, 290), 'Ficou tudo claro?', outgoing=True)
        bubble(frame, t, 21.1, (697, 405), 'Sim, obrigado!', 'Cliente', width=345)
        d = ImageDraw.Draw(frame)
        if t >= 22.05:
            d.ellipse((1100, 421, 1176, 497), fill=LIGHT)
            check(d, 1138, 458, 1.4)
        if t >= 22.7:
            label(d, (735, 538, 1187, 588), 'Atendimento registrado', False, 21)
    else:
        text(d, (690, 190), '6. Acompanhamento', 31, INK, True)
        text(d, (690, 234), 'Cuidado que continua, quando necessário.', 21, MUTED)
        d.rounded_rectangle((869, 288, 1043, 425), radius=18, fill=LIGHT, outline='#BAD6C9', width=2)
        d.rounded_rectangle((869, 288, 1043, 324), radius=15, fill=TEAL)
        for x in [907, 1006]:
            d.rounded_rectangle((x-4, 278, x+4, 301), radius=4, fill=INK)
        check(d, 956, 372, 1.8)
        label(d, (738, 456, 1174, 518), 'Retorno, se necessário', True, 25)
        text(d, (956, 562), 'Combinado com o cliente.', 23, MUTED, False, 'mm')


def caption(frame, t):
    d = ImageDraw.Draw(frame)
    d.rounded_rectangle((28, 23, 160, 70), radius=23, fill='#FAFCF8')
    d.ellipse((43, 40, 56, 53), fill=TEAL)
    text(d, (71, 29), 'Lia', 27, INK, True)
    d.rounded_rectangle((36, 576, 262, 616), radius=19, fill='#FAFCF8')
    text(d, (149, 595), 'Sua assistente virtual', 19, TEAL, False, 'mm')
    for phrase in TIMING['phrases']:
        start = phrase['offsetMilliseconds']/1000
        end = (phrase['offsetMilliseconds']+phrase['durationMilliseconds'])/1000
        if start-.06 <= t <= end+.13:
            lines = wrapped(d, phrase['text'], 1150, 26)
            box_top = 714-(len(lines)*32+18)
            d.rounded_rectangle((35, box_top, 1245, 714), radius=14, fill='#133B40')
            for i, line in enumerate(lines):
                text(d, (640, box_top+9+i*32), line, 26, 'white', False, 'ma')
            break


def music():
    sr = 48000
    count = sr*30
    tt = np.arange(count)/sr
    result = np.zeros(count)
    # Original quiet pad: Cmaj7 / Am7 / Fmaj7 / Gsus, no third-party recordings.
    chords = [(130.813, 164.814, 195.998, 246.942), (110, 130.813, 164.814, 195.998), (87.307, 110, 130.813, 164.814), (97.999, 130.813, 146.832, 195.998)]
    for index, tones in enumerate(chords):
        start = index*7.5
        local = tt-start
        env = np.clip(local/1.5, 0, 1)*np.clip((9-local)/2, 0, 1)
        chord = sum(np.sin(2*np.pi*f*tt + i*.4) + .18*np.sin(2*np.pi*f*2*tt) for i, f in enumerate(tones))
        result += chord*env*.003
    for start in [.8, 3.6, 6, 7.45, 10, 15, 20, 23.8, 27.15]:
        dt = tt-start
        env = np.where((dt >= 0) & (dt < .25), np.exp(-np.maximum(dt, 0)*25), 0)
        result += .012*env*np.sin(2*np.pi*880*dt)
    result *= np.clip(tt/.8, 0, 1)*np.clip((30-tt)/1.4, 0, 1)
    with wave.open(str(ROOT/'trilha-original.wav'), 'wb') as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(sr)
        audio.writeframes((np.clip(result, -1, 1)*32767).astype('<i2').tobytes())
    subprocess.run([FFMPEG, '-y', '-v', 'error', '-i', str(ROOT/'lia-narracao-original.wav'), '-i', str(ROOT/'trilha-original.wav'), '-filter_complex', '[0:a]atrim=0:30,asetpts=PTS-STARTPTS,loudnorm=I=-16:TP=-2:LRA=7,afade=t=out:st=29.96:d=0.04[v];[1:a]volume=0.65[m];[v][m]amix=inputs=2:normalize=0,alimiter=limit=0.95:level=false,apad,atrim=0:30[a]', '-map', '[a]', '-ar', '48000', '-ac', '2', str(ROOT/'lia-audio-final.wav')], check=True)


def subtitles():
    def stamp(seconds):
        ms = round(seconds*1000)
        return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
    entries = []
    for i, p in enumerate(TIMING['phrases'], 1):
        start = p['offsetMilliseconds']/1000
        end = min(30, (p['offsetMilliseconds']+p['durationMilliseconds'])/1000+.1)
        entries.append(f"{i}\n{stamp(start)} --> {stamp(end)}\n{p['text']}\n")
    (ROOT/'lia-legendas.srt').write_text('\n'.join(entries), encoding='utf-8')


def render(clips):
    destination = ROOT/'Lia-Fluxo-de-Atendimento-30s.mp4'
    if destination.exists():
        raise RuntimeError('Final video already exists; preserving it.')
    music()
    subtitles()
    command = [FFMPEG, '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '1280x720', '-r', str(FPS), '-i', 'pipe:0', '-i', str(ROOT/'lia-audio-final.wav'), '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-t', '30', '-movflags', '+faststart', str(destination)]
    encoder = subprocess.Popen(command, stdin=subprocess.PIPE)
    snapshot_indices = {45, 150, 255, 390, 540, 675, 780, 867}
    previews = []
    try:
        for segment, clip in enumerate(clips):
            decoder = subprocess.Popen([FFMPEG, '-v', 'error', '-i', str(clip), '-t', '10', '-vf', 'fps=30,scale=1280:720', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], stdout=subprocess.PIPE)
            try:
                for i in range(300):
                    data = decoder.stdout.read(W*H*3)
                    if len(data) != W*H*3:
                        raise RuntimeError(f'Clip {segment+1} ended early, frame {i}.')
                    index = segment*300+i
                    frame = Image.frombytes('RGB', (W, H), data).convert('RGBA')
                    panel(frame, index/FPS)
                    caption(frame, index/FPS)
                    rgb = frame.convert('RGB')
                    encoder.stdin.write(rgb.tobytes())
                    if index in snapshot_indices:
                        path = ROOT/f'preview-{index/FPS:05.2f}.jpg'
                        rgb.save(path, quality=92)
                        previews.append(path)
                    if i == 299:
                        print(f'Composited segment {segment+1}/3', flush=True)
            finally:
                decoder.stdout.close()
                decoder.wait()
    finally:
        encoder.stdin.close()
        code = encoder.wait()
    if code:
        raise RuntimeError(f'Encoder failed: {code}')
    sheet = Image.new('RGB', (1280, 4*388), '#EDF4ED')
    for i, path in enumerate(previews):
        thumb = Image.open(path).resize((640, 360), Image.Resampling.LANCZOS)
        x, y = (i%2)*640, (i//2)*388
        sheet.paste(thumb, (x, y))
        text(ImageDraw.Draw(sheet), (x+12, y+362), path.stem.replace('preview-', '')+' s', 17)
    sheet.save(ROOT/'contato-cenas.jpg', quality=92)
    Image.open(previews[-1]).save(ROOT/'poster.jpg', quality=95)
    subprocess.run([FFMPEG, '-v', 'error', '-i', str(destination), '-f', 'null', '-'], check=True)
    probe = subprocess.run([FFMPEG, '-hide_banner', '-i', str(destination), '-map', '0:v:0', '-c', 'copy', '-f', 'null', '-'], capture_output=True, text=True)
    durations = re.findall(r'Duration: ([\d:.]+)', probe.stderr)
    frames = re.findall(r'frame=\s*(\d+)', probe.stderr)
    verification = {'file': destination.name, 'duration': durations[0] if durations else None, 'frames': int(frames[-1]) if frames else None, 'fps': FPS, 'resolution': [W,H], 'decode_ok': True, 'source_clips': [str(p) for p in clips], 'continuous_voice': True, 'voice_speed_change': False, 'size_bytes': destination.stat().st_size}
    (ROOT/'verification.json').write_text(json.dumps(verification, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(verification, ensure_ascii=False, indent=2))
    if verification['frames'] != 900 or verification['duration'] != '00:00:30.00':
        raise RuntimeError('Final duration/frame count mismatch.')


if __name__ == '__main__':
    render([Path(p) for p in sys.argv[1:]])
