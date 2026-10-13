/** Hotel dates are calendar dates in the property's timezone, not timestamps. */
export function hotelDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Use a date in YYYY-MM-DD format');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new Error('Invalid calendar date');
  return date;
}

export const hotelDateKey = (date: Date) => date.toISOString().slice(0, 10);
export const addHotelDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * 86_400_000);
export const hotelNights = (arrival: Date, departure: Date) =>
  Math.round((departure.getTime() - arrival.getTime()) / 86_400_000);

export function hotelToday(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
