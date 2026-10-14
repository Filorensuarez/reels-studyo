# Reels Stüdyo AI sunucu taslağı

Bu servis gerçek AI modeli **içermez**. Gerçek video üretimini sağlayan GPU üreticisine güvenli bir sunucu bağlantısı kurmak için başlangıç altyapısıdır.

## Çalıştırma
```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Ortam değişkenleri
- `FRONTEND_ORIGIN`: Varsayılan `https://filorensuarez.github.io`
- `VIDEO_PROVIDER_URL`: HTTPS GPU video üretim API uç noktası (henüz seçilmedi)
- `VIDEO_PROVIDER_TOKEN`: API anahtarı; sadece sunucuda saklanmalı

## API
- `GET /health`: model bağlantı durumu
- `POST /api/video`: `{"story":"...", "style":"cartoon"|"realistic", "duration":20}` isteğini üreticiye iletir. Üreticiden `job_id` bekler.

**Eksikler:** Sağlayıcıya özgü durum sorgulama, video indirme, üretim kotası, kullanıcı yetkilendirme, iş kuyruğu ve kötüye kullanım koruması. Bunlar tamamlanmadan API'yi herkese açık şekilde üretim ortamında çalıştırmayın. API anahtarını asla GitHub Pages tarafına koymayın.
