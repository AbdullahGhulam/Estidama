"""Monthly climate normals used to pre-fill the weather inputs.

The model has no idea what a city is. It was never given one, and there is no
city feature anywhere in it. What it reads is four numbers: air temperature,
dew point, wind speed and sea level pressure. This file exists only so a user
does not have to know the July dew point of their site before they can get a
first estimate.

So picking a city here does not tell the model "this is Riyadh". It fills in
the four numbers that a typical Riyadh July looks like, and the model responds
to those numbers. A hot dry 36 C day reads the same to it whether that day
happens in Riyadh or anywhere else, which is exactly why the model transfers to
sites it never saw in training.

Values come from `climate_normals.json` when it exists, which `fetch_normals.py`
builds from the Open-Meteo ERA5 archive (2019 to 2023 monthly means). The
hand-written tables below are the fallback for when that file is absent. Either
way every value is editable in the interface.

Each entry is twelve months of: air temperature (degC), dew point (degC), wind
speed (m/s). Sea level pressure stays flat; it barely moves and the model
leans on it very little.

Coverage is deliberately spread across all thirteen administrative regions so
the tool does not look aimed at a handful of cities.
"""

import json
from functools import lru_cache
from pathlib import Path

PRESSURE = 1013.0

_CITIES = {
    # Riyadh Region
    "riyadh": {
        "lat": 24.71,
        "lon": 46.68,
        "label": "Riyadh",
        "region": "Riyadh Region",
        "climate": "Hot, very dry",
        "air": [14, 17, 21, 26, 32, 35, 36, 36, 33, 27, 20, 15],
        "dew": [3, 3, 3, 3, 2, 0, 1, 2, 2, 3, 5, 4],
        "wind": [3.4, 3.7, 3.9, 3.8, 3.6, 4.1, 3.9, 3.6, 3.2, 3.0, 3.2, 3.3],
    },
    # Makkah Region
    "makkah": {
        "lat": 21.39,
        "lon": 39.86,
        "label": "Makkah",
        "region": "Makkah Region",
        "climate": "Very hot inland valley",
        "air": [24, 25, 27, 31, 34, 35, 36, 36, 35, 32, 28, 25],
        "dew": [11, 11, 12, 12, 13, 14, 16, 18, 17, 14, 13, 12],
        "wind": [3.0, 3.1, 3.2, 3.2, 3.1, 3.3, 3.2, 3.0, 2.9, 2.8, 2.9, 3.0],
    },
    "jeddah": {
        "lat": 21.49,
        "lon": 39.19,
        "label": "Jeddah",
        "region": "Makkah Region",
        "climate": "Red Sea coast, hot and humid",
        "air": [24, 24, 26, 28, 30, 31, 33, 33, 31, 29, 27, 25],
        "dew": [16, 16, 17, 18, 20, 22, 23, 24, 23, 21, 19, 17],
        "wind": [3.6, 3.7, 3.8, 3.7, 3.6, 3.8, 3.7, 3.6, 3.4, 3.3, 3.4, 3.5],
    },
    "taif": {
        "lat": 21.27,
        "lon": 40.42,
        "label": "Taif",
        "region": "Makkah Region",
        "climate": "Highland, mild summers",
        "air": [15, 17, 20, 24, 27, 29, 29, 29, 28, 24, 20, 17],
        "dew": [4, 4, 6, 8, 9, 8, 11, 12, 9, 6, 5, 4],
        "wind": [3.2, 3.4, 3.5, 3.4, 3.2, 3.3, 3.2, 3.1, 3.0, 2.9, 3.0, 3.1],
    },
    # Madinah Region
    "madinah": {
        "lat": 24.47,
        "lon": 39.61,
        "label": "Madinah",
        "region": "Madinah Region",
        "climate": "Hot, dry",
        "air": [18, 20, 24, 28, 32, 35, 36, 36, 34, 29, 23, 19],
        "dew": [3, 3, 3, 3, 3, 2, 4, 6, 5, 4, 4, 3],
        "wind": [3.3, 3.6, 3.8, 3.8, 3.7, 3.9, 3.8, 3.5, 3.2, 3.0, 3.1, 3.2],
    },
    "yanbu": {
        "lat": 24.09,
        "lon": 38.06,
        "label": "Yanbu",
        "region": "Madinah Region",
        "climate": "Red Sea coast, industrial",
        "air": [22, 23, 25, 28, 31, 33, 34, 34, 32, 29, 26, 23],
        "dew": [14, 14, 15, 16, 18, 20, 22, 23, 21, 19, 17, 15],
        "wind": [3.8, 3.9, 4.0, 3.9, 3.8, 4.0, 3.9, 3.7, 3.5, 3.4, 3.5, 3.7],
    },
    "alula": {
        "lat": 26.61,
        "lon": 37.92,
        "label": "AlUla",
        "region": "Madinah Region",
        "climate": "Desert, wide day to night swing",
        "air": [13, 15, 19, 24, 29, 32, 33, 33, 30, 25, 19, 14],
        "dew": [2, 2, 2, 2, 1, 0, 2, 3, 3, 3, 3, 2],
        "wind": [3.2, 3.5, 3.7, 3.7, 3.6, 3.7, 3.6, 3.4, 3.1, 3.0, 3.1, 3.2],
    },
    # Eastern Province
    "dammam": {
        "lat": 26.43,
        "lon": 50.1,
        "label": "Dammam",
        "region": "Eastern Province",
        "climate": "Gulf coast, humid summers",
        "air": [15, 17, 21, 26, 32, 34, 36, 36, 33, 28, 22, 17],
        "dew": [8, 9, 11, 13, 15, 18, 21, 22, 20, 16, 12, 9],
        "wind": [4.2, 4.4, 4.5, 4.3, 4.2, 4.6, 4.4, 4.1, 3.7, 3.6, 3.8, 4.0],
    },
    "jubail": {
        "lat": 27.01,
        "lon": 49.66,
        "label": "Jubail",
        "region": "Eastern Province",
        "climate": "Gulf coast, industrial",
        "air": [15, 17, 21, 26, 31, 34, 36, 36, 33, 28, 22, 17],
        "dew": [8, 9, 11, 13, 16, 19, 22, 23, 20, 16, 12, 9],
        "wind": [4.3, 4.5, 4.6, 4.4, 4.3, 4.7, 4.5, 4.2, 3.8, 3.7, 3.9, 4.1],
    },
    "alahsa": {
        "lat": 25.38,
        "lon": 49.59,
        "label": "Al Ahsa",
        "region": "Eastern Province",
        "climate": "Inland, among the hottest",
        "air": [15, 18, 22, 28, 33, 36, 37, 37, 34, 29, 22, 17],
        "dew": [7, 8, 9, 11, 13, 15, 18, 19, 17, 14, 11, 8],
        "wind": [3.6, 3.9, 4.0, 3.9, 3.8, 4.1, 3.9, 3.7, 3.4, 3.2, 3.4, 3.5],
    },
    # Asir
    "abha": {
        "lat": 18.22,
        "lon": 42.51,
        "label": "Abha",
        "region": "Asir",
        "climate": "Highland, mild all year",
        "air": [12, 13, 16, 18, 20, 22, 22, 21, 20, 17, 15, 13],
        "dew": [2, 3, 5, 8, 10, 9, 11, 12, 8, 4, 3, 2],
        "wind": [3.1, 3.3, 3.4, 3.3, 3.1, 3.2, 3.1, 3.0, 2.9, 2.8, 2.9, 3.0],
    },
    "khamis": {
        "lat": 18.31,
        "lon": 42.73,
        "label": "Khamis Mushait",
        "region": "Asir",
        "climate": "Highland, mild all year",
        "air": [13, 14, 17, 19, 21, 23, 23, 22, 21, 18, 16, 14],
        "dew": [2, 3, 5, 8, 10, 9, 11, 12, 8, 5, 3, 2],
        "wind": [3.1, 3.3, 3.4, 3.3, 3.1, 3.2, 3.1, 3.0, 2.9, 2.8, 2.9, 3.0],
    },
    # Jazan
    "jazan": {
        "lat": 16.89,
        "lon": 42.57,
        "label": "Jazan",
        "region": "Jazan",
        "climate": "Coastal, hot and very humid",
        "air": [27, 27, 29, 31, 33, 34, 34, 34, 33, 31, 29, 28],
        "dew": [19, 19, 20, 21, 22, 23, 24, 25, 24, 22, 21, 20],
        "wind": [3.4, 3.5, 3.6, 3.5, 3.4, 3.6, 3.5, 3.4, 3.2, 3.1, 3.2, 3.3],
    },
    # Najran
    "najran": {
        "lat": 17.49,
        "lon": 44.13,
        "label": "Najran",
        "region": "Najran",
        "climate": "Warm, dry, high desert",
        "air": [17, 19, 22, 26, 30, 32, 31, 31, 30, 26, 21, 18],
        "dew": [3, 3, 5, 6, 7, 6, 9, 11, 7, 4, 4, 3],
        "wind": [3.2, 3.4, 3.6, 3.6, 3.5, 3.6, 3.5, 3.3, 3.1, 3.0, 3.1, 3.2],
    },
    # Al Bahah
    "albaha": {
        "lat": 20.01,
        "lon": 41.47,
        "label": "Al Bahah",
        "region": "Al Bahah",
        "climate": "Highland, temperate",
        "air": [14, 15, 18, 21, 24, 26, 26, 25, 24, 21, 18, 15],
        "dew": [3, 4, 6, 8, 10, 9, 11, 12, 8, 5, 4, 3],
        "wind": [3.1, 3.3, 3.4, 3.3, 3.2, 3.3, 3.2, 3.0, 2.9, 2.8, 2.9, 3.0],
    },
    # Qassim
    "buraydah": {
        "lat": 26.33,
        "lon": 43.97,
        "label": "Buraydah",
        "region": "Qassim",
        "climate": "Continental, hot summers, cool winters",
        "air": [12, 15, 19, 25, 31, 34, 35, 35, 32, 26, 19, 14],
        "dew": [2, 2, 2, 3, 2, 0, 1, 2, 2, 3, 4, 3],
        "wind": [3.5, 3.8, 4.0, 3.9, 3.8, 4.1, 3.9, 3.7, 3.3, 3.1, 3.3, 3.4],
    },
    # Hail
    "hail": {
        "lat": 27.52,
        "lon": 41.69,
        "label": "Hail",
        "region": "Hail",
        "climate": "Cool winters, hot dry summers",
        "air": [10, 13, 17, 22, 28, 31, 33, 33, 29, 23, 16, 11],
        "dew": [1, 1, 2, 2, 1, -1, 0, 1, 1, 2, 3, 2],
        "wind": [3.6, 3.9, 4.1, 4.0, 3.9, 4.1, 4.0, 3.8, 3.4, 3.2, 3.4, 3.5],
    },
    # Tabuk
    "tabuk": {
        "lat": 28.38,
        "lon": 36.57,
        "label": "Tabuk",
        "region": "Tabuk",
        "climate": "Northwest, cool winters",
        "air": [12, 14, 18, 22, 27, 30, 32, 32, 29, 24, 18, 13],
        "dew": [2, 2, 2, 2, 2, 1, 3, 4, 3, 3, 3, 2],
        "wind": [3.5, 3.8, 4.0, 4.0, 3.9, 4.0, 3.8, 3.6, 3.3, 3.2, 3.3, 3.4],
    },
    "neom": {
        "lat": 28.0,
        "lon": 35.3,
        "label": "NEOM",
        "region": "Tabuk",
        "climate": "Northwest coast, milder than inland",
        "air": [17, 18, 21, 24, 28, 30, 32, 32, 30, 27, 22, 18],
        "dew": [9, 9, 10, 11, 13, 15, 17, 18, 16, 14, 12, 10],
        "wind": [4.0, 4.2, 4.3, 4.2, 4.1, 4.2, 4.1, 3.9, 3.7, 3.5, 3.7, 3.8],
    },
    # Al Jouf
    "sakaka": {
        "lat": 29.97,
        "lon": 40.21,
        "label": "Sakaka",
        "region": "Al Jouf",
        "climate": "Coldest winters in the country",
        "air": [9, 12, 16, 21, 27, 31, 33, 33, 29, 23, 15, 10],
        "dew": [2, 2, 2, 2, 1, -1, 0, 1, 2, 3, 3, 2],
        "wind": [3.4, 3.7, 3.9, 3.9, 3.8, 3.9, 3.8, 3.6, 3.2, 3.1, 3.2, 3.3],
    },
    # Northern Borders
    "arar": {
        "lat": 30.98,
        "lon": 41.04,
        "label": "Arar",
        "region": "Northern Borders",
        "climate": "Cold winters, hot summers",
        "air": [9, 12, 16, 21, 27, 31, 33, 33, 29, 23, 15, 10],
        "dew": [2, 2, 2, 2, 1, -1, 0, 1, 2, 3, 3, 2],
        "wind": [3.7, 4.0, 4.2, 4.1, 4.0, 4.2, 4.0, 3.8, 3.4, 3.3, 3.4, 3.6],
    },
}


