"""Pull real monthly climate normals from Open-Meteo and cache them to disk.

Run this once. It writes `climate_normals.json`, which `climate.py` prefers over
the rounded values written by hand. Re-run it whenever you add a city.

    python fetch_normals.py

Open-Meteo's historical archive is ERA5 reanalysis. It needs no API key, has no
usage terms that block a student project, and this script makes one request per
city. The result is cached on disk deliberately: a live demo should never depend
on a network call succeeding in the room.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path

import climate

ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"

# Five whole years, ending well clear of the archive's few-day lag.
START = "2019-01-01"
END = "2023-12-31"

OUT = Path(__file__).resolve().parent / "climate_normals.json"


def fetch_city(city: dict) -> list[dict] | None:
    query = (
        f"{ARCHIVE}?latitude={city['lat']}&longitude={city['lon']}"
        f"&start_date={START}&end_date={END}"
        "&daily=temperature_2m_mean,dew_point_2m_mean,wind_speed_10m_mean,pressure_msl_mean"
        "&timezone=auto"
    )

    # Open-Meteo rate limits per minute as well as per day, so back off and
    # retry rather than dropping the city.
    payload = None
    for attempt in range(5):
        try:
            with urllib.request.urlopen(query, timeout=60) as response:
                payload = json.load(response)
            break
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            wait = 20 * (attempt + 1)
            print(f"  {type(error).__name__} ({error}); retrying in {wait}s")
            time.sleep(wait)

    if payload is None:
        print("  failed after 5 attempts")
        return None

    daily = payload.get("daily")
    if not daily or "time" not in daily:
        print("  failed: unexpected response shape")
        return None

    buckets = defaultdict(lambda: defaultdict(list))
    for index, stamp in enumerate(daily["time"]):
        month = int(stamp[5:7])
        for source, target in (
            ("temperature_2m_mean", "air_temperature"),
            ("dew_point_2m_mean", "dew_temperature"),
            ("wind_speed_10m_mean", "wind_speed"),
            ("pressure_msl_mean", "sea_level_pressure"),
        ):
            value = daily.get(source, [None] * len(daily["time"]))[index]
            if value is not None:
                buckets[month][target].append(value)

    months = []
    for month in range(1, 13):
        values = buckets.get(month)
        if not values or not values.get("air_temperature"):
            print(f"  failed: month {month} has no data")
            return None

        def mean(field, fallback):
            series = values.get(field) or []
            return round(sum(series) / len(series), 1) if series else fallback

        # Open-Meteo reports wind at 10 m in km/h; the model was trained on m/s.
        wind_kmh = mean("wind_speed", 12.0)

        months.append(
            {
                "air_temperature": mean("air_temperature", 25.0),
                "dew_temperature": mean("dew_temperature", 5.0),
                "wind_speed": round(wind_kmh / 3.6, 1),
                "sea_level_pressure": mean("sea_level_pressure", climate.PRESSURE),
            }
        )
    return months


def main() -> None:
    cities = climate._CITIES

    # Resume: keep whatever a previous run already fetched.
    normals: dict[str, list[dict]] = {}
    if OUT.exists():
        normals = json.loads(OUT.read_text(encoding="utf-8")).get("cities", {})
        print(f"Resuming with {len(normals)} cities already cached.\n")

    for index, (key, city) in enumerate(cities.items(), 1):
        if key in normals:
            continue
        print(f"[{index}/{len(cities)}] {city['label']} ...", flush=True)
        months = fetch_city(city)
        if months:
            normals[key] = months
            july = months[6]
            print(
                f"  July mean {july['air_temperature']} C, "
                f"dew {july['dew_temperature']} C, wind {july['wind_speed']} m/s"
            )
        time.sleep(8)  # well inside Open-Meteo's per-minute limit

    if not normals:
        print("\nNothing fetched. Keeping the existing values.")
        return

    OUT.write_text(
        json.dumps(
            {
                "source": "Open-Meteo ERA5 archive",
                "period": f"{START} to {END}",
                "note": "Monthly means. Wind converted from km/h to m/s.",
                "cities": normals,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"\nWrote {OUT.name} with {len(normals)} of {len(cities)} cities.")


if __name__ == "__main__":
    main()
