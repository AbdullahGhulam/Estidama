/**
 * The forecast, run in the visitor's browser.
 *
 * This is a direct port of `api/model.py`: same feature order, same category
 * coding, same clipping at zero, same twelve-month rollup. The FastAPI service
 * is still in the repo and still correct; this exists so the published site
 * needs no server at all.
 *
 * The model is the same model, not an approximation. `export_web_model.py`
 * flattens the 300 LightGBM trees into plain arrays, keeps every threshold and
 * leaf value as a full double, and refuses to export unless this traversal
 * reproduces the Python predictions exactly. Keep the two in step: if the
 * Python changes, this changes with it.
 *
 * Features are held as float32 to match the cast in `model.py`. See the note
 * where the matrix is allocated.
 */

// Vite rewrites this at build time, so it resolves under the Pages subpath too.
const ASSETS = `${import.meta.env.BASE_URL}model/`;

// Days per month for a common year, matching calendar.monthrange on the
// reference year the Python service uses.
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const WEEKDAY_INDEX = 2; // Tuesday stands in for a working day
const WEEKEND_INDEX = 5; // Saturday for a weekend one

let ready = null;

const fetchJson = async path => {
  const response = await fetch(ASSETS + path);
  if (!response.ok) throw new Error(`${path}: ${response.status} ${response.statusText}`);
  return response.json();
};

/** Loads the model and the data bundle once, and reuses them after that. */
export function load() {
  if (!ready) {
    ready = (async () => {
      const [bundle, trees] = await Promise.all([
        fetchJson('bundle.json'),
        fetchJson('trees.json')
      ]);

      // Category code is the index of the value in the trained level list.
      // Anything absent becomes the unseen code, exactly as pandas.Categorical
      // does on the Python side.
      const index = {};
      for (const [column, levels] of Object.entries(bundle.category_levels)) {
        const lookup = new Map();
        levels.forEach((value, position) => lookup.set(value, position));
        index[column] = lookup;
      }

      // Typed arrays so the traversal stays in one contiguous block of memory.
      const forest = {
        roots: Int32Array.from(trees.roots),
        feature: Uint8Array.from(trees.feature),
        threshold: Float64Array.from(trees.threshold),
        left: Int32Array.from(trees.left),
        right: Int32Array.from(trees.right),
        leaf: Float64Array.from(trees.leaf_value)
      };

      return { bundle, forest, index };
    })().catch(error => {
      ready = null; // let a later attempt retry rather than caching the failure
      throw error;
    });
  }
  return ready;
}

/** Facility types, subtypes, climate presets. Whatever the interface needs. */
export async function getMeta() {
  const { bundle } = await load();
  return {
    usages: bundle.usages,
    sub_usages: bundle.sub_usages,
    tree: bundle.tree,
    defaults: bundle.defaults,
    climate: bundle.climate,
    scores: bundle.scores
  };
}

/**
 * Sum every tree for one row of features.
 *
 * A child reference is an index into the split arrays when it is non-negative,
 * and encodes a leaf as -(leaf index + 1) otherwise.
 */
function predictRow(forest, row, offset) {
  const { roots, feature, threshold, left, right, leaf } = forest;
  let total = 0;

  for (let t = 0; t < roots.length; t += 1) {
    let node = roots[t];
    while (node >= 0) {
      node = row[offset + feature[node]] <= threshold[node] ? left[node] : right[node];
    }
    total += leaf[-node - 1];
  }
  return total;
}

const codeOf = (index, column, value, fallback) =>
  index[column].has(value) ? index[column].get(value) : fallback;

export async function getForecast(request) {
  const { bundle, forest, index } = await load();

  const {
    sqm,
    usage,
    sub_usage: subUsage,
    month,
    day_of_week: dayOfWeek,
    tariff,
    weather,
    monthly_weather: monthlyWeather
  } = request;

  const unseen = bundle.unseen_category_code ?? -1;
  const usageCode = codeOf(index, 'primaryspaceusage', usage, unseen);
  const subCode = codeOf(index, 'sub_primaryspaceusage', subUsage, unseen);

  // One matrix for the whole request: the selected day, then a weekday and a
  // weekend profile for each of the twelve months. 600 rows in total.
  const jobs = [{ dayOfWeek, month, weather }];
  for (let m = 1; m <= 12; m += 1) {
    const monthWeather = monthlyWeather ? monthlyWeather[m - 1] : weather;
    jobs.push({ dayOfWeek: WEEKDAY_INDEX, month: m, weather: monthWeather });
    jobs.push({ dayOfWeek: WEEKEND_INDEX, month: m, weather: monthWeather });
  }

  const rowCount = jobs.length * 24;

  // Float32 on purpose. `model.py` casts the feature frame with
  // .astype("float32") before predicting, so a value sitting near a split
  // threshold must round the same way here or the two can pick different
  // branches. Storing doubles would be more precise and less correct.
  const matrix = new Float32Array(rowCount * 11);

  let cursor = 0;
  for (const job of jobs) {
    const w = job.weather;
    for (let hour = 0; hour < 24; hour += 1) {
      matrix[cursor++] = sqm;
      matrix[cursor++] = w.air_temperature;
      matrix[cursor++] = w.dew_temperature;
      matrix[cursor++] = w.sea_level_pressure;
      matrix[cursor++] = w.wind_speed;
      matrix[cursor++] = hour;
      matrix[cursor++] = job.dayOfWeek;
      matrix[cursor++] = job.month;
      matrix[cursor++] = job.dayOfWeek >= 5 ? 1 : 0;
      matrix[cursor++] = usageCode;
      matrix[cursor++] = subCode;
    }
  }

  const predictions = new Float64Array(rowCount);
  for (let row = 0; row < rowCount; row += 1) {
    // A building cannot draw negative power.
    const value = predictRow(forest, matrix, row * 11);
    predictions[row] = value > 0 ? value : 0;
  }

  const sliceOf = job => predictions.subarray(job * 24, job * 24 + 24);
  const sum = series => series.reduce((total, value) => total + value, 0);

  const hourly = Array.from(sliceOf(0));

  const monthly = [];
  let annualKwh = 0;
  for (let m = 0; m < 12; m += 1) {
    const weekdayKwh = sum(sliceOf(1 + m * 2));
    const weekendKwh = sum(sliceOf(2 + m * 2));

    const days = DAYS_IN_MONTH[m];
    const weekendDays = Math.round((days * 2) / 7);
    const total = weekdayKwh * (days - weekendDays) + weekendKwh * weekendDays;

    annualKwh += total;
    monthly.push({
      month: m + 1,
      kwh: total,
      weekday_kwh: weekdayKwh,
      weekend_kwh: weekendKwh
    });
  }

  let peakHour = 0;
  for (let hour = 1; hour < 24; hour += 1) {
    if (hourly[hour] > hourly[peakHour]) peakHour = hour;
  }
  const peak = hourly[peakHour];
  const dailyKwh = hourly.reduce((total, value) => total + value, 0);

  return {
    hourly,
    daily_kwh: dailyKwh,
    peak_kw: peak,
    peak_hour: peakHour,
    base_kw: Math.min(...hourly),
    load_factor: peak > 0 ? dailyKwh / 24 / peak : 0,
    monthly,
    annual_kwh: annualKwh,
    annual_cost: annualKwh * tariff,
    eui: sqm > 0 ? annualKwh / sqm : 0,
    uncertainty_kwh: bundle.scores.mae_kwh
  };
}
