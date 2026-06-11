"""Голос → текст через OpenAI Whisper. Повертає None, якщо STT недоступний."""

import logging

from openai import AsyncOpenAI

from ..config import settings

log = logging.getLogger(__name__)


async def transcribe(audio_bytes: bytes, filename: str = "voice.ogg") -> str | None:
    if not settings.openai_api_key:
        return None
    try:
        client = AsyncOpenAI(api_key=settings.openai_api_key)
        result = await client.audio.transcriptions.create(
            model="whisper-1",
            file=(filename, audio_bytes),
        )
        return result.text
    except Exception:
        log.exception("Whisper transcription failed")
        return None
