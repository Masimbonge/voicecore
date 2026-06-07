"""
Project 4: VoiceCore — Multilingual Voice Assistant
Masimbonge Portfolio — Backend (FastAPI + WebSockets)
Edit: voice_id, language list, and system prompt below
"""

import os
import io
import json
import logging
import base64
import asyncio
import tempfile
from pathlib import Path

import anthropic
import whisper
import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

# ── Config — edit these ───────────────────────────────────────────────────────
ANTHROPIC_API_KEY  = os.getenv("ANTHROPIC_API_KEY")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
WHISPER_MODEL      = os.getenv("WHISPER_MODEL", "base")    # ← Edit: tiny/base/small/medium/large
ELEVENLABS_VOICE   = os.getenv("ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL")  # ← Edit: your voice ID
CLAUDE_MODEL       = "claude-sonnet-4-20250514"

# ← Edit: add/remove supported languages
SUPPORTED_LANGUAGES = {
    "en": "English", "es": "Spanish", "fr": "French", "de": "German",
    "pt": "Portuguese", "it": "Italian", "nl": "Dutch",
    "zh": "Chinese", "ja": "Japanese", "ko": "Korean",
}

# System prompt — edit to customise personality
VOICE_SYSTEM_PROMPT = """You are VoiceCore, a friendly and intelligent multilingual voice assistant.
Keep responses conversational and concise — under 3 sentences where possible.
You are speaking out loud, so avoid markdown, bullet points, or long lists.
Be natural, warm, and helpful. Built by Masimbonge."""

# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(title="VoiceCore API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # ← Edit: your frontend URL in production
    allow_methods=["*"],
    allow_headers=["*"],
)

claude_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

# Load Whisper model once at startup
log.info(f"Loading Whisper model: {WHISPER_MODEL}")
whisper_model = whisper.load_model(WHISPER_MODEL)
log.info("Whisper ready ✓")

# ── Transcription ──────────────────────────────────────────────────────────────
def transcribe_audio(audio_bytes: bytes) -> dict:
    """Transcribe audio bytes using Whisper. Returns text + detected language."""
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
        f.write(audio_bytes)
        tmp_path = f.name
    try:
        result = whisper_model.transcribe(tmp_path, task="transcribe")
        return {
            "text": result["text"].strip(),
            "language": result.get("language", "en"),
            "language_name": SUPPORTED_LANGUAGES.get(result.get("language", "en"), "Unknown"),
        }
    finally:
        Path(tmp_path).unlink(missing_ok=True)

# ── LLM Response ──────────────────────────────────────────────────────────────
def get_claude_response(text: str, history: list[dict]) -> str:
    """Get a response from Claude given conversation history."""
    messages = history + [{"role": "user", "content": text}]
    response = claude_client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=300,    # ← Edit: increase for longer responses
        system=VOICE_SYSTEM_PROMPT,
        messages=messages,
    )
    return response.content[0].text

# ── Text-to-Speech ─────────────────────────────────────────────────────────────
async def synthesise_speech(text: str) -> bytes:
    """Convert text to speech using ElevenLabs."""
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE}"
    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
    }
    payload = {
        "text": text,
        "model_id": "eleven_multilingual_v2",   # ← Edit: supports all languages
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
        },
    }
    async with httpx.AsyncClient() as client:
        res = await client.post(url, headers=headers, json=payload, timeout=30)
        res.raise_for_status()
        return res.content

# ── WebSocket endpoint ─────────────────────────────────────────────────────────
@app.websocket("/ws/voice")
async def voice_websocket(ws: WebSocket):
    """
    WebSocket flow:
    1. Client sends audio as base64
    2. Server transcribes with Whisper
    3. Server gets Claude response
    4. Server synthesises with ElevenLabs
    5. Server sends back audio + transcript
    """
    await ws.accept()
    history: list[dict] = []
    log.info("WebSocket connected")

    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)

            if msg["type"] == "audio":
                audio_bytes = base64.b64decode(msg["data"])

                # Step 1: Transcribe
                await ws.send_text(json.dumps({"type": "status", "text": "Transcribing..."}))
                transcription = transcribe_audio(audio_bytes)
                user_text = transcription["text"]

                if not user_text:
                    await ws.send_text(json.dumps({"type": "error", "text": "Could not detect speech"}))
                    continue

                await ws.send_text(json.dumps({
                    "type": "transcription",
                    "text": user_text,
                    "language": transcription["language_name"],
                }))

                # Step 2: Get Claude response
                await ws.send_text(json.dumps({"type": "status", "text": "Thinking..."}))
                assistant_text = get_claude_response(user_text, history)

                # Update history
                history.append({"role": "user", "content": user_text})
                history.append({"role": "assistant", "content": assistant_text})
                if len(history) > 20:   # ← Edit: max conversation turns kept
                    history = history[-20:]

                await ws.send_text(json.dumps({"type": "response_text", "text": assistant_text}))

                # Step 3: Synthesise speech
                await ws.send_text(json.dumps({"type": "status", "text": "Generating voice..."}))
                audio_response = await synthesise_speech(assistant_text)

                await ws.send_text(json.dumps({
                    "type": "audio_response",
                    "data": base64.b64encode(audio_response).decode(),
                    "mime": "audio/mpeg",
                }))

            elif msg["type"] == "clear_history":
                history.clear()
                await ws.send_text(json.dumps({"type": "status", "text": "Conversation cleared"}))

    except WebSocketDisconnect:
        log.info("WebSocket disconnected")

# ── REST fallback ──────────────────────────────────────────────────────────────
@app.post("/transcribe")
async def transcribe_endpoint(audio: UploadFile = File(...)):
    """Simple REST transcription endpoint."""
    content = await audio.read()
    result = transcribe_audio(content)
    return JSONResponse(result)

@app.get("/health")
def health(): return {"status": "ok", "whisper": WHISPER_MODEL}

@app.get("/languages")
def languages(): return SUPPORTED_LANGUAGES
