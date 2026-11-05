# Reels Stüdyo Windows işlem servisi (ilk aşama)

Bu servis, telefon arayüzünden gelen videoyu FFmpeg ile keser, boyutlandırır ve isteğe bağlı olarak yüklenen ses dosyasını videoya ekler. **DeepFaceLive, yüz değiştirme, ses klonlama veya dudak eşitleme henüz entegre değildir.** Yüz fotoğrafı yalnızca sonraki aşama için kabul edilir.

## Kurulum
Windows 11 bilgisayarına Python 3.11+ ve FFmpeg yükleyip ffmpeg komutunu PATH'e ekleyin.

```powershell
cd pc-backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:REELS_API_TOKEN = "uzun-rastgele-gizli-bir-anahtar"
uvicorn server:app --host 127.0.0.1 --port 8765
```

GitHub Pages HTTPS üzerinde olduğu için telefon tarayıcısından HTTP yerel adrese doğrudan bağlanmak güvenilir biçimde çalışmaz. Önce kimlik doğrulamalı, **HTTPS** bir özel ağ tüneli/proxy yapılandırılmalıdır. Servisi internete doğrudan açmayın. Tarayıcı bağlantısı ve video yüklemesi için TLS zorunludur. Token'ı herkese açık depoya koymayın.

### API
- `GET /health` — Bearer token ile servis durumu.
- `POST /jobs` — multipart `video`, `face`, isteğe bağlı `audio`, `ratio`, `resolution`, `start`, `end`.
- `GET /jobs/{id}/download` — Bearer token ile MP4.

İşlem senkron yürür; uzun videolarda istek zaman aşımına uğrayabilir. Dosyalar işlem sunucusunun geçici dizininde kalır; bu ilk sürüm üretim ortamı için hazır değildir. Yüz fotoğrafı çıktı üzerinde kullanılmaz.
