/**
 * Readout icons, drawn as strokes in `currentColor`.
 *
 * Redrawn as SVG rather than dropped in as the source PNGs on purpose: a raster
 * icon is a fixed colour, so it would either be invisible on the dark theme or
 * on the light one. Stroking in currentColor means each icon inherits whatever
 * colour its label already uses, and stays sharp at any size.
 */

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true
};

/** Lightning bolt: electricity. */
export function BoltIcon({ size = 15 }) {
  return (
    <svg {...base} width={size} height={size} className="readout-icon">
      <path d="M13 2.5 5.5 13.5H10L9.5 21.5 17.5 10H13z" />
    </svg>
  );
}

/** Stacked banknotes: the yearly cost. */
export function CashIcon({ size = 15 }) {
  return (
    <svg {...base} width={size} height={size} className="readout-icon">
      <rect x="1" y="9" width="17" height="11" rx="0.6" />
      <circle cx="9.5" cy="14.5" r="2.6" />
      <path d="M4 6.6 19.6 4.4l1.3 9.1" />
      <path d="M6.2 3.6 21.3 1.6l1.4 9.6" />
    </svg>
  );
}

/** Electricity bill with a coin: the monthly bill. */
export function BillIcon({ size = 15 }) {
  return (
    <svg {...base} width={size} height={size} className="readout-icon">
      <path d="M17.5 1.5H4.8A2.8 2.8 0 0 0 2 4.3v15A2.8 2.8 0 0 1 1 21.5h11.5" />
      <path d="M17.5 1.5A2.8 2.8 0 0 0 15 4.3v3.2" />
      <path d="M9.4 4 6.9 8.6h2.4l-.3 4 2.6-4.6H9.2z" />
      <path d="M5.4 12h1M5.4 15h1M5.4 18h1M8.6 12h4M8.6 15h3.4M8.6 18h3" />
      <circle cx="17.6" cy="15.6" r="5.4" />
      <path d="M19.4 13.4h-2.6a1.5 1.5 0 0 0 0 3h1.5a1.5 1.5 0 0 1 0 3h-2.6M17.6 12.3v6.6" />
    </svg>
  );
}
