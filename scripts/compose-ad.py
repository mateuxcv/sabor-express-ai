"""Track the Sora device plates and composite unmodified product screenshots."""
import json
import subprocess
from pathlib import Path

import cv2
import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path('generated-media/sabor-express')
info = json.loads((ROOT / 'source-info.json').read_text())
source = info['source']
capture = cv2.VideoCapture(source)
frames = []
while True:
    ok, frame = capture.read()
    if not ok:
        break
    frames.append(frame)
capture.release()
assert len(frames) == 360

def ordered(points):
    points = np.array(points, dtype=np.float32).reshape(-1, 2)
    total = points.sum(axis=1)
    diff = np.diff(points, axis=1).ravel()
    return np.array([points[np.argmin(total)], points[np.argmin(diff)],
                     points[np.argmax(total)], points[np.argmax(diff)]], np.float32)

def detect(frame):
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, (0, 0, 165), (179, 40, 255))
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contour = max(contours, key=cv2.contourArea)
    hull = cv2.convexHull(contour)
    polygon = cv2.approxPolyDP(hull, 0.012 * cv2.arcLength(hull, True), True)
    if len(polygon) != 4:
        polygon = cv2.boxPoints(cv2.minAreaRect(hull))
    return ordered(polygon)

tracks = {}
for name, start, end in [('phone', 90, 182), ('monitor', 182, 269)]:
    raw = np.array([detect(frames[i]) for i in range(start, end)])
    # Smooth compression-level edge changes; preserve the subtle camera push.
    smooth = np.array([np.median(raw[max(0, i-5):min(len(raw), i+6)], axis=0)
                       for i in range(len(raw))])
    tracks[name] = smooth
    print(name, 'first', smooth[0].tolist(), 'last', smooth[-1].tolist())
(ROOT / 'screen-tracks.json').write_text(json.dumps({k: v.tolist() for k, v in tracks.items()}))

def load_phone(filename):
    img = cv2.imread(str(ROOT / filename))
    # Trim only the screenshot's decorative outer hardware bezel.
    img = img[16:1404, 14:716].copy()
    corner_mask = Image.new('L', (img.shape[1], img.shape[0]), 0)
    ImageDraw.Draw(corner_mask).rounded_rectangle((0, 0, img.shape[1]-1, img.shape[0]-1), radius=80, fill=255)
    outside = np.array(corner_mask) == 0
    img[outside & (np.indices(outside.shape)[0] < 100)] = (36, 43, 32)
    img[outside & (np.indices(outside.shape)[0] >= 100)] = (212, 225, 213)
    return img

before = load_phone('cliente-antes.png')
after = load_phone('cliente-confirmado.png')
dashboard = cv2.imread(str(ROOT / 'dashboard-confirmado.png'))

def composite(frame, image, corners, hand=False):
    target_width = round(np.linalg.norm(corners[1]-corners[0]))
    target_height = round(np.linalg.norm(corners[3]-corners[0]))
    image = cv2.resize(image, (target_width, target_height), interpolation=cv2.INTER_AREA)
    h, w = image.shape[:2]
    src = np.array([[0, 0], [w-1, 0], [w-1, h-1], [0, h-1]], np.float32)
    matrix = cv2.getPerspectiveTransform(src, corners)
    warped = cv2.warpPerspective(image, matrix, (1280, 720), flags=cv2.INTER_LANCZOS4)
    matte = cv2.warpPerspective(np.ones((h, w), np.float32), matrix, (1280, 720))
    # Modest photographic integration while keeping exact interface typography.
    warped = np.clip(warped.astype(np.float32) * np.array([0.94, 0.965, 0.975]), 0, 255)
    if hand:
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        # Gray plate has saturation <25, the real hand has warm chroma.
        # Soft chroma matte retains fingers and their antialiased edges.
        saturation = hsv[:, :, 1].astype(np.float32)
        skin = np.clip((saturation - 24) / 22, 0, 1)
        matte *= 1 - skin
    matte = cv2.GaussianBlur(matte, (3, 3), 0.45)
    alpha = matte[:, :, None]
    return np.clip(warped * alpha + frame * (1 - alpha), 0, 255).astype(np.uint8)

