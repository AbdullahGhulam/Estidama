# Estidama — web interface

A single-page interface over the final forecasting model
(`CAPSTONE FINAL MODELS/models/SELECTED_lightgbm_tuned_mae_objective.pkl`).

Describe a facility that does not exist yet and get its hourly electricity demand, a twelve-month
rollup, and the annual cost. Everything recalculates as you type — there is no submit button.

This replaces nothing. The Streamlit dashboard in `Masar-Dynamics/estidama-dashboard/` still runs
and is untouched.

```
estidama-web/
  api/          FastAPI service that loads the model and returns forecasts
  web/          Vite + React interface
```

## Running it

Two processes. Backend first.

```bash
cd "estidama-web/api" && pip install -r requirements.txt && python -m uvicorn main:app --port 8000 --reload
```

```bash
cd "estidama-web/web" && npm install && npm run dev
```

Then open http://localhost:5173. Vite proxies `/api` to port 8000, so both must be up.

Model files are read from `../../CAPSTONE FINAL MODELS/models/`, relative to `api/`. Nothing is
copied or duplicated; move this folder and the paths in `api/model.py` need updating.

## The API

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Forces the model to load, so a bad path fails loudly at startup |
| `GET /api/meta` | Facility types, subtypes per type, the default subtype per type, climate presets, model scores |
| `POST /api/forecast` | The forecast |

`POST /api/forecast` takes `sqm`, `usage`, `sub_usage`, `month`, `day_of_week`, `tariff`, a
`weather` object, and an optional `monthly_weather` array of twelve. It returns the 24 hourly
values, peak and base load, load factor, the twelve monthly totals, the annual kWh and cost, and
energy use intensity.

## How the numbers are produced

- **Hourly curve** — 24 rows through the model, one per hour, for the selected month and day type.
  Predictions are clipped at zero, as the model README recommends.
- **Annual total** — for each of the twelve months, one weekday profile and one weekend profile,
  weighted by how many of each that month actually contains. 288 predictions per request, which is
  fast enough to run on every keystroke.
- **Intensity (EUI)** — annual kWh divided by floor area. The standard way to compare buildings of
  different sizes.
- **Cost** — annual kWh times the tariff field, which defaults to 0.18 SAR/kWh and is editable.
  That default is a placeholder, not a quoted rate.

## Inputs

Every field can be typed into or picked from a list. The facility type and subtype comboboxes
filter as you type but only accept values from the list, because the model codes anything else as
"unseen" and the prediction quietly degrades.

Selecting a facility type picks the subtype held by the most real buildings in the project
metadata — Healthcare lands on Hospital, not on whatever sorts first alphabetically.

Floor area has a logarithmic slider alongside the number field. Facilities run from a few hundred
to a few hundred thousand square metres, and on a linear track everything normal would sit in the
first fifth.

### About the location field

The model has no city feature. It never had one. It reads four numbers: air temperature, dew
point, wind speed and sea level pressure. The location dropdown does nothing except fill those
four numbers in, per month.

This is why the tool works for Saudi sites at all despite being trained on the Building Data
Genome Project 2, which contains no Saudi buildings. A hot dry 36 C day with a 1 C dew point reads
the same to the model wherever it happens. It is the physics that transfers, not the place name.
Feeding Jeddah's weather to a building labelled Riyadh returns Jeddah's answer exactly.

`api/climate.py` covers 21 cities across all 13 administrative regions. Values come from
`api/climate_normals.json`, built by `api/fetch_normals.py` from the **Open-Meteo ERA5 archive**,
monthly means over 2019 to 2023. No API key, no rate limit that matters at this size, and the
result is cached to disk on purpose: a live demo must never depend on a network call succeeding in
the room. The hand-written tables in `climate.py` remain as the fallback if that file is missing.

To add a city: add an entry to `_CITIES` with `lat`, `lon`, `label`, `region`, `climate`, then run
`python fetch_normals.py`. It resumes, so it only fetches what is missing.

