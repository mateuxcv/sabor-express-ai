"""Render the 45-second commercial from Sora plates and actual product captures."""
import json
import subprocess
import sys
from pathlib import Path

import cv2
import imageio_ffmpeg
import numpy as np
from PIL import Image,ImageDraw
from ad_compositor import decode,mask_screen,corners,track,phone_image,overlay,close_track,reframe

ROOT=Path('generated-media/sabor-express-45s')
PREVIOUS=Path('generated-media/sabor-express-conversa')
def info(path):return json.loads(path.read_text(encoding='utf-8'))
old_info=info(PREVIOUS/'source-info.json')
story_info=info(PREVIOUS/'sora-v2/source-info.json')
before_info=info(ROOT/'before/source-info.json')
training_info=info(ROOT/'training/source-info.json')
old=decode(old_info['source'])
story=decode(story_info['source'])
before=decode(before_info['source'])
training=decode(training_info['source'])

phones={key:phone_image(ROOT/name) for key,name in {
    'audio':'01-audio.png','menu':'02-cardapio.png','summary':'03-resumo.png',
    'confirmed':'04-confirmado.png','handoff':'06-transferencia-cliente.png','csat':'11-satisfacao.png',
}.items()}
screens={key:cv2.imread(str(ROOT/name)) for key,name in {
    'initial':'00-central-inicial.png','confirmed':'05-central.png','pending':'07-transferencia-central.png',
    'human':'08-atendente.png','crm':'10-crm.png',
}.items()}
assert all(x is not None for x in screens.values())
monitor_track=track(old[205:294])
training_track=track(training,'training')
phone_close_track=close_track(story[151:214])
menu_base=old[105]
menu_quad=corners(menu_base,'menu')
menu_mask,_=mask_screen(menu_base,'menu')

def sample(start,end,p):return int(np.clip(round(start+(end-start-1)*p),start,end-1))
def progress(t,a,b):return np.clip((t-a)/(b-a),0,1)

def monitor_screen(which,p,scale=1.4,freeze=False):
    idx=240 if freeze else sample(205,294,p)
    quad=monitor_track[idx-205]
    center=np.mean(quad,axis=0)
    frame,matrix=reframe(old[idx],scale,center,(555,338))
    quad=cv2.transform(quad[None],matrix)[0]
    return overlay(frame,screens[which],quad)

def close_phone(which,idx=195):
    mask,_=mask_screen(story[idx],'close')
    return overlay(story[idx],phones[which],phone_close_track[idx-151],mask)

