import os,uuid,subprocess,shutil,threading
from pathlib import Path
from fastapi import FastAPI,UploadFile,File,HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
ROOT=Path(os.getenv("JOBS_DIR","/tmp/character-jobs"));ROOT.mkdir(parents=True,exist_ok=True)
app=FastAPI(title="Reels Stüdyo Character Worker")
allowed=os.getenv("ALLOWED_ORIGIN","").strip()
app.add_middleware(CORSMiddleware,allow_origins=[allowed] if allowed else [],allow_methods=["GET","POST"],allow_headers=["*"])
jobs={}
@app.get("/health")
def health():
 return {"ready":bool(shutil.which("ffmpeg") and os.getenv("WAN_ROOT") and Path(os.getenv("WAN_ROOT","")).is_dir() and os.getenv("WAN_CKPT") and Path(os.getenv("WAN_CKPT","")).is_dir()),"gpu_required":True}
def run(job_id):
 j=jobs[job_id];p=ROOT/job_id
 try:
  j["state"]="preprocessing"
  wan=Path(os.environ["WAN_ROOT"]);ckpt=Path(os.environ["WAN_CKPT"])
  pre=p/"preprocessed";pre.mkdir()
  subprocess.run(["python",str(wan/"wan/modules/animate/preprocess/preprocess_data.py"),"--ckpt_path",str(ckpt/"process_checkpoint"),"--video_path",str(p/"source.mp4"),"--refer_path",str(p/"character.png"),"--save_path",str(pre),"--resolution_area","1280","720","--iterations","3","--k","7","--w_len","1","--h_len","1","--replace_flag"],check=True,timeout=3600,cwd=wan)
  j["state"]="generating"
  output=p/"generated.mp4"
  subprocess.run(["python",str(wan/"generate.py"),"--task","animate-14B","--ckpt_dir",str(ckpt),"--src_root_path",str(pre),"--refert_num","1","--replace_flag","--use_relighting_lora","--save_file",str(output)],check=True,timeout=7200,cwd=wan)
  j["state"]="muxing"
  subprocess.run(["ffmpeg","-y","-i",str(output),"-i",str(p/"source.mp4"),"-map","0:v:0","-map","1:a:0?","-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac","-shortest",str(p/"result.mp4")],check=True,timeout=600)
  j["state"]="done"
 except Exception as e:j["state"]="error";j["error"]=str(e)[:500]
@app.post("/jobs")
async def create_job(video:UploadFile=File(...),character:UploadFile=File(...)):
 if not (os.getenv("WAN_ROOT") and os.getenv("WAN_CKPT")):raise HTTPException(503,"GPU worker and Wan model are not configured")
 if video.content_type not in ("video/mp4","video/quicktime","video/webm") or character.content_type not in ("image/jpeg","image/png","image/webp"):raise HTTPException(415,"Unsupported media")
 id=uuid.uuid4().hex;p=ROOT/id;p.mkdir()
 for upload,name in ((video,"source.mp4"),(character,"character.png")):
  total=0
  with (p/name).open("wb") as out:
   while chunk:=await upload.read(1024*1024):
    total+=len(chunk)
    if total>100*1024*1024:raise HTTPException(413,"File too large")
    out.write(chunk)
 jobs[id]={"state":"queued"}
 threading.Thread(target=run,args=(id,),daemon=True).start()
 return {"job_id":id,"state":"queued"}
@app.get("/jobs/{job_id}")
def status(job_id:str):
 if job_id not in jobs:raise HTTPException(404,"Job not found")
 return jobs[job_id]
@app.get("/jobs/{job_id}/result")
def result(job_id:str):
 if job_id not in jobs or jobs[job_id]["state"]!="done":raise HTTPException(404,"Result not ready")
 return FileResponse(ROOT/job_id/"result.mp4",media_type="video/mp4",filename="karakter-degistirme.mp4")
