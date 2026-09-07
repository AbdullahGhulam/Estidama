import { useEffect, useState } from 'react';

/**
 * A number you type. Kept as a string while focused so intermediate states
 * like "" or "12." do not fight the user, and committed as a number on blur.
 */
export function NumberField({ label, hint, unit, value, onChange, min, max, step = 1 }) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  const commit = raw => {
    const parsed = Number(raw);
    if (raw.trim() === '' || Number.isNaN(parsed)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed));
    setDraft(String(clamped));
    onChange(clamped);
  };

  return (
    <div className="field">
      <label className="field-label" htmlFor={`num-${label}`}>
        {label}
        {hint && <span className="field-hint">{hint}</span>}
      </label>
      <div className="numberfield">
        <input
          id={`num-${label}`}
          className="numberfield-input"
          type="number"
          inputMode="decimal"
          value={draft}
          min={min}
          max={max}
          step={step}
          onFocus={() => setEditing(true)}
          onChange={event => {
            setDraft(event.target.value);
            const parsed = Number(event.target.value);
            // Update live while typing, but only once the value is usable.
            if (event.target.value !== '' && !Number.isNaN(parsed)) {
              if (parsed >= (min ?? -Infinity) && parsed <= (max ?? Infinity)) onChange(parsed);
            }
          }}
          onBlur={event => {
            setEditing(false);
            commit(event.target.value);
          }}
        />
        {unit && <span className="numberfield-unit">{unit}</span>}
      </div>
    </div>
  );
}

/** A short list of mutually exclusive choices, shown all at once. */
export function Segmented({ label, hint, value, options, onChange }) {
  return (
    <div className="field">
      <span className="field-label">
        {label}
        {hint && <span className="field-hint">{hint}</span>}
      </span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            className={`segment${option.value === value ? ' is-active' : ''}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Floor area on a logarithmic track.
 *
 * Real facilities run from a few hundred square metres to six figures. On a
 * linear track everything below 20,000 m² would be squeezed into the first
 * fifth of the slider, so the position is log-scaled and the marks are placed
 * at the point they actually correspond to.
 */
export function Slider({ value, onChange, min, max, marks = [] }) {
  const STEPS = 1000;
  const span = Math.log(max / min);

  const toPosition = amount =>
    (Math.log(Math.min(max, Math.max(min, amount)) / min) / span) * STEPS;
  const toValue = position => {
    const raw = min * Math.exp((position / STEPS) * span);
    // Round to something a person would type: 10s, 100s or 1000s by size.
    const grain = raw < 1000 ? 10 : raw < 20000 ? 100 : 1000;
    return Math.round(raw / grain) * grain;
  };

  return (
    <div className="slider">
      <input
        className="slider-input"
        type="range"
        aria-label="Floor area"
        aria-valuetext={`${value} square metres`}
        value={toPosition(value)}
        min={0}
        max={STEPS}
        step={1}
        onChange={event => onChange(toValue(Number(event.target.value)))}
      />
      <div className="slider-marks">
        {marks.map(mark => (
          <button
            key={mark}
            type="button"
            className="slider-mark"
            style={{ left: `${(toPosition(mark) / STEPS) * 100}%` }}
            onClick={() => onChange(mark)}
          >
            {mark >= 1000 ? `${mark / 1000}k` : mark}
          </button>
        ))}
      </div>
    </div>
  );
}
