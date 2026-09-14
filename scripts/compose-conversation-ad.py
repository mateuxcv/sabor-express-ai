"""Conform the human commercial and insert actual app captures on physical displays."""
import json
import subprocess
from pathlib import Path

import cv2
import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path('generated-media/sabor-express-conversa')
story_info = json.loads((ROOT/'sora-v2/source-info.json').read_text())
store_info = json.loads((ROOT/'source-info.json').read_text())

def decode(path):
    cap = cv2.VideoCapture(str(path))
    frames = []
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frames.append(frame)
    cap.release()
    assert len(frames) == 360
    return frames

story = decode(story_info['source'])
store = decode(store_info['source'])

def screen_mask(frame, kind):
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    if kind in ('monitor','menu-gray'):
        mask = cv2.inRange(hsv, (0,0,110), (179,25,235))
        if kind == 'monitor':
            mask[:90] = 0
            mask[650:] = 0
            mask[:, :100] = 0
            mask[:, 1100:] = 0
        else:
            mask[:10]=0
            mask[650:]=0
            mask[:,:610]=0
            mask[:,1060:]=0
    else:
        b, g, r = [x.astype(np.int16) for x in cv2.split(frame)]
        mask = ((g-r > 5) & (b-r > 3) & (g > 115) & (hsv[:,:,1] < 85)).astype(np.uint8)*255
        if kind == 'menu':
            mask[:65] = 0
            mask[620:] = 0
            mask[:, :650] = 0
            mask[:, 1040:] = 0
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contour = max(contours, key=cv2.contourArea)
    selected = np.zeros_like(mask)
    cv2.drawContours(selected, [contour], -1, 255, -1)
    return cv2.bitwise_and(selected, mask), contour

def order(points):
    p = np.asarray(points, np.float32).reshape(-1,2)
    s, d = p.sum(1), np.diff(p, axis=1).ravel()
    return np.array([p[s.argmin()], p[d.argmin()], p[s.argmax()], p[d.argmax()]], np.float32)

def corners(frame, kind):
    _, contour = screen_mask(frame, kind)
    hull = cv2.convexHull(contour)
    poly = cv2.approxPolyDP(hull, .015*cv2.arcLength(hull, True), True)
    if len(poly) != 4:
        raise RuntimeError(f'Expected four screen corners: {kind}, {len(poly)}')
    quad = order(poly)
    # Fit the physical straight edges, excluding rounded display corners.
    points = contour.reshape(-1,2).astype(np.float32)
    lines = []
    for a,b in zip(quad, np.roll(quad,-1,axis=0)):
        edge = b-a
        t = ((points-a)@edge)/(edge@edge)
        cross = (points[:,0]-a[0])*edge[1] - (points[:,1]-a[1])*edge[0]
        dist = np.abs(cross)/np.linalg.norm(edge)
        selected = points[(dist<7)&(t>.08)&(t<.92)]
        if len(selected) < 8:
            selected = np.array([a,b])
        vx,vy,x,y = cv2.fitLine(selected, cv2.DIST_HUBER, 0, .01, .01).ravel()
        lines.append((np.array([x,y]), np.array([vx,vy])))
    refined = []
    for j in range(4):
        a,v = lines[(j-1)%4]
        b,w = lines[j]
        t = np.linalg.solve(np.column_stack((v,-w)), b-a)[0]
        refined.append(a+t*v)
    return np.array(refined, np.float32)

def phone_image(name):
    image = cv2.imread(str(ROOT/name))[16:1404,14:716].copy()
    # Remove only the captured simulator's outer hardware corners.
    matte = Image.new('L',(image.shape[1],image.shape[0]))
    ImageDraw.Draw(matte).rounded_rectangle((0,0,image.shape[1]-1,image.shape[0]-1),80,fill=255)
    outside = np.array(matte)==0
    yy = np.indices(outside.shape)[0]
    image[outside & (yy<100)] = (36,43,32)
    image[outside & (yy>=100)] = (212,225,213)
    return image

menu = phone_image('02-cardapio.png')
summary = phone_image('03-resumo-pedido.png')
confirmed = phone_image('04-pedido-confirmado.png')
dashboard = cv2.imread(str(ROOT/'05-dashboard.png'))

