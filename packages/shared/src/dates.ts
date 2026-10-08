/**
 * The trading day an instant belongs to. A sale at 1:30 am with a 05:00 day
 * start still counts towards the previous day's takings.
 * Returns YYYY-MM-DD in the outlet's timezone.
 */
export function businessDate(at: Date, timezone = 'Asia/Kolkata', dayStart = '05:00') {
  const [h, m] = dayStart.split(':').map(Number);
  const shifted = new Date(at.getTime() - (h * 60 + m) * 60_000);
  return localDate(shifted, timezone);
}

export function localDate(at: Date, timezone = 'Asia/Kolkata') {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** Indian financial year for a YYYY-MM-DD date, e.g. "2026-27". */
export function financialYear(date: string) {
  const [y, mo] = date.split('-').map(Number);
  const start = mo >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
