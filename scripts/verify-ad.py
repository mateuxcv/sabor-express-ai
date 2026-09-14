import json
import subprocess
from pathlib import Path

import cv2
import imageio_ffmpeg

root = Path('generated-media/sabor-express')
video = root / 'sabor-express-a-fome-nao-espera-12s.mp4'
capture = cv2.VideoCapture(str(video))
fps = capture.get(cv2.CAP_PROP_FPS)
count = 0
while True:
    ok, frame = capture.read()
    if not ok:
        break
    assert frame.shape == (720, 1280, 3)
    count += 1
capture.release()
assert count == 360 and fps == 30
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
subprocess.run([ffmpeg, '-hide_banner', '-v', 'error', '-i', str(video), '-f', 'null', '-'], check=True)
subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(video), '-vn', '-ac', '1', '-ar', '24000', str(root / 'final-audio.wav')], check=True)
result = {'video': str(video), 'width': 1280, 'height': 720, 'aspect_ratio': '16:9',
          'fps': fps, 'decoded_frames': count, 'duration_seconds': count/fps,
          'file_bytes': video.stat().st_size, 'full_decode': 'passed',
          'major_visual_cuts_seconds': [3, 6, 9],
          'interfaces': ['cliente-antes.png', 'cliente-confirmado.png', 'dashboard-confirmado.png'],
          'sora_job': 'video_6aa7463814d081908e296e4bac44d275'}
(root / 'verification.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result, indent=2))
