# Estidama

Estimates what a facility will cost to run in electricity, before it is built.

Describe the building (what it is for, how big, where it stands) and get its hourly demand curve,
a month by month breakdown, the annual kWh, and the annual bill.

**Live: https://abdullahghulam.github.io/Estidama/**

The published site needs no server. The model runs in the visitor's browser.

## What is inside

```
model/    the selected LightGBM model and its feature config
web/      the interface (React + Vite), and the model exported to run in-browser
api/      the same model behind FastAPI, for local development
```

## Running it locally

The interface alone is enough, and needs nothing else:

```bash
cd web && npm install && npm run dev
```

Open http://localhost:5173.

To run the Python service as well (only needed when changing the model code):

```bash
cd api && pip install -r requirements.txt && python -m uvicorn main:app --port 8000
```

Then start the interface with `VITE_API=1 npm run dev` to make it call the service instead of
predicting in the browser.

## The model

LightGBM, Optuna-tuned, trained with an L1 (MAE) objective on the Building Data Genome Project 2:
2.45 million hourly electricity readings from 1,429 real metered buildings.

| Metric | Held-out test set |
|---|---|
| MAE | 32.27 kWh |
| RMSE | 92.13 kWh |
| R² | 0.851 |

It predicts from building characteristics only (area, use, hour, month, weather). Building
identity is deliberately not a feature, which is the only reason it can say anything about a
facility that does not exist yet.

Results are a planning estimate, not a guaranteed bill. Actual consumption also depends on
equipment, occupancy and operating hours, which are not inputs here.

## Weather

Monthly normals for 21 Saudi cities across all 13 regions, from the Open-Meteo ERA5 archive
(2019 to 2023), cached in `web/public/model/bundle.json` so nothing depends on a network call at
demo time. Every value is editable in the interface. Refresh with `python api/fetch_normals.py`.

Engineering notes, design decisions and known model behaviour are in [NOTES.md](NOTES.md).
