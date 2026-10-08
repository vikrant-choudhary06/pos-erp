const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

// Prisma sends Decimal columns as strings, so accept both.
export function formatMoney(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(n) ? inr.format(n) : '—';
}

// Work in paise to avoid float drift when adding up bills.
export const toPaise = (rupees: number | string) => Math.round(Number(rupees) * 100);
export const toRupees = (paise: number) => paise / 100;
