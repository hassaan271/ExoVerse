/** ExoVerse's mark: a world on its orbit. */
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="11.5" fill="none" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="16" cy="16" r="3" fill="currentColor" />
      <circle cx="24.1" cy="7.9" r="2.6" fill="currentColor" />
    </svg>
  );
}
