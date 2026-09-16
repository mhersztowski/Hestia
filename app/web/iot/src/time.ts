/** A "how long ago" description — for the device's last-signal column. */
export function howLongAgo(when: number, now = Date.now()): string {
  if (!when) return 'never';
  const seconds = Math.max(0, Math.round((now - when) / 1000));
  if (seconds < 60) return `${seconds} s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}