processed = []
phone_corners = np.array([[419,104], [697,27], [864,603], [586,679]], np.float32)
clean_phone = frames[90]
for i, frame in enumerate(frames):
    if 90 <= i < 182:
        # The Sora finger contacts the screen near frame 119, then retracts.
        original = frame
        frame = composite(clean_phone, before if i < 123 else after, phone_corners)
        if 108 <= i <= 137:
            hsv = cv2.cvtColor(original, cv2.COLOR_BGR2HSV)
            difference = np.max(cv2.absdiff(original, clean_phone), axis=2)
            mask = ((hsv[:, :, 0] < 30) & (hsv[:, :, 1] > 25) &
                    (hsv[:, :, 1] < 160) & (hsv[:, :, 2] > 115) & (difference > 25)).astype(np.uint8)*255
            mask[:390] = 0
            mask[:, :610] = 0
            mask[:, 1100:] = 0
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31,31)))
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            solid = np.zeros_like(mask)
            for contour in contours:
                if cv2.contourArea(contour) > 350:
                    cv2.drawContours(solid, [contour], -1, 255, -1)
            # Position the photographed fingertip directly over the actual
            # confirmation button, retaining the original finger animation.
            move = np.array([[1, 0, 13], [0, 1, 48]], np.float32)
            finger = cv2.warpAffine(original, move, (1280,720))
            alpha = cv2.warpAffine(solid, move, (1280,720)).astype(np.float32)/255
            alpha = cv2.GaussianBlur(alpha, (3,3), .65)[:, :, None]
            frame = np.clip(frame*(1-alpha) + finger*alpha, 0, 255).astype(np.uint8)
    elif 182 <= i < 269:
        # Optically equivalent crop: enlarge the photographed monitor, keeping
        # the existing continuous push and physical bezel in the frame.
        matrix = np.array([[1.48, 0, 640*(1-1.48)], [0, 1.48, 319-1.48*315]], np.float32)
        frame = cv2.warpAffine(frame, matrix, (1280, 720), flags=cv2.INTER_LANCZOS4)
        corners = tracks['monitor'][i-182].copy()
        corners += np.array([[-2,-2], [2,-2], [2,2], [-2,2]], np.float32)
        corners = cv2.transform(corners[None], matrix)[0]
        frame = composite(frame, dashboard, corners)
    processed.append(frame)

# Preserve action, conform the four major visual blocks to exactly 3 s each.
index_map = list(range(90))
index_map += np.rint(np.linspace(90, 181, 90)).astype(int).tolist()
index_map += np.rint(np.linspace(182, 268, 90)).astype(int).tolist()
index_map += np.rint(np.linspace(269, 359, 90)).astype(int).tolist()
final_frames = [processed[i] for i in index_map]
output = ROOT / 'sabor-express-a-fome-nao-espera-12s.mp4'
cmd = [imageio_ffmpeg.get_ffmpeg_exe(), '-hide_banner', '-y', '-f', 'rawvideo',
       '-vcodec', 'rawvideo', '-s', '1280x720', '-pix_fmt', 'bgr24', '-r', '30',
       '-i', '-', '-i', source, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264',
       '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
       '-ar', '48000', '-af', 'afade=t=out:st=11.96:d=0.04', '-t', '12',
       '-movflags', '+faststart', str(output)]
process = subprocess.Popen(cmd, stdin=subprocess.PIPE)
for frame in final_frames:
    process.stdin.write(frame.tobytes())
process.stdin.close()
if process.wait() != 0:
    raise RuntimeError('Video encoding failed')

sheet = Image.new('RGB', (1280, 4*205), '#171717')
draw = ImageDraw.Draw(sheet)
for j, t in enumerate([0, 1.5, 2.9, 3, 3.8, 4, 4.3, 5.5, 6, 7, 8, 8.9, 9, 10.25, 11, 11.9]):
    frame = final_frames[round(t*30)]
    cv2.imwrite(str(ROOT / f'final-{t:04.1f}.png'), frame)
    image = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)).resize((320, 180))
    x, y = (j % 4)*320, (j // 4)*205
    sheet.paste(image, (x, y))
    draw.text((x+8, y+183), f'{t:.2f}s', fill='white')
sheet.save(ROOT / 'final-contact-sheet.jpg', quality=95)
cv2.imwrite(str(ROOT / 'poster.jpg'), final_frames[335])
print('Final:', output)
