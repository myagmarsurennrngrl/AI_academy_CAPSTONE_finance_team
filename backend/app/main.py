"""FastAPI application entrypoint. Route logic lives in app/api/routes/;
business logic lives in app/services/ - this file only wires them together."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import analysis, upload
from app.config import get_settings

settings = get_settings()

app = FastAPI(
    title="Sales Driver Intelligence API",
    description="Excel-driven sales driver analysis: deterministic KPIs + Claude/OpenAI insight generation.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router)
app.include_router(analysis.router)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "mock_ai": settings.use_mock_ai,
        "anthropic_model": settings.anthropic_model,
        "openai_model": settings.openai_model,
    }
