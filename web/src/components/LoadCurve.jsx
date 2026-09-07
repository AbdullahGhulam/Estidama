import { useRef, useState } from 'react';
import { smoothPath, useAnimatedSeries } from '../lib/animation';

const W = 720;
const H = 260;
const PAD = { top: 22, right: 16, bottom: 30, left: 46 };

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/** Twenty-four hourly predictions, drawn as one continuous day. */
export default function LoadCurve({
  hourly,
  peakHour,
  month,
  dayType,
  onDayType,
  weekday,
  weekend
}) {
  const series = useAnimatedSeries(hourly);
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const max = Math.max(...series, 1);
  // Four gridlines, each on a round number: take max/4, round that up to
  // 1, 2, 2.5 or 5 times a power of ten, and let the ceiling follow.
  const rough = max / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = magnitude * ([1, 2, 2.5, 5, 10].find(m => m * magnitude >= rough) ?? 10);
  const ceiling = step * 4;

  const x = hour => PAD.left + (hour / 23) * plotW;
  const y = value => PAD.top + plotH - (value / ceiling) * plotH;

  const points = series.map((value, hour) => [x(hour), y(value)]);
  const line = smoothPath(points);
  const area = `${line} L ${x(23)} ${PAD.top + plotH} L ${x(0)} ${PAD.top + plotH} Z`;

  const gridValues = [0, 0.25, 0.5, 0.75, 1].map(fraction => fraction * ceiling);
  const readoutHour = hover ?? peakHour;
  const readoutValue = series[readoutHour] ?? 0;

  const trackPointer = event => {
    const rect = svgRef.current.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const hour = Math.round(((ratio * W - PAD.left) / plotW) * 23);
    setHover(Math.min(23, Math.max(0, hour)));
  };

  return (
    <figure className="chart">
      <figcaption className="chart-head">
        <span className="chart-title">
          One {dayType === weekend ? 'weekend day' : 'working day'} in {month}
        </span>

        {/* Sits on the chart because it only ever changed the chart. */}
        <span className="segmented segmented-mini" role="radiogroup" aria-label="Day to plot">
          <button
            type="button"
            role="radio"
            aria-checked={dayType === weekday}
            className={`segment${dayType === weekday ? ' is-active' : ''}`}
            onClick={() => onDayType(weekday)}
          >
            Weekday
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={dayType === weekend}
            className={`segment${dayType === weekend ? ' is-active' : ''}`}
            onClick={() => onDayType(weekend)}
          >
            Weekend
          </button>
        </span>

        <span className="chart-readout">
          <span className="chart-readout-hour">{String(readoutHour).padStart(2, '0')}:00</span>
          <span className="chart-readout-value">{readoutValue.toFixed(1)}</span>
          <span className="chart-readout-unit">kWh</span>
          {hover === null && <span className="chart-readout-tag">peak</span>}
        </span>
      </figcaption>

      <svg
        ref={svgRef}
        className="chart-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Predicted hourly electricity demand, peaking at ${series[peakHour]?.toFixed(0)} kilowatt hours at ${peakHour}:00`}
        onMouseMove={trackPointer}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="curve-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--signal)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--signal)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="curve-stroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--cool)" />
            <stop offset="55%" stopColor="var(--signal)" />
            <stop offset="100%" stopColor="var(--warm)" />
          </linearGradient>
        </defs>

        {gridValues.map(value => (
          <g key={value}>
            <line
              className="chart-grid"
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(value)}
              y2={y(value)}
            />
            <text className="chart-axis" x={PAD.left - 10} y={y(value) + 4} textAnchor="end">
              {value >= 1000 ? `${(value / 1000).toFixed(1)}k` : Math.round(value)}
            </text>
          </g>
        ))}

        {/* Night hours, shaded so the working day reads at a glance. */}
        <rect
          className="chart-night"
          x={PAD.left}
          y={PAD.top}
          width={x(6) - PAD.left}
          height={plotH}
        />
        <rect className="chart-night" x={x(19)} y={PAD.top} width={x(23) - x(19)} height={plotH} />

        <path className="chart-area" d={area} fill="url(#curve-fill)" />
        <path className="chart-line" d={line} stroke="url(#curve-stroke)" fill="none" />

        {HOURS.filter(hour => hour % 4 === 0).map(hour => (
          <text key={hour} className="chart-axis" x={x(hour)} y={H - 8} textAnchor="middle">
            {String(hour).padStart(2, '0')}
          </text>
        ))}

        <line
          className="chart-cursor"
          x1={x(readoutHour)}
          x2={x(readoutHour)}
          y1={PAD.top}
          y2={PAD.top + plotH}
        />
        <circle className="chart-dot" cx={x(readoutHour)} cy={y(readoutValue)} r="4.5" />
      </svg>
    </figure>
  );
}
