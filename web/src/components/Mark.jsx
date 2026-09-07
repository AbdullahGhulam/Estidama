/**
 * The Estidama eight-point star.
 *
 * Two four-point stars, one upright and one rotated, exactly as in the deck.
 * Both arms are painted from CSS custom properties rather than fixed hex, so
 * the mark stays legible when the page flips between dark and light. It never
 * relies on the navy reading against a dark ground.
 */
export default function Mark({ size = 26, className = '' }) {
  const star = 'M50 3 L59 41 L97 50 L59 59 L50 97 L41 59 L3 50 L41 41 Z';

  return (
    <svg
      className={`mark ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Estidama"
    >
      <path className="mark-back" d={star} transform="rotate(45 50 50)" />
      <path className="mark-front" d={star} />
    </svg>
  );
}
