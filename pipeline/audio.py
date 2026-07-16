"""
Stage 4: fill in audio_url for every level record.

Per PRODUCTION_READINESS.md Decision 2: native pronunciation first for every
headword; TTS fallback (clearly labeled via AudioAsset.source) where native
audio is missing or fails to fetch/process; TTS always for example sentences.

Every asset is normalized (loudness + trimmed silence), transcoded to mp3,
and uploaded to Cloudflare R2 (S3-compatible). Source/license/attribution is
recorded per file, matching the AudioAsset model, so the licensing review
(E4) has something to check.

Env vars required:
    AZURE_SPEECH_KEY, AZURE_SPEECH_REGION      TTS fallback
    R2_ENDPOINT, R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY, R2_BUCKET            storage
    CDN_BASE_URL                                public URL prefix for objects

Usage:
    python audio.py
    python audio.py --levels-dir ./out/levels --sentences   # also do example sentences

This mutates the level_XXX.json files in place (sets audio_url, drops the
_native_audio_candidates scratch field) and writes ./out/audio_assets.json,
one row per uploaded file, matching the AudioAsset model's columns.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import sys
import time
from pathlib import Path

import requests
from pydub import AudioSegment, effects, silence

OUT_DIR = Path("./out")
TARGET_DBFS = -20.0
SILENCE_THRESH_DB = -40
MIN_SILENCE_MS = 150

# Wikimedia's bot policy asks for a descriptive UA with contact info; generic
# UAs get rate-limited hard under any real volume. Put your actual contact
# here (email or a GitHub URL for the project) before running at scale.
WIKIMEDIA_UA = "Slonbelka-pipeline/1.0 (https://github.com/ASM-21/SlonBelka; contact: REPLACE_WITH_YOUR_EMAIL)"
MAX_RETRIES = 4
NATIVE_FETCH_DELAY = 0.3  # seconds between native fetch attempts, to stay under rate limits


class AudioPipelineError(RuntimeError):
    pass


# --------------------------------------------------------------------------- #
# Fetch / synthesize
# --------------------------------------------------------------------------- #
def fetch_native(url: str, timeout: int = 15) -> bytes | None:
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, timeout=timeout, headers={"User-Agent": WIKIMEDIA_UA})
        except requests.RequestException:
            return None
        if resp.status_code == 429:
            wait = float(resp.headers.get("Retry-After", 2 ** attempt))
            time.sleep(wait)
            continue
        try:
            resp.raise_for_status()
        except requests.RequestException:
            return None
        return resp.content
    return None


def synthesize_tts(text: str, voice: str = "ru-RU-DmitryNeural") -> bytes:
    """Azure Speech REST TTS. Returns raw mp3 bytes."""
    key = os.environ.get("AZURE_SPEECH_KEY")
    region = os.environ.get("AZURE_SPEECH_REGION")
    if not key or not region:
        raise AudioPipelineError("AZURE_SPEECH_KEY / AZURE_SPEECH_REGION not set")
    ssml = (
        '<speak version="1.0" xml:lang="ru-RU">'
        f'<voice name="{voice}">{text}</voice></speak>'
    )
    resp = requests.post(
        f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1",
        headers={
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
            "User-Agent": "Slonbelka-pipeline",
        },
        data=ssml.encode("utf-8"),
        timeout=15,
    )
    resp.raise_for_status()
    return resp.content


# --------------------------------------------------------------------------- #
# Normalize
# --------------------------------------------------------------------------- #
def normalize_to_mp3(raw: bytes) -> bytes:
    """Loudness-normalize, trim leading/trailing silence, export as mp3."""
    audio = AudioSegment.from_file(io.BytesIO(raw))
    audio = effects.normalize(audio)
    audio = audio.apply_gain(TARGET_DBFS - audio.dBFS)
    ranges = silence.detect_nonsilent(
        audio, min_silence_len=MIN_SILENCE_MS, silence_thresh=SILENCE_THRESH_DB
    )
    if ranges:
        start, end = ranges[0][0], ranges[-1][1]
        audio = audio[start:end]
    buf = io.BytesIO()
    audio.export(buf, format="mp3", bitrate="96k")
    return buf.getvalue()


# --------------------------------------------------------------------------- #
# Storage
# --------------------------------------------------------------------------- #
def upload_to_r2(key: str, data: bytes, content_type: str = "audio/mpeg") -> str:
    import boto3

    bucket = os.environ["R2_BUCKET"]
    public_base = os.environ["CDN_BASE_URL"].rstrip("/")
    client = boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )
    client.put_object(Bucket=bucket, Key=key, Body=data, ContentType=content_type)
    return f"{public_base}/{key}"


# --------------------------------------------------------------------------- #
# Orchestration
# --------------------------------------------------------------------------- #
def process_item(record: dict) -> dict:
    """Returns an AudioAsset row and mutates record['audio_url'] in place."""
    lemma = record["lemma"]
    key = f"headwords/{record['external_id'].replace(':', '_')}.mp3"

    for candidate in record.get("_native_audio_candidates", []):
        raw = fetch_native(candidate["url"])
        time.sleep(NATIVE_FETCH_DELAY)
        if not raw:
            continue
        try:
            mp3 = normalize_to_mp3(raw)
        except Exception:
            continue
        url = upload_to_r2(key, mp3)
        record["audio_url"] = url
        return {"key": key, "url": url, "source": "native",
                "license": candidate["license"], "attribution": candidate["attribution"]}

    # Native missing or every candidate failed to fetch/decode -> TTS fallback.
    raw = synthesize_tts(lemma)
    mp3 = normalize_to_mp3(raw)
    url = upload_to_r2(key, mp3)
    record["audio_url"] = url
    return {"key": key, "url": url, "source": "tts",
            "license": "n/a (synthesized)", "attribution": "Azure Cognitive Services TTS"}


def process_levels(levels_dir: Path, sleep_between: float = 0.0) -> list[dict]:
    assets = []
    for path in sorted(levels_dir.glob("level_*.json")):
        records = json.loads(path.read_text(encoding="utf-8"))
        for record in records:
            if record.get("audio_url"):
                record.pop("_native_audio_candidates", None)
                continue
            try:
                assets.append(process_item(record))
            except AudioPipelineError as exc:
                print(f"  ! {record['lemma']}: {exc}", file=sys.stderr)
                continue
            finally:
                record.pop("_native_audio_candidates", None)
            if sleep_between:
                time.sleep(sleep_between)
        path.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
        n_native = sum(1 for r in records if r.get("audio_url"))
        print(f"{path.name}: {n_native}/{len(records)} have audio")
    return assets


def main() -> None:
    ap = argparse.ArgumentParser(description="Fill in audio_url for every level record")
    ap.add_argument("--levels-dir", type=Path, default=OUT_DIR / "levels")
    ap.add_argument("--out", type=Path, default=OUT_DIR / "audio_assets.json")
    ap.add_argument("--sleep", type=float, default=0.0,
                     help="Seconds to sleep between items, to stay under TTS rate limits")
    args = ap.parse_args()

    required_env = ["R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY",
                     "R2_BUCKET", "CDN_BASE_URL"]
    missing = [v for v in required_env if not os.environ.get(v)]
    if missing:
        sys.exit(f"Missing required env vars: {', '.join(missing)}")

    if not args.levels_dir.exists():
        sys.exit(f"{args.levels_dir} not found. Run levels.py first.")

    assets = process_levels(args.levels_dir, args.sleep)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(assets, ensure_ascii=False, indent=2), encoding="utf-8")
    n_native = sum(1 for a in assets if a["source"] == "native")
    n_tts = sum(1 for a in assets if a["source"] == "tts")
    print(f"\n{len(assets)} audio assets: {n_native} native, {n_tts} TTS fallback")
    print(f"Written to {args.out}")


if __name__ == "__main__":
    main()