def overlay(frame, image, quad, physical_mask=None):
    width = max(2,round((np.linalg.norm(quad[1]-quad[0])+np.linalg.norm(quad[2]-quad[3]))/2))
    height = max(2,round((np.linalg.norm(quad[3]-quad[0])+np.linalg.norm(quad[2]-quad[1]))/2))
    image = cv2.resize(image,(width,height),interpolation=cv2.INTER_AREA)
    src = np.array([[0,0],[width-1,0],[width-1,height-1],[0,height-1]],np.float32)
    h = cv2.getPerspectiveTransform(src,quad.astype(np.float32))
    warped = cv2.warpPerspective(image,h,(1280,720),flags=cv2.INTER_LANCZOS4).astype(np.float32)
    alpha = cv2.warpPerspective(np.ones((height,width),np.float32),h,(1280,720))
    if physical_mask is not None:
        alpha *= physical_mask.astype(np.float32)/255
    alpha = cv2.GaussianBlur(alpha,(3,3),.45)[:,:,None]
    warped *= np.array([.94,.965,.975])
    return np.clip(warped*alpha + frame*(1-alpha),0,255).astype(np.uint8)

def resample(start,end,count):
    return np.rint(np.linspace(start,end-1,count)).astype(int)

def transform(frame, quad, matrix):
    return (cv2.warpAffine(frame,matrix,(1280,720),flags=cv2.INTER_LANCZOS4),
            cv2.transform(quad[None],matrix)[0])

output_frames = [story[i] for i in resample(0,58,60)]
menu_base = store[105]
menu_quad = corners(menu_base,'menu-gray')
print('Menu quad:',menu_quad.tolist())

