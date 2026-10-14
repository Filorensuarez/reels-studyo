"""Reels Stüdyo AI: harici GPU üreticiye bağlanmaya hazır API.
Üretici bağlanmadıkça başarı veya sahte video URL'si döndürmez.
"""
import os
from typing import Literal
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="Reels Stüdyo AI", version="0.1.0")
origin = os.getenv("FRONTEND_ORIGIN", "https://filorensuarez.github.io")
app.add_middleware(CORSMiddleware, allow_origins=[origin], allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

class VideoRequest(BaseModel):
    story: str = Field(min_length=5, max_length=2500)
    style: Literal["cartoon", "realistic"]
    duration: Literal[12, 20, 30] = 20

@app.get("/health")
async def health():
    return {"ok": True, "model_connected": bool(os.getenv("VIDEO_PROVIDER_URL"))}

@app.post("/api/video")
async def video(req: VideoRequest):
    url = os.getenv("VIDEO_PROVIDER_URL", "").strip()
    if not url:
        raise HTTPException(status_code=503, detail="Gerçek video üretim modeli henüz sunucuya bağlanmadı.")
    if not url.startswith("https://"):
        raise HTTPException(status_code=503, detail="Üretici adresi güvenli HTTPS olmalı.")
    headers = {"Content-Type": "application/json"}
    token = os.getenv("VIDEO_PROVIDER_TOKEN", "")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    payload = {"prompt": req.story, "style": req.style, "duration": req.duration}
    try:
        async with httpx.AsyncClient(timeout=25) as client:
            result = await client.post(url, json=payload, headers=headers)
            result.raise_for_status()
            data = result.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(status_code=502, detail="Video üretim sunucusuna ulaşılamadı veya geçerli yanıt alınamadı.")
    # Provider must return a real job ID. No fabricated success.
    job_id = data.get("job_id")
    if not isinstance(job_id, str) or not job_id:
        raise HTTPException(status_code=502, detail="Video üreticisi geçerli bir iş numarası döndürmedi.")
    return {"job_id": job_id, "status": "queued"}