One simplification: a single temperature is used for all 24 hours of a day, so the day to night
swing is flattened. Adding a diurnal curve would sharpen the afternoon peak, at the cost of one
more assumed value.

### Temperature does not always move cost upward, and that is the model

Raising air temperature above roughly 20 C raises predicted consumption, as cooling load should.
Below that it does the opposite: for a 5,000 sqm office, going from 16 C to 18 C in January
*lowers* predicted use by about 7%.

That is not a bug in this app. It is a U shape the model learned from BDG2, which is dominated by
North American and European buildings where cold weather means electric heating. The left arm of
that U does not apply to Saudi buildings, which essentially never heat with electricity.

Two other things worth knowing before someone demos this:

- LightGBM is piecewise constant. Between split points, small edits change nothing at all. From
  34 C to 38 C in July the prediction does not move by a single kWh.
- The fix, if it is wanted, is to retrain with `monotone_constraints` set to +1 on
  `airTemperature`. That changes the selected model, so it is a decision for the team, not a
  patch to make here.

## What the interface says about accuracy

The page presents the result as a planning estimate and says so in two places: under the result
("A planning estimate. Actual consumption also depends on equipment, occupancy and operating
hours") and at the end of the glossary ("Figures are an estimate for planning and comparison, not
a guaranteed bill").

Model metrics are deliberately not shown to visitors. A number like R2 0.851 or "76.4% better than
baseline" raises questions a landing page cannot answer (better than which baseline, is 0.85 good)
and does not help someone decide anything. They stay in
`CAPSTONE FINAL MODELS/README.md`, which is the right place for them.

The limits from the model README still hold and matter internally:

- The test split is chronological, not by building. All 1,429 test buildings also appear in
  training, so the reported accuracy measures a future period of known buildings.
- Accuracy on a genuinely new building is untested and would likely be worse.
- Typical error on one hourly reading is 32.27 kWh (MAE on the held-out test set).

Do not put growth claims on the page that these numbers cannot support.

## Theming

Dark and light, toggled in the top bar and remembered per browser in `localStorage`. The choice is
written to the root element as `data-theme`.

**Every colour must come from a token.** `styles.css` defines the full set on `:root` and
redefines them under `:root[data-theme='light']`; no rule below the palette blocks may contain a
literal colour. Hard-coding one is exactly how the dropdown menus stayed black in light mode: they
carried `rgba(6, 15, 16, 0.97)` directly, so the theme could not reach them. The tokens that exist
for this are `--field-bg`, `--menu-bg`, `--track`, `--hint`, `--accent-soft`, `--accent-tint`,
`--accent-tint-strong`, `--accent-glow`, `--curve-glow`, `--signal-fade`, `--cool-fade`,
`--warm-line` and the three `--alert-*`.

The WebGL field needs its own treatment per theme, not just a flag. Its light path composites ink
on white and is much weaker than the dark path, which adds glow to black, so light mode gets a
darker ink colour, an extra layer, fatter fibers and far less vignette (see `fieldStyle` in
`App.jsx`). The `.backdrop::after` veil also has to drop from 0.72 to 0.18, or it erases the field
entirely.

The logo in `components/Mark.jsx` is drawn from `--mark-back` and `--mark-front`, which swap which
arm carries the dark value. It never depends on navy reading against a dark ground.

Light-mode contrast was measured, not eyeballed: body text 7.4:1, muted text 5.4:1, accent text
5.5:1, the pale arm of the logo 3.6:1 against the page.

## Notes

- The WebGL background is `GhostFibers` from React Bits (`ogl`), retuned to the project's
  teal-green. Its speed and glow scale with the predicted energy intensity, so a heavier building
  drives the field harder. It pauses itself when scrolled out of view, when the tab is hidden, and
  when the visitor has asked for reduced motion.
- `web/src/lib/animation.js` keys its effects off array **contents**, not identity. Callers build
  their arrays inline, so keying off identity restarts the animation every frame — the frame loop
  never stops and the values never arrive.
- Requests are debounced 200 ms and the previous one is aborted, so dragging the slider does not
  queue up work.
