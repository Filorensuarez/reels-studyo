"""Optional GPU worker for real face replacement using a locally installed FaceFusion CLI.
Does not simulate a result when the model or GPU is unavailable.
Only use with permission from the people depicted.
"""
import asyncio
import os
import shutil
import tempfile
import secrets
from fastapi import Header
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
    authorization: str | None = Header(default=None),
):
    required_token = os.getenv("FACE_SWAP_API_TOKEN", "").strip()
    if not required_token or not authorization or not secrets.compare_digest(authorization, "Bearer " + required_token):
        raise HTTPException(401, "Yetkili API erişimi gerekli.")
    exe = os.getenv("FACEFUSION_EXECUTABLE", "").strip()
    if not exe or not Path(exe).is_file():
        raise HTTPException(503, "FaceFusion modeli sunucuda kurulu değil.")
    if not (video.content_type or "").startswith("video/"):
        raise HTTPException(415, "Video dosyası gerekli.")
    if not (photo.content_type or "").startswith("image/"):
        raise HTTPException(415, "Yüz fotoğrafı gerekli.")
    directory = Path(tempfile.mkdtemp(prefix="reels-faceswap-"))
    try:
        source = directory / ("source.png" if photo.content_type == "image/png" else "source.jpg")
        target = directory / "target.mp4"
        output = directory / "output.mp4"
        await save_upload(photo, source, MAX_PHOTO)
        await save_upload(video, target, MAX_VIDEO)
        # FaceFusion headless CLI; GPU model installation and runtime verification required.
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
