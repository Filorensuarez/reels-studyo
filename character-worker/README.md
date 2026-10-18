# Reels Stüdyo Character Worker (GPU required)
This is a backend integration scaffold, **not a deployed video generator**. Run on a GPU machine with Wan2.2-Animate-14B weights, dependencies, preprocessing checkpoints and ffmpeg installed.
Environment: WAN_ROOT=/path/to/Wan2.2, WAN_CKPT=/path/to/Wan2.2-Animate-14B, ALLOWED_ORIGIN=https://filorensuarez.github.io
Start: uvicorn app:app --host 0.0.0.0 --port 8000
Endpoints: GET /health, POST /jobs (multipart video + character), GET /jobs/{id}, GET /jobs/{id}/result.
WARNING: Prototype only. Add authentication, per-user isolation, rate limits, persistent queues, job expiration and secure uploads before public exposure. Job state is memory-only. The reference-image preprocessing expects an image-readable file; rename/conversion and proper validation should be added for non-PNG uploads. Long clips need segment handling. Model CLI flags must be validated against installed Wan revision. Do not expose this endpoint publicly as-is.