# Keep the phone steady and align the photographed index finger with the actual
# selected card. The wrist remains below frame, avoiding any cut-off hand edge.
base_mask,_=screen_mask(menu_base,'menu-gray')
for j,i in enumerate(resample(59,144,90)):
    frame=overlay(menu_base,menu if j<73 else summary,menu_quad,base_mask)
    if i>=111:
        original=store[i]
        hsv=cv2.cvtColor(original,cv2.COLOR_BGR2HSV)
        b,g,r=[channel.astype(np.int16) for channel in cv2.split(original)]
        delta=np.max(cv2.absdiff(original,menu_base),axis=2)
        skin=((r-g>10)&(g-b>4)&(hsv[:,:,2]>65)&(hsv[:,:,1]<210)&(delta>28)).astype(np.uint8)*255
        skin[:380]=0
        skin[:,:755]=0
        skin[:,1100:]=0
        skin=cv2.morphologyEx(skin,cv2.MORPH_CLOSE,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(31,31)))
        contours,_=cv2.findContours(skin,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
        matte=np.zeros_like(skin)
        if contours:
            main=max(contours,key=cv2.contourArea)
            if cv2.contourArea(main)>500:
                cv2.drawContours(matte,[main],-1,255,-1)
                # The isolated upper index finger is convex; close matte
                # notches caused by skin tones matching the background.
                upper=matte.copy()
                upper[640:]=0
                parts,_=cv2.findContours(upper,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
                if parts:
                    finger=max(parts,key=cv2.contourArea)
                    cv2.drawContours(matte,[cv2.convexHull(finger)],-1,255,-1)
        motion=np.array([[1.3,0,-293],[0,1.3,-216]],np.float32)
        hand=cv2.warpAffine(original,motion,(1280,720))
        alpha=cv2.warpAffine(matte,motion,(1280,720)).astype(np.float32)/255
        alpha=cv2.GaussianBlur(alpha,(3,3),.7)[:,:,None]
        frame=np.clip(frame*(1-alpha)+hand*alpha,0,255).astype(np.uint8)
    output_frames.append(frame)

# The tight phone insert intentionally reveals a physical crop of the screen.
# Extend the tracked side edges beyond frame, using a full-size virtual screen;
# do not compress an entire phone UI into the cropped visible rectangle.
close_tracks=[]
for i in range(151,214):
    mask,_=screen_mask(story[i],'close')
    rows=[]
    for y in range(30,410,4):
        xs=np.flatnonzero(mask[y])
        if len(xs)>300:
            rows.append((y,xs[0],xs[-1]))
    rows=np.array(rows)
    left=np.polyfit(rows[:,0],rows[:,1],1)
    right=np.polyfit(rows[:,0],rows[:,2],1)
    top,bottom=-225,825
    close_tracks.append(np.array([[np.polyval(left,top),top],[np.polyval(right,top),top],
                                  [np.polyval(right,bottom),bottom],[np.polyval(left,bottom),bottom]],np.float32))
close_tracks=np.array(close_tracks)
close_tracks=np.array([np.median(close_tracks[max(0,i-3):min(len(close_tracks),i+4)],axis=0) for i in range(len(close_tracks))])
for j,i in enumerate(resample(151,214,60)):
    mask,_=screen_mask(story[i],'close')
    image=summary if j<24 else confirmed
    output_frames.append(overlay(story[i],image,close_tracks[i-151],mask))

def store_shot(start,end,count,zoom_start,zoom_end):
    raw=np.array([corners(store[i],'monitor') for i in range(start,end)])
    smooth=np.array([np.median(raw[max(0,k-3):min(len(raw),k+4)],axis=0) for k in range(len(raw))])
    for j,i in enumerate(resample(start,end,count)):
        z=zoom_start+(zoom_end-zoom_start)*j/max(1,count-1)
        quad=smooth[i-start]
        # Reframe to emphasize readable UI, gently reveal the employee at right.
        center=np.mean(quad,axis=0)
        matrix=np.array([[z,0,555-z*center[0]],[0,z,338-z*center[1]]],np.float32)
        frame,tracked=transform(store[i],quad,matrix)
        output_frames.append(overlay(frame,dashboard,tracked))

store_shot(205,294,90,1.38,1.32)
output_frames.extend(story[i] for i in resample(301,337,36))
store_shot(333,360,24,1.32,1.32)
assert len(output_frames)==360

target=ROOT/'sabor-express-conversa-e-controle-12s.mp4'
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
cmd=[ffmpeg,'-hide_banner','-loglevel','warning','-y','-f','rawvideo','-vcodec','rawvideo',
     '-s','1280x720','-pix_fmt','bgr24','-r','30','-i','-','-i',story_info['source'],
     '-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','slow','-crf','17',
     '-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000',
     '-af','afade=t=out:st=11.96:d=0.04','-t','12','-movflags','+faststart',str(target)]
process=subprocess.Popen(cmd,stdin=subprocess.PIPE)
for frame in output_frames:
    process.stdin.write(frame.tobytes())
process.stdin.close()
assert process.wait()==0

times=[0,.8,1.8,2,2.6,3.5,4.15,4.5,5,5.5,5.9,6.7,7,8,9.6,10,10.7,11.1,11.3,11.9]
sheet=Image.new('RGB',(1280,5*205),'#191919')
draw=ImageDraw.Draw(sheet)
for j,t in enumerate(times):
    frame=output_frames[round(t*30)]
    cv2.imwrite(str(ROOT/f'final-{t:05.2f}.png'),frame)
    small=Image.fromarray(cv2.cvtColor(frame,cv2.COLOR_BGR2RGB)).resize((320,180))
    x,y=(j%4)*320,(j//4)*205
    sheet.paste(small,(x,y))
    draw.text((x+8,y+183),f'{t:.2f}s',fill='white')
sheet.save(ROOT/'final-contact-sheet.jpg',quality=95)
cv2.imwrite(str(ROOT/'poster.jpg'),output_frames[24])
manifest={'video':str(target),'duration':12,'fps':30,'size':[1280,720],
          'cuts':[2,5,7,10,11.2], 'story_and_audio_job':'video_6aa74b5c3974819093fe54cabf4ba1a1',
          'menu_and_store_plates_job':'video_6aa74a642fc88190968f4fd0c60a49ce',
          'phone_menu_quad':menu_quad.tolist(),'phone_close_tracks':close_tracks.tolist()}
(ROOT/'edit-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print('Rendered:',target)
