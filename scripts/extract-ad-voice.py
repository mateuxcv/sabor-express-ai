import subprocess
import sys
from pathlib import Path
import imageio_ffmpeg

root = Path('generated-media/sabor-express-conversa')
subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-hide_banner', '-loglevel', 'error', '-y',
                '-i', sys.argv[1], '-t', '1.95', '-vn', '-ac', '1', '-ar', '24000',
                str(root / 'cliente-voz.wav')], check=True)
print(root / 'cliente-voz.wav')
