'use client';

import { addDays, localDate } from '@pos/shared';
import { Input } from '@/components/ui/field';
import { cn } from '@/lib/cn';

export type Range = { from: string; to: string };

export const today = () => localDate(new Date());

export function presetRange(preset: string): Range {
  const t = today();
  switch (preset) {
    case 'yesterday':
      return { from: addDays(t, -1), to: addDays(t, -1) };
    case '7d':
      return { from: addDays(t, -6), to: t };
    case '30d':
      return { from: addDays(t, -29), to: t };
    case 'month':
      return { from: `${t.slice(0, 8)}01`, to: t };
    default:
      return { from: t, to: t };
  }
}

const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'month', label: 'This month' },
];

export function DateRange({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const active = PRESETS.find((p) => {
    const r = presetRange(p.value);
    return r.from === value.from && r.to === value.to;
  })?.value;

  return (
    <div className="flex max-w-full flex-wrap items-center gap-2">
      <div className="no-scrollbar flex max-w-full overflow-x-auto rounded-[10px] bg-ink/[0.045] p-[3px]">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => onChange(presetRange(p.value))}
            className={cn(
              'h-8 shrink-0 rounded-[8px] px-3 text-[13px] whitespace-nowrap transition-colors',
              active === p.value
                ? 'bg-card font-medium text-ink shadow-sm'
                : 'text-ink-soft hover:text-ink',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <Input
          type="date"
          value={value.from}
          max={value.to}
          onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })}
          className="h-9 w-[150px]"
          aria-label="From"
        />
        <span className="text-ink-faint">–</span>
        <Input
          type="date"
          value={value.to}
          min={value.from}
          onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })}
          className="h-9 w-[150px]"
          aria-label="To"
        />
      </div>
    </div>
  );
}