NORMALS_FILE = Path(__file__).resolve().parent / "climate_normals.json"


@lru_cache(maxsize=1)
def _measured() -> tuple[dict, str]:
    """Real monthly normals, if `fetch_normals.py` has been run.

    Falls back to the hand-written values above so the app still works with no
    cache file and no network.
    """
    if not NORMALS_FILE.exists():
        return {}, "approximate reference values"

    try:
        payload = json.loads(NORMALS_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}, "approximate reference values"

    source = f"{payload.get('source', 'measured')}, {payload.get('period', '')}".strip(", ")
    return payload.get("cities", {}), source


def presets() -> list[dict]:
    """City list for the interface, each with its twelve monthly rows."""
    measured, source = _measured()

    entries = []
    for key, city in sorted(_CITIES.items(), key=lambda item: item[1]["label"]):
        rows = measured.get(key)
        if rows and len(rows) == 12:
            months = rows
            basis = source
        else:
            months = [
                {
                    "air_temperature": float(city["air"][i]),
                    "dew_temperature": float(city["dew"][i]),
                    "wind_speed": float(city["wind"][i]),
                    "sea_level_pressure": PRESSURE,
                }
                for i in range(12)
            ]
            basis = "approximate reference values"

        entries.append(
            {
                "id": key,
                "label": city["label"],
                "region": city["region"],
                "climate": city["climate"],
                "lat": city["lat"],
                "lon": city["lon"],
                "basis": basis,
                "months": months,
            }
        )
    return entries
