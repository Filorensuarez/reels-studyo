# Gerçek AI yüz değiştirme — kurulum

Bu bölüm bir **arayüz + isteğe bağlı FaceFusion işlem sunucusudur**. FaceFusion kurulmadan video üretmez. Google Colab yönetilen ortamları deepfake üretimine izin vermediğinden bu amaçla kullanılmamalıdır.

## Kendi bilgisayarında / izin veren GPU sunucusunda

1. FaceFusion'ı resmi kurulum yönergesine göre ayrı bir dizine kur: https://docs.facefusion.io/installation
2. FaceFusion komut satırını `python facefusion.py headless-run --help` ile doğrula. Kurulu sürümün seçenekleri farklıysa `face_swap.py` içindeki komutu uyarlamak gerekir.
3. Bu depodaki `ai-server` dizininde Python 3.12 sanal ortamı oluştur ve `pip install -r requirements.txt` çalıştır.
4. Ortam değişkenlerini ayarla:

   `FACEFUSION_EXECUTABLE=/absolute/path/to/facefusion/facefusion.py`

   `FACEFUSION_PYTHON=/absolute/path/to/facefusion-python` (opsiyonel)

   `FACE_SWAP_API_TOKEN=uzun-rastgele-bir-sifre`

   `FRONTEND_ORIGIN=https://filorensuarez.github.io`

5. `uvicorn main:app --host 127.0.0.1 --port 8000` komutuyla başlat. Sunucuyu internete açacaksan TLS, erişim kontrolü ve iş kuyruğu gerekir. Bu kod üretim ortamı için tamamlanmış bir hizmet değildir.

`GET /api/face-swap/status` durum bilgisi verir. `POST /api/face-swap` istekleri `Authorization: Bearer <token>` başlığı ve `video`, `photo` form dosyaları gerektirir. Uygulamadaki ön yüz, güvenlik nedeniyle henüz token girişini desteklememektedir. Bağlantı uçtan uca hazır değildir.

**Önemli:** Yüz değiştirme, hedef videodaki yüz mimiklerini izler; tüm vücut ve kıyafetleri fotoğraftaki kişiye dönüştürmez. Sadece yüz değişimi yapılır, hedef kişinin vücut hareketleri kalır. Orijinal sesin korunması çıktı üzerinde doğrulanmalıdır. Hak sahibi ve görüntüdeki kişilerin izni gerekir.
