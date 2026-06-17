"""REST API для Mini App: uvicorn app.api.main:app --reload --port 8000"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ..config import settings
from ..db import init_db
from .routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="PULT API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins + [settings.webapp_url],
    # будь-який домен проєкту на Vercel (прод + усі прев'ю-адреси -<хеш>-...vercel.app)
    allow_origin_regex=r"https://mini-app-tg[a-z0-9-]*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/health")
async def health() -> dict:
    return {"ok": True}
