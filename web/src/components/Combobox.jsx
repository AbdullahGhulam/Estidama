import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * A field you can either type into or pick from.
 *
 * Typing filters the list; the value still has to come from the list, because
 * the model only knows the categories it was trained on. Free text would be
 * coded as "unseen" and quietly degrade the prediction.
 */
export default function Combobox({
  label,
  hint,
  value,
  options,
  onChange,
  placeholder = 'Type or choose',
  disabled = false
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const listRef = useRef(null);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    // Options that start with the query come first; they are what the user
    // is most likely reaching for.
    const starts = [];
    const contains = [];
    for (const option of options) {
      const haystack = option.toLowerCase();
      if (haystack.startsWith(needle)) starts.push(option);
      else if (haystack.includes(needle)) contains.push(option);
    }
    return [...starts, ...contains];
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = event => {
      if (!rootRef.current?.contains(event.target)) close();
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    listRef.current.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const commit = option => {
    onChange(option);
    close();
  };

  const onKeyDown = event => {
    if (disabled) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(0);
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive(index => (index + step + matches.length) % Math.max(matches.length, 1));
    } else if (event.key === 'Enter') {
      if (open && matches[active]) {
        event.preventDefault();
        commit(matches[active]);
      }
    } else if (event.key === 'Escape') {
      close();
    }
  };

  const listId = `combobox-${label.replace(/\W+/g, '-').toLowerCase()}`;

  return (
    <div className="field" ref={rootRef}>
      <label className="field-label" htmlFor={listId}>
        {label}
        {hint && <span className="field-hint">{hint}</span>}
      </label>

      <div className={`combobox${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}`}>
        <input
          id={listId}
          className="combobox-input"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${listId}-list`}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          placeholder={value || placeholder}
          value={open ? query : value ?? ''}
          onFocus={() => setOpen(true)}
          onChange={event => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />

        <button
          type="button"
          className="combobox-toggle"
          tabIndex={-1}
          disabled={disabled}
          aria-label={open ? 'Close list' : 'Open list'}
          onMouseDown={event => {
            // Fires before the input's focus handler, so it can actually toggle.
            event.preventDefault();
            if (open) close();
            else {
              setOpen(true);
              rootRef.current?.querySelector('input')?.focus();
            }
          }}
        >
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>

        {open && (
          <ul className="combobox-list" id={`${listId}-list`} role="listbox" ref={listRef}>
            {matches.length === 0 && <li className="combobox-empty">No match in the trained categories</li>}
            {matches.map((option, index) => (
              <li
                key={option}
                role="option"
                aria-selected={option === value}
                className={
                  'combobox-option' +
                  (index === active ? ' is-active' : '') +
                  (option === value ? ' is-selected' : '')
                }
                onMouseEnter={() => setActive(index)}
                onMouseDown={event => {
                  event.preventDefault();
                  commit(option);
                }}
              >
                {option}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
