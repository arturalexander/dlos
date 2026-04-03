/** Shared utility functions — use these instead of inline duplicates */

/**
 * Format a Firestore Timestamp or plain Date to a Spanish locale string.
 * @param ts    Firestore Timestamp (with .toDate()) or any Date-compatible value
 * @param short Omit year (default false)
 */
export function formatDate(ts: any, short = false): string {
  if (!ts) return 'N/A';
  const d: Date = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    ...(short ? {} : { year: 'numeric' }),
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format processing duration in seconds to a human-readable string.
 */
export function formatDuration(seconds?: number): string {
  if (!seconds) return '—';
  return seconds < 60 ? `${seconds.toFixed(0)}s` : `${(seconds / 60).toFixed(1)} min`;
}
