import { useState } from 'react';
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

const money = value =>
  value >= 1000 ? `${(value / 1000).toFixed(value >= 100000 ? 0 : 1)}k` : value.toFixed(0);

const energy = value =>
  value >= 1000 ? `${(value / 1000).toFixed(value >= 100000 ? 0 : 1)}k` : value.toFixed(0);

/**
 * Twelve monthly bills.
 *
 * A facilities team budgets by the month, not by the year, so each bar reports
 * what that month costs as well as what it draws. Hovering previews a month,
 * clicking moves the hourly curve to it.
 */
export default function MonthlyBars({ monthly, selected, onSelect, tariff }) {
  const values = useAnimatedSeries(monthly.map(entry => entry.kwh));
  const [hover, setHover] = useState(null);
  const max = Math.max(...values, 1);

  const shown = hover ?? selected - 1;
  const shownKwh = values[shown] ?? 0;

  // Highest and lowest month, so the spread across the year is readable
  // without hovering every bar.
  let highest = 0;
  let lowest = 0;
  values.forEach((value, index) => {
    if (value > values[highest]) highest = index;
    if (value < values[lowest]) lowest = index;
  });

  return (
    <figure className="chart chart-months">
      <figcaption className="chart-head">
        <span className="chart-title">Monthly bill</span>
        <span className="chart-readout">
          <span className="chart-readout-hour">{NAMES[shown]}</span>
          <span className="chart-readout-value">{money(shownKwh * tariff)}</span>
          <span className="chart-readout-unit">SAR</span>
          <span className="chart-readout-hour">{energy(shownKwh)} kWh</span>
        </span>
      </figcaption>

      <div
        className="months"
        role="group"
        aria-label="Monthly electricity bill"
        onMouseLeave={() => setHover(null)}
      >
        {values.map((value, index) => (
          <button
            key={index}
            type="button"
            className={`month${index + 1 === selected ? ' is-selected' : ''}`}
            onClick={() => onSelect(index + 1)}
            onMouseEnter={() => setHover(index)}
            onFocus={() => setHover(index)}
            aria-pressed={index + 1 === selected}
            title={`${NAMES[index]}: ${Math.round(value * tariff).toLocaleString()} SAR, ${Math.round(value).toLocaleString()} kWh`}
          >
            <span className="month-track">
              <span className="month-bar" style={{ height: `${(value / max) * 100}%` }} />
            </span>
            <span className="month-label">{MONTHS[index]}</span>
          </button>
        ))}
      </div>

      <p className="months-summary">
        Highest {NAMES[highest]} at {Math.round(values[highest] * tariff).toLocaleString()} SAR,
        lowest {NAMES[lowest]} at {Math.round(values[lowest] * tariff).toLocaleString()} SAR.
        Averaging{' '}
        {Math.round((values.reduce((total, value) => total + value, 0) / 12) * tariff).toLocaleString()}{' '}
        SAR a month.
      </p>
    </figure>
  );
}
