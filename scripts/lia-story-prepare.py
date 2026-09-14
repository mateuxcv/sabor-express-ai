"""Create a card-free landscape reference for the cinematic Lia revision."""
from pathlib import Path
import numpy as np
from PIL import Image

PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT / 'generated-media/lia-historia-30s'
ROOT.mkdir(parents=True, exist_ok=True)
target = ROOT / 'lia-personagem-1280x720.png'
if target.exists():
    raise RuntimeError('Preserving existing reference.')
avatar = Image.open(PROJECT / 'generated-media/lia-avatar.png').convert('RGB').resize((720, 720), Image.Resampling.LANCZOS)
pixels = np.array(avatar)
canvas = np.empty((720, 1280, 3), dtype=np.uint8)
for x in range(1280):
    source_x = min(719, max(0, x-280))
    if x < 280 or x >= 1000:
        # Sample only the background at the top; never stretch the shoulders.
        color = pixels[15, 5 if x < 280 else 714].astype(float)
        vertical = np.linspace(0, .035, 720)[:, None]
        canvas[:, x, :] = np.clip(color[None, :]*(1-vertical) + np.array([239,246,235])*vertical, 0, 255)
    else:
        canvas[:, x, :] = pixels[:, source_x, :]
frame = Image.fromarray(canvas)
frame.save(target)
print(target)
