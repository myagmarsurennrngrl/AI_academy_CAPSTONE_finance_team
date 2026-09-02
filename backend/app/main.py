"""FastAPI application entrypoint. Route logic lives in app/api/routes/;
business logic lives in app/services/ - this file only wires them together."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import analysis, auth, dataset, forecast, upload
from app.config import get_settings
from app.services.auth_service import bootstrap_admin

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    bootstrap_admin()  # first administrator from ADMIN_USERNAME / ADMIN_PASSWORD
    yield


app = FastAPI(
    lifespan=lifespan,
    title="Densmaa 1.0 API",
    description="Densmaa 1.0 - Excel-driven sales driver analysis and forecasting: deterministic KPIs, backtested forecasts, Claude/OpenAI insight generation.",
    version="3.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(upload.router)
app.include_router(dataset.router)
app.include_router(analysis.router)
app.include_router(forecast.router)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "auth_required": not settings.auth_disabled,
        "mock_ai": settings.use_mock_ai,
        "anthropic_model": settings.anthropic_model,
        "openai_model": settings.openai_model,
    }
