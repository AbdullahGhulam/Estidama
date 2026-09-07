"""HTTP layer for the Estidama forecasting interface."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import climate
import model

app = FastAPI(title="Estidama forecasting API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class Weather(BaseModel):
    air_temperature: float = 20.0
    dew_temperature: float = 10.0
    sea_level_pressure: float = 1013.0
    wind_speed: float = 3.0


class ForecastRequest(BaseModel):
    sqm: float = Field(gt=0, le=2_000_000)
    usage: str
    sub_usage: str
    month: int = Field(ge=1, le=12)
    day_of_week: int = Field(ge=0, le=6)
    tariff: float = Field(default=0.18, ge=0, le=10)
    weather: Weather = Weather()
    # Twelve months of weather for the annual rollup. Falls back to `weather`.
    monthly_weather: list[Weather] | None = None


@app.get("/api/meta")
def meta():
    """Everything the interface needs to build its inputs."""
    levels = model.config()["category_levels"]
    categories = model.category_tree()
    return {
        "usages": levels["primaryspaceusage"],
        "sub_usages": levels["sub_primaryspaceusage"],
        "tree": categories["tree"],
        "defaults": categories["defaults"],
        "climate": climate.presets(),
        "scores": model.MODEL_SCORES,
    }


@app.post("/api/forecast")
def forecast(request: ForecastRequest):
    if request.monthly_weather is not None and len(request.monthly_weather) != 12:
        raise HTTPException(422, "monthly_weather must hold exactly 12 entries")

    return model.forecast(
        sqm=request.sqm,
        usage=request.usage,
        sub_usage=request.sub_usage,
        month=request.month,
        day_of_week=request.day_of_week,
        weather=request.weather.model_dump(),
        monthly_weather=(
            [w.model_dump() for w in request.monthly_weather]
            if request.monthly_weather
            else None
        ),
        tariff=request.tariff,
    )


@app.get("/api/health")
def health():
    model.config()  # forces the model to load, so a broken path fails loudly
    return {"status": "ok", "model": model.MODEL_SCORES["name"]}
