"""Extract review frames, cut candidates and audio from a Sora source plate."""
import json
import subprocess
import sys
from pathlib import Path

import cv2
import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw

source = Path(sys.argv[1])
output = Path(sys.argv[2] if len(sys.argv) > 2 else 'generated-media/sabor-express')
output.mkdir(parents=True, exist_ok=True)
capture = cv2.VideoCapture(str(source))
fps = capture.get(cv2.CAP_PROP_FPS)
count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
metadata = {'source': str(source), 'fps': fps, 'frames': count,
            'width': capture.get(cv2.CAP_PROP_FRAME_WIDTH),
            'height': capture.get(cv2.CAP_PROP_FRAME_HEIGHT), 'duration': count / fps}
sheet = Image.new('RGB', (1280, 6 * 205), '#181818')
draw = ImageDraw.Draw(sheet)
for i in range(24):
    t = i * 0.5
    capture.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
    ok, frame = capture.read()
    if not ok:
        continue
    cv2.imwrite(str(output / f'frame-{t:04.1f}.png'), frame)
    image = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    image.thumbnail((320, 180))
    x, y = (i % 4) * 320, (i // 4) * 205
    sheet.paste(image, (x, y))
    draw.text((x + 8, y + 183), f'{t:.2f}s', fill='white')
sheet.save(output / 'source-contact-sheet.jpg', quality=94)
capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
previous = None
cuts = []
for i in range(count):
    ok, frame = capture.read()
    if not ok:
        break
    small = cv2.resize(frame, (160, 90)).astype(np.float32)
    if previous is not None:
        delta = float(np.mean(np.abs(small - previous)))
        if delta > 22:
            cuts.append({'frame': i, 'time': i / fps, 'difference': delta})
    previous = small
capture.release()
metadata['cut_candidates'] = cuts
(output / 'source-info.json').write_text(json.dumps(metadata, indent=2), encoding='utf-8')
print(json.dumps(metadata, indent=2))
subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-i', str(source), '-vn', '-ac', '1', '-ar', '24000', str(output / 'source-audio.wav')], check=True)
