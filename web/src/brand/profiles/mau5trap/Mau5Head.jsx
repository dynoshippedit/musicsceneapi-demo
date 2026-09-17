export function Mau5Head({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <g fill="var(--color-accent)">
        <circle cx="20" cy="30" r="22" />
        <circle cx="80" cy="30" r="22" />
        <circle cx="50" cy="60" r="32" />
      </g>
      <ellipse cx="40" cy="55" rx="7" ry="9" fill="var(--color-text)" transform="rotate(15, 40, 55)" />
      <ellipse cx="60" cy="55" rx="7" ry="9" fill="var(--color-text)" transform="rotate(-15, 60, 55)" />
      <path d="M 30 70 Q 50 90 70 70 Q 50 82 30 70" fill="var(--color-text)" />
    </svg>
  );
}
