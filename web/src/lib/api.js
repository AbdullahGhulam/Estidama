/**
 * Where the forecast comes from.
 *
 * The published site runs the model in the browser, so there is no server to
 * call and the page works from any static host. Set VITE_API=1 to talk to the
 * FastAPI service in `api/` instead, which is useful when changing the Python
 * and checking the two still agree.
 */
import { getForecast as localForecast, getMeta as localMeta } from './engine';

const USE_API = import.meta.env.VITE_API === '1';

async function request(path, options) {
  const response = await fetch('/api' + path, options);
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(detail || `${response.status} ${response.statusText}`);
  }
  return response.json();
}

export const getMeta = () => (USE_API ? request('/meta') : localMeta());

export const getForecast = (payload, signal) =>
  USE_API
    ? request('/forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal
      })
    : localForecast(payload);
