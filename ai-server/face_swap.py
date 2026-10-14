"""Optional GPU worker for real face replacement using a locally installed FaceFusion CLI.
Does not simulate a result when the model or GPU is unavailable.
Only use with permission from the people depicted.
"""
import asyncio
import os
import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

router = APIRouter()
MAX_VIDEO = 150 * 1024 * 1024
MAX_PHOTO = 15 * 1024 * 1024

async def save_upload(upload: UploadFile, path: Path, limit: int):
    size = 0
    with path.open("wb") as out:
        while chunk := await upload.read(1024 * 1024):
            size += len(chunk)
            if size > limit:
                raise HTTPException(413, "Dosya izin verilen boyutu aşıyor.")
            out.write(chunk)
    if size == 0:
        raise HTTPException(400, "Boş dosya.")

@router.get("/api/face-swap/status")
def status():
    exe = os.getenv("FACEFUSION_EXECUTABLE", "").strip()
    return {"ready": bool(exe and Path(exe).is_file()), "engine": "FaceFusion",
            "message": "Gerçek model hazır" if exe and Path(exe).is_file() else "AI modeli kurulmadı"}

@router.post("/api/face-swap")
async def face_swap(
    video: UploadFile = File(...),
    photo: UploadFile = File(...),
    preserve_audio: bool = Form(True),
):
    exe = os.getenv("FACEFUSION_EXECUTABLE", "").strip()
    if not exe or not Path(exe).is_file():
        raise HTTPException(503, "FaceFusion modeli sunucuda kurulu değil.")
    if not (video.content_type or "").startswith("video/"):
        raise HTTPException(415, "Video dosyası gerekli.")
    if not (photo.content_type or "").startswith("image/"):
        raise HTTPException(415, "Yüz fotoğrafı gerekli.")
    directory = Path(tempfile.mkdtemp(prefix="reels-faceswap-"))
    try:
        source = directory / "source.jpg"
        target = directory / "target.mp4"
        output = directory / "output.mp4"
        await save_upload(photo, source, MAX_PHOTO)
        await save_upload(video, target, MAX_VIDEO)
        # FaceFusion command line runner. Requires FaceFusion and its models installed on GPU worker.
        command = [exe, "headless-run", "--source-paths", str(source),
                   "--target-path", str(target), "--output-path", str(output),
                   "--processors", "face_swapper",
                   "--output-video-encoder", "libx264"]
        proc = await asyncio.create_subprocess_exec(
            *command, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=900)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            raise HTTPException(504, "İşlem 15 dakikalık süreyi aştı.")
        if proc.returncode != 0 or not output.is_file() or output.stat().st_size < 1024:
            raise HTTPException(502, "Yüz değiştirme modeli çıktı üretemedi.")
        return FileResponse(output, media_type="video/mp4", filename="reels-yuz-degistirme.mp4",
                            background=BackgroundTask(shutil.rmtree, directory, ignore_errors=True))
    except Exception:
        shutil.rmtree(directory, ignore_errors=True)
        raise
