# 🎤 VoiceCore — Multilingual Voice Assistant

> **Masimbonge Portfolio — Project 04**
> Voice AI · Multilingual · Real-time

Speak into your browser, get an intelligent spoken response back. Auto-detects your language, processes with Claude AI, synthesises voice with ElevenLabs. Supports 10 languages with live waveform visualisation.

---

## Architecture

```
Browser mic → WebAudio API (waveform viz)
      ↓
MediaRecorder (WebM audio)
      ↓
WebSocket → FastAPI backend
      ↓
Whisper ASR → text + language detection
      ↓
Claude AI → intelligent response text
      ↓
ElevenLabs TTS → MP3 audio bytes
      ↓
WebSocket → browser plays audio
```

---

## Supported Languages
English · Spanish · French · German · Portuguese · Italian · Dutch · Chinese · Japanese · Korean

---

## Folder Structure

```
project4-voice-assistant/
├── frontend/
│   └── src/components/
│       └── VoiceAssistant.tsx   # Full UI — edit colours, layout, URLs
├── backend/
│   ├── app/
│   │   └── main.py              # FastAPI + WebSocket — edit model, voice, prompt
│   └── requirements.txt
└── docker/
    └── docker-compose.yml       # Run everything at once
```

---

## Quick Start

### Prerequisites
- Node.js 20 LTS
- Python 3.11+
- FFmpeg (required by Whisper)
- Accounts: Anthropic + ElevenLabs

### Install FFmpeg

**Mac:**
```bash
brew install ffmpeg
```
**Windows:**
1. Download from https://ffmpeg.org/download.html
2. Extract the zip
3. Add the `bin` folder to your system PATH

### Steps

```bash
# 1. Clone
git clone https://github.com/masimbonge/voicecore
cd voicecore

# ── Backend ──
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env: add your ANTHROPIC_API_KEY and ELEVENLABS_API_KEY
uvicorn app.main:app --reload --port 8000

# ── Frontend (new terminal) ──
cd frontend
npm install
# Edit .env.local: NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws/voice
npm run dev
# Open http://localhost:3000 — click Allow microphone when prompted
```

### Or run everything with Docker:

```bash
cp .env.example .env   # fill in your keys
docker-compose -f docker/docker-compose.yml up --build
```

---

## Environment Variables

| Variable | Where to get |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `ELEVENLABS_API_KEY` | elevenlabs.io → Profile |
| `ELEVENLABS_VOICE_ID` | ElevenLabs voice library (optional) |
| `WHISPER_MODEL` | `tiny` (fastest) to `large` (best accuracy) |

---

## ElevenLabs Voice IDs
Find voice IDs at https://api.elevenlabs.io/v1/voices or in the ElevenLabs dashboard.

---

## What you'll demonstrate
- WebSocket real-time bidirectional communication
- OpenAI Whisper local ASR with language detection
- Claude AI for conversational intelligence
- ElevenLabs multilingual speech synthesis
- WebAudio API for live waveform visualisation
- Full-stack Docker deployment

---

*Built by Masimbonge*
