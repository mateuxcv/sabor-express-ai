"""Shared photometric and planar screen-compositing helpers for advertisement editing."""
import cv2
import numpy as np
from PIL import Image, ImageDraw

def decode(path):
    cap=cv2.VideoCapture(str(path))
    frames=[]
    while True:
        ok,frame=cap.read()
        if not ok:break
        frames.append(frame)
    cap.release()
    return frames

def mask_screen(frame,kind):
    hsv=cv2.cvtColor(frame,cv2.COLOR_BGR2HSV)
    if kind in ('monitor','training','menu'):
        mask=cv2.inRange(hsv,(0,0,110),(179,25,235))
        if kind=='menu':
            mask[:10]=0;mask[650:]=0;mask[:,:610]=0;mask[:,1060:]=0
        else:
            mask[:70]=0;mask[660:]=0;mask[:,:25]=0;mask[:,1140:]=0
    else:
        b,g,r=[channel.astype(np.int16) for channel in cv2.split(frame)]
        mask=((g-r>5)&(b-r>3)&(g>115)&(hsv[:,:,1]<85)).astype(np.uint8)*255
    contours,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    contour=max(contours,key=cv2.contourArea)
    selected=np.zeros_like(mask)
    cv2.drawContours(selected,[contour],-1,255,-1)
    return cv2.bitwise_and(selected,mask),contour

def order(points):
    p=np.asarray(points,np.float32).reshape(-1,2)
    s,d=p.sum(1),np.diff(p,axis=1).ravel()
    return np.array([p[s.argmin()],p[d.argmin()],p[s.argmax()],p[d.argmax()]],np.float32)

def corners(frame,kind='monitor'):
    _,contour=mask_screen(frame,kind)
    hull=cv2.convexHull(contour)
    poly=cv2.approxPolyDP(hull,.015*cv2.arcLength(hull,True),True)
    if len(poly)!=4:raise RuntimeError(f'Invalid display polygon: {kind}, {len(poly)} corners')
    quad=order(poly)
    points=contour.reshape(-1,2).astype(np.float32)
    lines=[]
    for a,b in zip(quad,np.roll(quad,-1,axis=0)):
        edge=b-a
        t=((points-a)@edge)/(edge@edge)
        cross=(points[:,0]-a[0])*edge[1]-(points[:,1]-a[1])*edge[0]
        dist=np.abs(cross)/np.linalg.norm(edge)
        selected=points[(dist<7)&(t>.08)&(t<.92)]
        if len(selected)<8:selected=np.array([a,b])
        vx,vy,x,y=cv2.fitLine(selected,cv2.DIST_HUBER,0,.01,.01).ravel()
        lines.append((np.array([x,y]),np.array([vx,vy])))
    refined=[]
    for j in range(4):
        a,v=lines[(j-1)%4];b,w=lines[j]
        t=np.linalg.solve(np.column_stack((v,-w)),b-a)[0]
        refined.append(a+t*v)
    return np.array(refined,np.float32)

def track(frames,kind='monitor'):
    raw=np.array([corners(frame,kind) for frame in frames])
    return np.array([np.median(raw[max(0,j-3):min(len(raw),j+4)],axis=0) for j in range(len(raw))])

def phone_image(path):
    image=cv2.imread(str(path))[16:1404,14:716].copy()
    matte=Image.new('L',(image.shape[1],image.shape[0]))
    ImageDraw.Draw(matte).rounded_rectangle((0,0,image.shape[1]-1,image.shape[0]-1),80,fill=255)
    outside=np.array(matte)==0
    yy=np.indices(outside.shape)[0]
    image[outside&(yy<100)]=(36,43,32)
    image[outside&(yy>=100)]=(212,225,213)
    return image

def overlay(frame,image,quad,physical_mask=None):
    width=max(2,round((np.linalg.norm(quad[1]-quad[0])+np.linalg.norm(quad[2]-quad[3]))/2))
    height=max(2,round((np.linalg.norm(quad[3]-quad[0])+np.linalg.norm(quad[2]-quad[1]))/2))
    image=cv2.resize(image,(width,height),interpolation=cv2.INTER_AREA)
    src=np.array([[0,0],[width-1,0],[width-1,height-1],[0,height-1]],np.float32)
    h=cv2.getPerspectiveTransform(src,quad.astype(np.float32))
    warped=cv2.warpPerspective(image,h,(1280,720),flags=cv2.INTER_LANCZOS4).astype(np.float32)
    alpha=cv2.warpPerspective(np.ones((height,width),np.float32),h,(1280,720))
    if physical_mask is not None:alpha*=physical_mask.astype(np.float32)/255
    alpha=cv2.GaussianBlur(alpha,(3,3),.45)[:,:,None]
    warped*=np.array([.94,.965,.975])
    return np.clip(warped*alpha+frame*(1-alpha),0,255).astype(np.uint8)

def close_track(frames):
    result=[]
    for frame in frames:
        mask,_=mask_screen(frame,'close')
        rows=[]
        for y in range(30,410,4):
            xs=np.flatnonzero(mask[y])
            if len(xs)>300:rows.append((y,xs[0],xs[-1]))
        rows=np.array(rows)
        left=np.polyfit(rows[:,0],rows[:,1],1)
        right=np.polyfit(rows[:,0],rows[:,2],1)
        top,bottom=-225,825
        result.append(np.array([[np.polyval(left,top),top],[np.polyval(right,top),top],
                                [np.polyval(right,bottom),bottom],[np.polyval(left,bottom),bottom]],np.float32))
    raw=np.array(result)
    return np.array([np.median(raw[max(0,j-3):min(len(raw),j+4)],axis=0) for j in range(len(raw))])

def reframe(frame,scale=1.,center=(640,360),target=(640,360)):
    matrix=np.array([[scale,0,target[0]-scale*center[0]],[0,scale,target[1]-scale*center[1]]],np.float32)
    return cv2.warpAffine(frame,matrix,(1280,720),flags=cv2.INTER_LANCZOS4),matrix
