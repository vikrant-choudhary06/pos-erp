export type BaseUnit = 'G' | 'ML' | 'PCS';

export const UNIT_LABEL: Record<BaseUnit, string> = { G: 'g', ML: 'ml', PCS: 'pcs' };

/** 2500 g reads better as 2.5 kg. */
export function formatQty(value: number | string, unit: BaseUnit) {
  const n = Number(value);
  const abs = Math.abs(n);
  if (unit === 'G' && abs >= 1000) return `${trim(n / 1000)} kg`;
  if (unit === 'ML' && abs >= 1000) return `${trim(n / 1000)} L`;
  return `${trim(n)} ${UNIT_LABEL[unit]}`;
}

const trim = (n: number) => String(Math.round(n * 1000) / 1000);
