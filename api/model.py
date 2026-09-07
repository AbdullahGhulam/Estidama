"""Loads the selected LightGBM model and turns facility inputs into load profiles.

The model and its feature config live in `CAPSTONE FINAL MODELS/models/`. Nothing
is trained here; this file only prepares feature rows and calls `predict`.
"""

from __future__ import annotations

import calendar
import json
from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]

# The repository ships its own copy of the selected model so it runs standalone.
# The capstone tree is kept as a fallback for working inside the original
# project folder, where these files live outside this directory.
LOCAL_DIR = ROOT / "model"
CAPSTONE_DIR = ROOT.parent / "CAPSTONE FINAL MODELS" / "models"

MODELS_DIR = LOCAL_DIR if (LOCAL_DIR / "feature_config.json").exists() else CAPSTONE_DIR


def _asset(name: str, *fallbacks: Path) -> Path:
    """First existing location for a data file, local copy winning."""
    local = LOCAL_DIR / name
    if local.exists():
        return local
    for candidate in fallbacks:
        if candidate.exists():
            return candidate
    return local

MODEL_FILE = MODELS_DIR / "SELECTED_lightgbm_tuned_mae_objective.pkl"
CONFIG_FILE = MODELS_DIR / "feature_config.json"

CATEGORY_CSV = _asset(
    "building_categories.csv",
    ROOT.parent / "Masar-Dynamics" / "estidama-dashboard" / "data" / "building_categories.csv",
)

# Reported on the held-out test set. See CAPSTONE FINAL MODELS/README.md.
MODEL_SCORES = {
    "mae_kwh": 32.27,
    "rmse_kwh": 92.13,
    "mape_gt5_pct": 34.78,
    "r2": 0.851,
    "test_rows": 2447918,
    "test_buildings": 1429,
    "name": "LightGBM (Optuna-tuned, MAE objective)",
}


@lru_cache(maxsize=1)
def config() -> dict:
    """Feature order and category levels.

    Deliberately independent of the estimator: the category lists drive the
    interface and the web export, and neither of those needs the model in
    memory to be built.
    """
    if not CONFIG_FILE.exists():
        raise FileNotFoundError(f"Feature config not found: {CONFIG_FILE}")
    return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _estimator():
    if not MODEL_FILE.exists():
        raise FileNotFoundError(f"Model not found: {MODEL_FILE}")
    return joblib.load(MODEL_FILE)


METADATA_FILE = _asset(
    "metadata.csv",
    ROOT.parent
    / "Masar-Dynamics"
    / "Capstone"
    / "building-data-genome-project-2"
    / "data"
    / "metadata"
    / "metadata.csv",
)


def _pair_counts() -> pd.DataFrame | None:
    """How many real buildings sit under each type/subtype pair."""
    if not METADATA_FILE.exists():
        return None
    frame = pd.read_csv(METADATA_FILE, low_memory=False)
    columns = ["primaryspaceusage", "sub_primaryspaceusage"]
    if not set(columns).issubset(frame.columns):
        return None
    return frame.dropna(subset=columns).groupby(columns).size().reset_index(name="n")


def _variant_key(label: str) -> str:
    """Fold labels that name the same thing into one key.

    BDG2 carries the same subtype under several spellings: "Data Center" and
    "Data Centre", "Ice Arena" and "Ice arena", "Residence Hall" and the same
    string with a trailing tab. Each one was trained as its own integer code on
    a handful of buildings, so they do not merely look untidy in a dropdown,
    they predict differently. Ice Arena and Ice arena disagree by 91%.
    """
    return " ".join(label.split()).casefold().replace("centre", "center")


def _hidden_variants(levels: list[str], counts) -> set[str]:
    """Variant spellings to keep out of the interface.

    The survivor of each group is the one held by the most real buildings, so
    the offered option is the one the model saw most evidence for. Ties fall to
    whichever appears first in the trained level list, which is stable.
    """
    if counts is None:
        return set()

    per_label = counts.groupby("sub_primaryspaceusage")["n"].sum()

    groups: dict[str, list[str]] = {}
    for label in levels:
        groups.setdefault(_variant_key(label), []).append(label)

    hidden = set()
    for members in groups.values():
        if len(members) < 2:
            continue
        best = max(members, key=lambda name: (int(per_label.get(name, 0)), -levels.index(name)))
        hidden.update(set(members) - {best})
    return hidden


