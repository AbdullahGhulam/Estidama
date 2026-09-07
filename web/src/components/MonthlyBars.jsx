import { useAnimatedSeries } from '../lib/animation';

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const NAMES = [
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

/** Twelve monthly totals. Clicking one moves the hourly curve to that month. */
export default function MonthlyBars({ monthly, selected, onSelect }) {
  const values = useAnimatedSeries(monthly.map(entry => entry.kwh));
  const max = Math.max(...values, 1);

  return (
    <figure className="chart chart-months">
      <figcaption className="chart-head">
        <span className="chart-title">Across the year</span>
        <span className="chart-note">click a month</span>
      </figcaption>

      <div className="months" role="group" aria-label="Monthly electricity totals">
        {values.map((value, index) => (
          <button
            key={index}
            type="button"
            className={`month${index + 1 === selected ? ' is-selected' : ''}`}
            onClick={() => onSelect(index + 1)}
            aria-pressed={index + 1 === selected}
            title={`${NAMES[index]}: ${Math.round(value).toLocaleString()} kWh`}
          >
            <span className="month-track">
              <span className="month-bar" style={{ height: `${(value / max) * 100}%` }} />
            </span>
            <span className="month-label">{MONTHS[index]}</span>
          </button>
        ))}
      </div>
    </figure>
  );
}
