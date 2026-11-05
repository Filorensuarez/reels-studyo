"""Reels Stüdyo yerel video işleme servisi. Yüz/ses AI motoru içermez."""
import os, secrets, subprocess, tempfile, shutil, uuid, time, threading, math
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse


TOKEN=os.environ.get("REELS_API_TOKEN","")
if not TOKEN: raise RuntimeError("REELS_API_TOKEN ortam değişkenini ayarlayın.")
ROOT=Path(os.environ.get("REELS_WORK_DIR",tempfile.gettempdir()))/"reels_studyo_jobs"
ROOT.mkdir(parents=True,exist_ok=True)
app=FastAPI(title="Reels Stüdyo PC Servisi")
app.add_middleware(CORSMiddleware,allow_origins=["https://filorensuarez.github.io"],allow_credentials=False,allow_methods=["GET","POST"],allow_headers=["Authorization","Content-Type"])
JOBS={}
LOCK=threading.Lock()
POOL=ThreadPoolExecutor(max_workers=1)
TTL_SECONDS=6*60*60

def cleanup():
    now=time.time()
    with LOCK:
        expired=[jid for jid,job in JOBS.items() if job["state"] in ("done","error") and now-job["created"]>TTL_SECONDS]
        for jid in expired:
            shutil.rmtree(ROOT/jid,ignore_errors=True)
            del JOBS[jid]

def auth(header):
    if not header or not secrets.compare_digest(header,"Bearer "+TOKEN):raise HTTPException(401,"Yetkisiz erişim")
def safe_file(upload, destination, limit=750*1024*1024):
    count=0
    with open(destination,"wb") as out:
        while data:=upload.file.read(1024*1024):
            count+=len(data)
            if count>limit:raise HTTPException(413,"Dosya çok büyük (750 MB).")
            out.write(data)
@app.get("/health")
def health(authorization:str|None=Header(default=None)):
    auth(authorization)
    return {"ok":True,"engine":"ffmpeg","face_swap":False,"voice_conversion":False}
@app.post("/jobs")
def process(video:UploadFile=File(...),face:UploadFile=File(...),audio:UploadFile|None=File(default=None),ratio:str=Form("9:16"),resolution:str=Form("1080"),start:float=Form(0),end:float|None=Form(None),authorization:str|None=Header(default=None)):
    auth(authorization)
    if not video.content_type or not video.content_type.startswith("video/"):raise HTTPException(400,"Video gerekli.")
    if not face.content_type or not face.content_type.startswith("image/"):raise HTTPException(400,"Yüz fotoğrafı gerekli.")
    if audio and not (audio.content_type or "").startswith(("audio/","video/")):raise HTTPException(400,"Ses dosyası geçersiz.")
    if not math.isfinite(start) or (end is not None and not math.isfinite(end)) or start<0 or end is not None and end<=start:raise HTTPException(400,"Zaman aralığı geçersiz.")
    if ratio not in ("9:16","1:1","16:9","original") or resolution not in ("1080","720","original"):raise HTTPException(400,"Çıkış ayarı geçersiz.")
    cleanup()
    jid=uuid.uuid4().hex; folder=ROOT/jid;folder.mkdir()
    try:
        src=folder/"input.video"; safe_file(video,src)
        safe_file(face,folder/"face.image",10*1024*1024)
        snd=folder/"audio.input"
        if audio:safe_file(audio,snd,100*1024*1024)
        with LOCK:
            JOBS[jid]={"state":"queued","created":time.time(),"path":str(folder/"result.mp4"),"error":None}
        POOL.submit(run_job,jid,src,snd,bool(audio),ratio,resolution,start,end)
        return {"id":jid,"status":"/jobs/"+jid,"message":"İşlem sıraya alındı; yüz ve ses yapay zekâ dönüşümü uygulanmaz."}
    except Exception:
        with LOCK: JOBS.pop(jid,None)
        shutil.rmtree(folder,ignore_errors=True)
        raise
def run_job(jid,src,snd,audio_present,ratio,resolution,start,end):
    folder=ROOT/jid
    try:
        out=folder/"result.mp4"
        cmd=["ffmpeg","-hide_banner","-loglevel","error","-y"]
        if start:cmd+=["-ss",str(start)]
        cmd+=["-i",str(src)]
        if audio_present:cmd+=["-i",str(snd)]
        if end is not None:cmd+=["-t",str(end-start)]
        filters=[]
        if resolution!="original":
            h=int(resolution)
            if ratio=="9:16":w=round(h*9/16/2)*2
            elif ratio=="1:1":w=h
            elif ratio=="16:9":w=round(h*16/9/2)*2
            else:w=None
            if w:filters=[f"scale={w}:{h}:force_original_aspect_ratio=increase",f"crop={w}:{h}", "setsar=1"]
            else:filters=[f"scale=-2:{h}"]
        if filters:cmd+=["-vf",",".join(filters)]
        cmd+=["-map","0:v:0"]
        if audio_present:cmd+=["-map","1:a:0","-shortest"]
        else:cmd+=["-map","0:a?"]
        cmd+=["-c:v","libx264","-preset","veryfast","-crf","23","-pix_fmt","yuv420p","-c:a","aac","-movflags","+faststart",str(out)]
        run=subprocess.run(cmd,capture_output=True,text=True,timeout=1200)
        if run.returncode or not out.exists():raise RuntimeError("FFmpeg işlemi başarısız: "+run.stderr[-300:])

        with LOCK: JOBS[jid]["state"]="done"
    except Exception as exc:
        with LOCK:
            JOBS[jid]["state"]="error"
            JOBS[jid]["error"]=str(exc)[:350]

@app.get("/jobs/{job_id}")
def status(job_id:str,authorization:str|None=Header(default=None)):
    auth(authorization)
    cleanup()
    with LOCK: job=JOBS.get(job_id)
    if not job:raise HTTPException(404,"İş bulunamadı.")
    return {"id":job_id,"state":job["state"],"error":job["error"],"download":"/jobs/"+job_id+"/download" if job["state"]=="done" else None,"face_swap_applied":False,"voice_conversion_applied":False,"message":"Yapay zekâ yüz/ses dönüşümü uygulanmadı."}

@app.get("/jobs/{job_id}/download")
def download(job_id:str,authorization:str|None=Header(default=None)):
    auth(authorization)
    with LOCK: job=JOBS.get(job_id)
    path=job["path"] if job and job["state"]=="done" else None
    if not path or not Path(path).is_file():raise HTTPException(404,"Dosya bulunamadı.")
    return FileResponse(path,media_type="video/mp4",filename="reels-sonuc.mp4")
