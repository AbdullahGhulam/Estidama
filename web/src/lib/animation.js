import { useEffect, useRef, useState } from 'react';

const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Eases an array of numbers towards a new target instead of snapping to it,
 * so the charts redraw as a movement rather than a jump.
 *
 * The effect keys off the contents rather than the array identity. Callers
 * build their arrays inline, so a new identity arrives on every render; keying
 * off it would cancel and restart the animation each frame, which both spins
 * the frame loop forever and stops the values ever reaching the target.
 */
export function useAnimatedSeries(target, duration = 520) {
  const [series, setSeries] = useState(target);
  const currentRef = useRef(target); // what is on screen at this instant
  const targetRef = useRef(target);
  const frameRef = useRef(0);

  targetRef.current = target;
  const key = `${target.length}:${target.join(',')}`;

  useEffect(() => {
    const to = targetRef.current;
    const from = currentRef.current;

    if (from.length !== to.length || prefersReducedMotion()) {
      currentRef.current = to;
      setSeries(to);
      return;
    }

    const started = performance.now();

    const step = now => {
      const eased = easeOutCubic(Math.min((now - started) / duration, 1));
      const next = to.map((value, index) => from[index] + (value - from[index]) * eased);

      currentRef.current = next;
      setSeries(next);
      if (now - started < duration) frameRef.current = requestAnimationFrame(step);
    };

    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
  }, [key, duration]);

  return series;
}

/** Same idea for a single number, used by the big readouts. */
export function useAnimatedNumber(target, duration = 620) {
  const [value, setValue] = useState(target);
  const currentRef = useRef(target);
  const frameRef = useRef(0);

  useEffect(() => {
    const from = currentRef.current;

    if (prefersReducedMotion() || !Number.isFinite(from) || !Number.isFinite(target)) {
      currentRef.current = target;
      setValue(target);
      return;
    }

    const started = performance.now();

    const step = now => {
      const eased = easeOutCubic(Math.min((now - started) / duration, 1));
      const next = from + (target - from) * eased;

      currentRef.current = next;
      setValue(next);
      if (now - started < duration) frameRef.current = requestAnimationFrame(step);
    };

    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration]);

  return value;
}

/** Builds a smooth path through points using a monotone-ish cubic. */
export function smoothPath(points) {
  if (points.length < 2) return '';

  let path = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[Math.max(i - 1, 0)];
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const [x3, y3] = points[Math.min(i + 2, points.length - 1)];

    const c1x = x1 + (x2 - x0) / 6;
    const c1y = y1 + (y2 - y0) / 6;
    const c2x = x2 - (x3 - x1) / 6;
    const c2y = y2 - (y3 - y1) / 6;

    path += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
  }
  return path;
}
