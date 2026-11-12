/** ISO timestamp `days` ago at a given local time — keeps mock data feeling current. */
export function daysAgo(days, hours = 10, minutes = 0) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

/** Adds minutes to an ISO timestamp (for message sequences). */
export function plusMinutes(iso, minutes) {
  return new Date(new Date(iso).getTime() + minutes * 60000).toISOString();
}

const DAY = 86400000;

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatRelative(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(date)) / DAY);
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (diffDays === 0) {
    const mins = Math.round((Date.now() - date.getTime()) / 60000);
    if (mins >= 0 && mins < 1) return 'Just now';
    if (mins >= 0 && mins < 60) return `${mins} min ago`;
    return `Today, ${time}`;
  }
  if (diffDays === 1) return `Yesterday, ${time}`;
  if (diffDays < 7) return `${date.toLocaleDateString([], { weekday: 'short' })}, ${time}`;
  return date.toLocaleDateString([], { day: 'numeric', month: 'short', year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
}

export function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
