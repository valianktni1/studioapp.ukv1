FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates gnupg libmagic1 curl \
    && echo "deb http://deb.debian.org/debian bookworm-backports main" > /etc/apt/sources.list.d/backports.list \
    && apt-get update \
    # Newer Mesa VAAPI driver + ffmpeg from backports so the AMD 780M (RDNA3/VCN 4.0)
    # H.264 hardware encoder (h264_vaapi) is actually available. Bookworm's default
    # Mesa is too old and makes ffmpeg fall back to CPU.
    && apt-get install -y --no-install-recommends -t bookworm-backports \
       mesa-va-drivers libva2 libva-drm2 libva-x11-2 \
    && apt-get install -y --no-install-recommends \
       ffmpeg vainfo \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir \
    --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/ \
    -r requirements.txt

COPY . .

EXPOSE 8001

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]