def menu_phone(t):
    frame=overlay(menu_base,phones['menu'],menu_quad,menu_mask)
    if t>=19.1:
        idx=sample(111,144,progress(t,19.1,20.2))
        original=old[idx]
        hsv=cv2.cvtColor(original,cv2.COLOR_BGR2HSV)
        b,g,r=[channel.astype(np.int16) for channel in cv2.split(original)]
        delta=np.max(cv2.absdiff(original,menu_base),axis=2)
        skin=((r-g>10)&(g-b>4)&(hsv[:,:,2]>65)&(hsv[:,:,1]<210)&(delta>28)).astype(np.uint8)*255
        skin[:380]=0;skin[:,:755]=0;skin[:,1100:]=0
        skin[:610,915:]=0
        skin=cv2.morphologyEx(skin,cv2.MORPH_CLOSE,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(31,31)))
        contours,_=cv2.findContours(skin,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
        matte=np.zeros_like(skin)
        if contours:
            main=max(contours,key=cv2.contourArea)
            if cv2.contourArea(main)>500:
                cv2.drawContours(matte,[main],-1,255,-1)
                upper=matte.copy();upper[590:]=0;upper[:,910:]=0
                parts,_=cv2.findContours(upper,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
                if parts:cv2.drawContours(matte,[cv2.convexHull(max(parts,key=cv2.contourArea))],-1,255,-1)
        # Remove every neutral-gray plate pixel after silhouette repair. Fill
        # only enclosed skin holes, not the open space beside the index finger.
        palm=((r-g>22)&(g-b>10)).astype(np.uint8)*255
        matte[640:,800:1050]=cv2.bitwise_or(matte[640:,800:1050],palm[640:,800:1050])
        matte[hsv[:,:,1]<18]=0
        outlines,_=cv2.findContours(matte,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
        repaired=np.zeros_like(matte)
        for outline in outlines:
            if cv2.contourArea(outline)>350:cv2.drawContours(repaired,[outline],-1,255,-1)
        matte=repaired
        motion=np.array([[1.3,0,-293],[0,1.3,-216]],np.float32)
        hand=cv2.warpAffine(original,motion,(1280,720))
        alpha=cv2.warpAffine(matte,motion,(1280,720)).astype(np.float32)/255
        alpha=cv2.GaussianBlur(alpha,(3,3),.7)[:,:,None]
        frame=np.clip(frame*(1-alpha)+hand*alpha,0,255).astype(np.uint8)
    return frame

def training_shot(idx,scale=1.0):
    frame,matrix=reframe(training[idx],scale)
    quad=cv2.transform(training_track[idx][None],matrix)[0]
    return overlay(frame,screens['human'],quad)

def render(t):
    if t<4.1:
        return before[sample(0,126,progress(t,0,4.1))]
    if t<5.2:
        return before[sample(126,159,progress(t,4.1,5.2))]
    if t<7.3:
        # A brief contemplative hold on the approved character, with a subtle
        # optical push; preserves her identity across the before/after story.
        frame,_=reframe(story[0],1.025+.022*progress(t,5.2,7.3),(620,350),(640,360))
        return frame
    if t<10:
        idx=sample(246,328,progress(t,7.3,10))
        # Keep the historical phone display out of shot; there is no invented UI.
        frame,_=reframe(before[idx],1.25,(700,320),(640,360))
        return frame
    if t<14.2:
        return monitor_screen('initial',progress(t,10,14.2),1.4)
    if t<16.5:
        return story[min(57,round((t-14.2)*30))]
    if t<20.2:
        return menu_phone(t)
    if t<21.9:
        return close_phone('summary',sample(151,183,progress(t,20.2,21.9)))
    if t<23.6:
        return close_phone('confirmed',sample(183,214,progress(t,21.9,23.6)))
    if t<24.6:
        return overlay(menu_base,phones['handoff'],menu_quad,menu_mask)
    if t<27.8:
        return monitor_screen('pending' if t<26.1 else 'human',progress(t,24.6,27.8),1.4)
    if t<31.8:
        return monitor_screen('crm',0,1.36+.025*progress(t,27.8,31.8),freeze=True)
    if t<34.3:
        return close_phone('csat',sample(183,214,progress(t,31.8,34.3)))
    if t<39.6:
        return training_shot(sample(24,184,progress(t,34.3,39.6)))
    if t<41.7:
        return story[sample(301,337,progress(t,39.6,41.7))]
    return training_shot(sample(138,240,progress(t,41.7,45)),1.035)

chapters=[
    (0,'Movimento da rede'),(5.2,'A espera'),(7.3,'Atendimento manual'),(10,'A proposta'),
    (14.2,'Mensagem de voz'),(16.5,'Cardápio da unidade'),(20.2,'Resumo do pedido'),
    (21.9,'Confirmação'),(23.6,'Pedido de atendimento humano'),(24.6,'Transferência'),
    (26.1,'Equipe no controle'),(27.8,'RD Station CRM'),(31.8,'Pesquisa de satisfação'),
    (34.3,'Treinamento do piloto'),(39.6,'Cliente informado'),(41.7,'Convite ao piloto'),
]
target=ROOT/'Sabor-Express-Comercial-45s-FINAL.mp4'
cmd=[imageio_ffmpeg.get_ffmpeg_exe(),'-hide_banner','-loglevel','warning','-y',
     '-f','rawvideo','-vcodec','rawvideo','-s','1280x720','-pix_fmt','bgr24','-r','30','-i','-',
     '-i',str(ROOT/'soundtrack.wav'),'-map','0:v:0','-map','1:a:0',
     '-c:v','libx264','-preset','slow','-crf','17','-pix_fmt','yuv420p',
     '-c:a','aac','-b:a','192k','-ar','48000','-af','loudnorm=I=-16:TP=-1.5:LRA=9',
     '-t','45','-movflags','+faststart',str(target)]
preview='--preview' in sys.argv
if preview:cv2.imwrite(str(ROOT/'diagnostic-source-hand.png'),old[128])
process=None if preview else subprocess.Popen(cmd,stdin=subprocess.PIPE)
review_times=[.5,3,4.6,6.2,8.5,11,13.5,14.7,16.8,18.2,19.7,20.8,22.7,24,25.3,26.8,28.7,30.8,32.7,35.4,37.8,40.6,42.5,44.5]
review_frames={round(t*30):t for t in review_times}
saved=[]
for index in (sorted(review_frames) if preview else range(1350)):
    frame=render(index/30)
    if process:process.stdin.write(frame.tobytes())
    if index in review_frames:
        t=review_frames[index]
        cv2.imwrite(str(ROOT/f'final-{t:05.2f}.png'),frame)
        saved.append((t,frame.copy()))
    if index%300==0:print(f'Rendered {index}/1350 frames',flush=True)
if process:
    process.stdin.close()
    if process.wait()!=0:raise RuntimeError('Final encoding failed')
sheet=Image.new('RGB',(1280,6*205),'#181a17')
draw=ImageDraw.Draw(sheet)
for j,(t,frame) in enumerate(saved):
    small=Image.fromarray(cv2.cvtColor(frame,cv2.COLOR_BGR2RGB)).resize((320,180))
    x,y=(j%4)*320,(j//4)*205
    sheet.paste(small,(x,y));draw.text((x+8,y+183),f'{t:.2f}s',fill='white')
sheet.save(ROOT/'final-contact-sheet.jpg',quality=95)
cv2.imwrite(str(ROOT/'poster.jpg'),render(26.8))
manifest={'file':str(target),'seconds':45,'fps':30,'frames':1350,'resolution':[1280,720],
          'chapters':[{'start':t,'title':name} for t,name in chapters],
          'sora_before':'video_6aa756d28ca0819087688ff422cbe568',
          'sora_training':'video_6aa755a5d7f081908166657753c1169b',
          'sora_reused':['video_6aa74a642fc88190968f4fd0c60a49ce','video_6aa74b5c3974819093fe54cabf4ba1a1'],
          'narrator':'Azure gpt-realtime-2.1, voice marin; one recording session, pauses edited only',
          'screens':'Actual Sabor Express UI captures, same conversation and order',
          'blocked_unused_job':'video_6aa755a5923881909444013253dfdbe3'}
(ROOT/'edit-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print('Preview frames prepared' if preview else f'FINAL: {target}')
