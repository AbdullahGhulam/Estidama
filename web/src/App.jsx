import { useEffect, useMemo, useRef, useState } from 'react';

import Combobox from './components/Combobox';
import GhostFibers from './components/GhostFibers';
import LoadCurve from './components/LoadCurve';
import Mark from './components/Mark';
import MonthlyBars from './components/MonthlyBars';
import ThemeToggle from './components/ThemeToggle';
import { NumberField, Slider } from './components/Field';
import { getForecast, getMeta } from './lib/api';
import { useAnimatedNumber } from './lib/animation';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

// Tuesday stands in for a working day, Saturday for a weekend one.
const WEEKDAY = 2;
const WEEKEND = 5;

const compact = value =>
  value >= 1e6
    ? `${(value / 1e6).toFixed(2)}M`
    : value >= 1e3
      ? `${(value / 1e3).toFixed(value >= 1e5 ? 0 : 1)}k`
      : value.toFixed(0);

function Readout({ value, unit, caption, format = compact }) {
  const eased = useAnimatedNumber(value);
  return (
    <div className="readout">
      <div className="readout-value">
        <span className="readout-number">{format(eased)}</span>
        <span className="readout-unit">{unit}</span>
      </div>
      <div className="readout-caption">{caption}</div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export default function App() {
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);

  const [usage, setUsage] = useState('Office');
  const [subUsage, setSubUsage] = useState('Office');
  const [sqm, setSqm] = useState(5000);
  const [month, setMonth] = useState(7);
  const [dayType, setDayType] = useState(WEEKDAY);
  const [cityId, setCityId] = useState('riyadh');
  const [tariff, setTariff] = useState(0.18);
  const [weatherOverride, setWeatherOverride] = useState(null);
  const [showClimate, setShowClimate] = useState(false);

  const [result, setResult] = useState(null);
  const [pending, setPending] = useState(true);
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    getMeta().then(setMeta).catch(err => setError(err.message));
  }, []);

  const city = useMemo(
    () => meta?.climate.find(entry => entry.id === cityId) ?? null,
    [meta, cityId]
  );

  // Weather for the selected month: the city normals, unless the user edited them.
  const weather = useMemo(() => {
    if (weatherOverride) return weatherOverride;
    return (
      city?.months[month - 1] ?? {
        air_temperature: 20,
        dew_temperature: 10,
        sea_level_pressure: 1013,
        wind_speed: 3
      }
    );
  }, [city, month, weatherOverride]);

  // The annual rollup uses each month's own normals, so summer and winter differ.
  const monthlyWeather = useMemo(() => {
    if (!city) return null;
    if (!weatherOverride) return city.months;
    // An edited month is applied as an offset across the whole year, keeping
    // the seasonal shape the city preset provides.
    const base = city.months[month - 1];
    const shift = {
      air_temperature: weatherOverride.air_temperature - base.air_temperature,
      dew_temperature: weatherOverride.dew_temperature - base.dew_temperature,
      wind_speed: weatherOverride.wind_speed - base.wind_speed
    };
    return city.months.map(entry => ({
      air_temperature: entry.air_temperature + shift.air_temperature,
      dew_temperature: entry.dew_temperature + shift.dew_temperature,
      wind_speed: Math.max(0, entry.wind_speed + shift.wind_speed),
      sea_level_pressure: weatherOverride.sea_level_pressure
    }));
  }, [city, month, weatherOverride]);

  const subOptions = useMemo(() => {
    if (!meta) return [];
    const scoped = meta.tree[usage] ?? [];
    return scoped.length ? scoped : meta.sub_usages;
  }, [meta, usage]);

  // Keep the subtype consistent with the type. The fallback is the subtype
  // held by the most real buildings, not whatever happens to sort first.
  useEffect(() => {
    if (!meta) return;
    if (subOptions.includes(subUsage)) return;
    const preferred = meta.defaults?.[usage];
    setSubUsage(subOptions.includes(preferred) ? preferred : (subOptions[0] ?? ''));
  }, [meta, usage, subOptions, subUsage]);

  // Switching city drops any manual climate edits; they belonged to the old city.
  useEffect(() => {
    setWeatherOverride(null);
  }, [cityId]);

  const abortRef = useRef(null);

  useEffect(() => {
    if (!meta || !usage || !subUsage || !(sqm > 0)) return;

    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setPending(true);

      getForecast(
        {
          sqm,
          usage,
          sub_usage: subUsage,
          month,
          day_of_week: dayType,
          tariff,
          weather,
          monthly_weather: monthlyWeather
        },
        controller.signal
      )
        .then(data => {
          setResult(data);
          setError(null);
        })
        .catch(err => {
          if (err.name !== 'AbortError') setError(err.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setPending(false);
        });
    }, 200);

    return () => clearTimeout(timer);
  }, [meta, sqm, usage, subUsage, month, dayType, tariff, weather, monthlyWeather]);

  // The field reacts to the building: a heavier consumer drives it harder.
  const intensity = result ? Math.min(result.eui / 260, 1.4) : 0.4;

  const light = theme === 'light';

  // Light mode is a different compositing path in the shader: it lays ink on
  // white rather than adding glow to black, and that path is far weaker. It
  // needs a darker ink, fatter fibers, an extra layer and much less vignette,
  // or the field is invisible against the page.
  const fieldStyle = light
    ? {
        lineColor: '#02241F',
        glowColor: '#08525F',
        layers: 6,
        lineSharpness: 6,
        vignette: 0.22,
        grain: 0.012
      }
    : {
        lineColor: '#0C4038',
        glowColor: '#1B6C7C',
        layers: 4,
        lineSharpness: 11,
        vignette: 0.92,
        grain: 0.045
      };

  const editClimate = patch =>
    setWeatherOverride({ ...weather, ...patch });

  return (
    <div className="page">
      <div className="backdrop" aria-hidden="true">
        <GhostFibers
          {...fieldStyle}
          lightMode={light}
          speed={0.12 + intensity * 0.1}
          scale={2.6}
          rotation={-14}
          rotationSpeed={0.045}
          waveAmplitude={0.018}
          waveFrequency={2.6}
          waveSpeed={0.14}
          layerSpeed={0.07}
          twist={0.09}
          twistFrequency={4.5}
          twistSpeed={1.1}
          lineFrequency={4.5}
          lineSpacing={1}
          glowFalloff={11}
          glowIntensity={1.05 + intensity * 0.75}
          brightness={1.75}
          blueBoost={1.06}
          dpr={1}
        />
      </div>

      <header className="topbar">
        <a className="wordmark" href="#top">
          <Mark />
          <span className="wordmark-latin">Estidama</span>
          <span className="wordmark-arabic" lang="ar">
            استدامة
          </span>
        </a>
        <div className="topbar-meta">
          <ThemeToggle onChange={setTheme} />
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <p className="eyebrow">Electricity OPEX forecasting</p>
          <h1 className="hero-title">
            What will this
            <br />
            building cost to run?
          </h1>
          <p className="hero-lede">
            Every building carries two costs. The one to build it, and the one to keep it running
            for the next thirty years. The second is called OPEX, and electricity is its largest
            and least predictable part.
          </p>
          <p className="hero-lede">
            Estidama estimates that number before a single wall goes up. Tell it what the facility
            is for, how large it is and where it stands. You get the electricity it will draw hour
            by hour, month by month, and what that comes to in riyals per year.
          </p>

          <p className="hero-note">
            Built on 2.45 million hourly electricity readings from real, metered buildings.
          </p>
        </section>

        <section className="console" id="estimate">
          <div className="panel panel-form">
            <header className="panel-head">
              <h2>The facility</h2>
              <p>Every field is typeable or selectable. Results update as you go.</p>
            </header>

            {error && <p className="alert">{error}</p>}
            {!meta && !error && <p className="alert alert-quiet">Loading the model…</p>}

            {meta && (
              <div className="form">
                <div className="row row-2">
                  <Combobox
                    label="Facility type"
                    value={usage}
                    options={meta.usages}
                    onChange={setUsage}
                  />
                  <Combobox
                    label="Subtype"
                    value={subUsage}
                    options={subOptions}
                    onChange={setSubUsage}
                  />
                </div>

                <div className="row">
                  <NumberField
                    label="Floor area"
                    unit="m²"
                    value={sqm}
                    min={50}
                    max={500000}
                    step={100}
                    onChange={setSqm}
                  />
                  <Slider
                    value={sqm}
                    min={100}
                    max={200000}
                    onChange={setSqm}
                    marks={[100, 1000, 10000, 100000]}
                  />
                </div>

                <div className="row row-2">
                  <Combobox
                    label="Location"
                    hint={city?.region}
                    value={city?.label ?? ''}
                    options={meta.climate.map(entry => entry.label)}
                    onChange={label =>
                      setCityId(meta.climate.find(entry => entry.label === label)?.id ?? cityId)
                    }
                  />
                  <Combobox
                    label="Month"
                    value={MONTH_NAMES[month - 1]}
                    options={MONTH_NAMES}
                    onChange={name => setMonth(MONTH_NAMES.indexOf(name) + 1)}
                  />
                </div>

                <div className="row">
                  <NumberField
                    label="Tariff"
                    hint="editable"
                    unit="SAR / kWh"
                    value={tariff}
                    min={0}
                    max={5}
                    step={0.01}
                    onChange={setTariff}
                  />
                </div>

                <div className="disclosure">
                  <button
                    type="button"
                    className="disclosure-toggle"
                    aria-expanded={showClimate}
                    onClick={() => setShowClimate(open => !open)}
                  >
                    <span className={`disclosure-chevron${showClimate ? ' is-open' : ''}`}>›</span>
                    Weather for {MONTH_NAMES[month - 1]}
                    <span className="disclosure-summary">
                      {weather.air_temperature.toFixed(0)}°C · dew{' '}
                      {weather.dew_temperature.toFixed(0)}°C · {weather.wind_speed.toFixed(1)} m/s
                      {weatherOverride && <em> edited</em>}
                    </span>
                  </button>

                  {showClimate && (
                    <div className="disclosure-body">
                      <p className="disclosure-note">
                        {city?.climate}. These four numbers are the only thing the location
                        changes: the model reads weather, not place names, so picking{' '}
                        {city?.label} simply fills in what a typical {MONTH_NAMES[month - 1]} there
                        looks like. They are approximate reference values, not measurements.
                        Override any of them with real site data.
                      </p>
                      <div className="row row-2">
                        <NumberField
                          label="Air temperature"
                          unit="°C"
                          value={weather.air_temperature}
                          min={-40}
                          max={60}
                          step={0.5}
                          onChange={value => editClimate({ air_temperature: value })}
                        />
                        <NumberField
                          label="Dew point"
                          unit="°C"
                          value={weather.dew_temperature}
                          min={-40}
                          max={40}
                          step={0.5}
                          onChange={value => editClimate({ dew_temperature: value })}
                        />
                      </div>
                      <div className="row row-2">
                        <NumberField
                          label="Wind speed"
                          unit="m/s"
                          value={weather.wind_speed}
                          min={0}
                          max={40}
                          step={0.1}
                          onChange={value => editClimate({ wind_speed: value })}
                        />
                        <NumberField
                          label="Sea level pressure"
                          unit="hPa"
                          value={weather.sea_level_pressure}
                          min={950}
                          max={1070}
                          step={1}
                          onChange={value => editClimate({ sea_level_pressure: value })}
                        />
                      </div>
                      {weatherOverride && (
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => setWeatherOverride(null)}
                        >
                          Reset to {city?.label} normals
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className={`panel panel-result${pending ? ' is-pending' : ''}`}>
            {result ? (
              <>
                <div className="readouts">
                  <Readout value={result.annual_kwh} unit="kWh" caption="Electricity per year" />
                  <Readout value={result.annual_cost} unit="SAR" caption="Cost per year" />
                </div>

                <p className="scope-note">
                  The yearly figures above cover a full calendar year, every weekday and every
                  weekend, in the real proportion each month contains. The curve below is one
                  representative {dayType === WEEKDAY ? 'weekday' : 'weekend day'} in{' '}
                  {MONTH_NAMES[month - 1]}.
                </p>

                <LoadCurve
                  hourly={result.hourly}
                  peakHour={result.peak_hour}
                  month={MONTH_NAMES[month - 1]}
                  dayType={dayType}
                  onDayType={setDayType}
                  weekday={WEEKDAY}
                  weekend={WEEKEND}
                />

                <dl className="stats">
                  <Stat
                    label="Peak demand"
                    value={`${result.peak_kw.toFixed(0)} kWh @ ${String(result.peak_hour).padStart(2, '0')}:00`}
                  />
                  <Stat label="Base load" value={`${result.base_kw.toFixed(0)} kWh`} />
                  <Stat label="Load factor" value={result.load_factor.toFixed(2)} />
                  <Stat label="Intensity" value={`${result.eui.toFixed(0)} kWh/m²·yr`} />
                </dl>

                <MonthlyBars monthly={result.monthly} selected={month} onSelect={setMonth} />

                <p className="uncertainty">
                  A planning estimate. Actual consumption also depends on equipment, occupancy and
                  operating hours, which are not part of this calculation.
                </p>
              </>
            ) : (
              <div className="panel-empty">Waiting for the first estimate…</div>
            )}
          </div>
        </section>

        <section className="notes">
          <h2 className="notes-title">Reading the results</h2>
          <p className="notes-lede">
            The panel above reports a building in the terms a facilities or finance team would use.
            Here is what each one means.
          </p>

          <dl className="glossary">
            <div>
              <dt>OPEX</dt>
              <dd>
                Operating expenditure. What a building costs to keep running once it opens, as
                opposed to CAPEX, which is what it costs to build. Electricity is usually the
                largest line in it.
              </dd>
            </div>
            <div>
              <dt>Hourly demand</dt>
              <dd>
                The electricity the building draws in one hour, in kilowatt hours. The curve shows
                a full day, so you can see when the building wakes up and when it settles.
              </dd>
            </div>
            <div>
              <dt>Peak demand</dt>
              <dd>
                The heaviest hour of the day. This is the figure that drives the capacity you have
                to contract and the size of the equipment you have to buy.
              </dd>
            </div>
            <div>
              <dt>Base load</dt>
              <dd>
                The lightest hour. What the building still draws when nobody is in it, for cooling,
                servers, refrigeration, lifts and safety lighting. It never reaches zero.
              </dd>
            </div>
            <div>
              <dt>Load factor</dt>
              <dd>
                Average demand divided by peak demand. The closer to 1, the steadier the building.
                A low number means you are paying for capacity you rarely use.
              </dd>
            </div>
            <div>
              <dt>Intensity (EUI)</dt>
              <dd>
                Annual kilowatt hours per square metre. It cancels out size, so a small clinic and
                a large hospital can be compared on equal terms.
              </dd>
            </div>
          </dl>

          <p className="notes-footnote">
            Figures are an estimate for planning and comparison, not a guaranteed bill.
          </p>
        </section>

      </main>

      <footer className="footer">
        <span>Estidama · Masar Dynamics</span>
        <span className="footer-model">Electricity OPEX forecasting for facilities</span>
      </footer>
    </div>
  );
}