@lru_cache(maxsize=1)
def category_tree() -> dict:
    """Subtypes per facility type, plus the subtype to select by default.

    Lists stay alphabetical because that is what a long dropdown needs to be
    scannable. The default is the subtype held by the most buildings, so
    picking "Healthcare" lands on Hospital rather than whatever sorts first.
    """
    levels = config()["category_levels"]
    known_subs = set(levels["sub_primaryspaceusage"])

    counts = _pair_counts()
    hidden = _hidden_variants(levels["sub_primaryspaceusage"], counts)

    tree: dict[str, list[str]] = {}
    defaults: dict[str, str] = {}

    if counts is not None:
        counts = counts[~counts["sub_primaryspaceusage"].isin(hidden)]
        # Only pairs the model was actually trained on; anything else would be
        # coded as unseen.
        counts = counts[counts["sub_primaryspaceusage"].isin(known_subs)]
        for usage, group in counts.groupby("primaryspaceusage"):
            if usage not in levels["primaryspaceusage"]:
                continue
            tree[usage] = sorted(group["sub_primaryspaceusage"].unique().tolist())
            defaults[usage] = group.sort_values("n", ascending=False).iloc[0][
                "sub_primaryspaceusage"
            ]

    # Fall back to the paired list the Streamlit dashboard already ships.
    if not tree and CATEGORY_CSV.exists():
        pairs = pd.read_csv(CATEGORY_CSV).dropna()
        for usage, group in pairs.groupby("primaryspaceusage"):
            tree[usage] = sorted(group["sub_primaryspaceusage"].unique().tolist())

    # Every trained facility type has to be offerable, even with no pairing.
    for usage in levels["primaryspaceusage"]:
        if not tree.get(usage):
            tree[usage] = [usage] if usage in known_subs else list(known_subs)[:1]
        defaults.setdefault(usage, tree[usage][0])

    return {
        "tree": dict(sorted(tree.items())),
        "defaults": defaults,
        "hidden_variants": sorted(hidden),
    }


def _prepare(frame: pd.DataFrame) -> pd.DataFrame:
    """Raw rows -> model-ready feature matrix, using the training category codes."""
    model_config = config()
    prepared = frame.copy()
    for column, levels in model_config["category_levels"].items():
        prepared[f"{column}_code"] = pd.Categorical(
            prepared[column], categories=levels
        ).codes
    return prepared[model_config["features"]].astype("float32")


def _rows(sqm, usage, sub_usage, hours, day_of_week, month, weather):
    return pd.DataFrame(
        [
            {
                "sqm": sqm,
                "airTemperature": weather["air_temperature"],
                "dewTemperature": weather["dew_temperature"],
                "seaLvlPressure": weather["sea_level_pressure"],
                "windSpeed": weather["wind_speed"],
                "hour": hour,
                "day_of_week": day_of_week,
                "month": month,
                "is_weekend": int(day_of_week >= 5),
                "primaryspaceusage": usage,
                "sub_primaryspaceusage": sub_usage,
            }
            for hour in hours
        ]
    )


def _predict(frame: pd.DataFrame) -> np.ndarray:
    model = _estimator()
    # A building cannot draw negative power; the README recommends clipping.
    return np.clip(model.predict(_prepare(frame)), 0, None)


def _day_profile(sqm, usage, sub_usage, day_of_week, month, weather) -> np.ndarray:
    return _predict(
        _rows(sqm, usage, sub_usage, range(24), day_of_week, month, weather)
    )


def forecast(
    *,
    sqm: float,
    usage: str,
    sub_usage: str,
    month: int,
    day_of_week: int,
    weather: dict,
    monthly_weather: list[dict] | None = None,
    tariff: float,
) -> dict:
    """Hourly profile for the chosen day, plus a twelve-month rollup."""
    hourly = _day_profile(sqm, usage, sub_usage, day_of_week, month, weather)

    # A year is built from one weekday and one weekend profile per month,
    # weighted by how many of each that month actually contains.
    monthly = []
    annual_kwh = 0.0
    for index in range(12):
        month_number = index + 1
        month_weather = (
            monthly_weather[index] if monthly_weather else weather
        )
        weekday = _day_profile(sqm, usage, sub_usage, 2, month_number, month_weather).sum()
        weekend = _day_profile(sqm, usage, sub_usage, 5, month_number, month_weather).sum()

        days = calendar.monthrange(2025, month_number)[1]
        weekend_days = round(days * 2 / 7)
        total = weekday * (days - weekend_days) + weekend * weekend_days

        annual_kwh += total
        monthly.append(
            {
                "month": month_number,
                "kwh": float(total),
                "weekday_kwh": float(weekday),
                "weekend_kwh": float(weekend),
            }
        )

    peak_index = int(np.argmax(hourly))
    daily_total = float(hourly.sum())

    return {
        "hourly": [float(value) for value in hourly],
        "daily_kwh": daily_total,
        "peak_kw": float(hourly[peak_index]),
        "peak_hour": peak_index,
        "base_kw": float(hourly.min()),
        "load_factor": float(hourly.mean() / hourly[peak_index]) if hourly[peak_index] > 0 else 0.0,
        "monthly": monthly,
        "annual_kwh": float(annual_kwh),
        "annual_cost": float(annual_kwh * tariff),
        # Energy use intensity, the standard way to compare buildings of
        # different sizes.
        "eui": float(annual_kwh / sqm) if sqm > 0 else 0.0,
        "uncertainty_kwh": MODEL_SCORES["mae_kwh"],
    }
