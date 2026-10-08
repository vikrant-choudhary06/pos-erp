'use client';

import { formatMoney } from '@pos/shared';
import * as m from 'motion/react-m';
import { useState } from 'react';

type Bar = { key: string; label: string; value: number; hint?: string };

/** A plain vertical bar chart. Good enough for days and hours, no chart library needed. */
export function Bars({ data, height = 160 }: { data: Bar[]; height?: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(...data.map((d) => d.value), 1);
  const shown = data.find((d) => d.key === hover);

  if (!data.length) {
    return (
      <div className="grid place-items-center text-[13px] text-ink-faint" style={{ height }}>
        No sales in this period
      </div>
    );
  }

  return (
    <div>
      <p className="tabular mb-3 h-5 text-[13px] text-ink-soft">
        {shown ? (
          <>
            <span className="text-ink">{shown.label}</span> · {formatMoney(shown.value)}
            {shown.hint ? ` · ${shown.hint}` : ''}
          </>
        ) : (
          ' '
        )}
      </p>
      <div
        className="flex items-end gap-[3px]"
        style={{ height }}
        onMouseLeave={() => setHover(null)}
      >
        {data.map((d, i) => (
          <div
            key={d.key}
            className="flex h-full flex-1 cursor-default items-end"
            onMouseEnter={() => setHover(d.key)}
          >
            <m.div
              className={
                hover === d.key
                  ? 'w-full rounded-t-[3px] bg-ink'
                  : 'w-full rounded-t-[3px] bg-ink/75'
              }
              initial={{ height: 0 }}
              animate={{ height: `${Math.max((d.value / max) * 100, d.value ? 2 : 0)}%` }}
              transition={{ duration: 0.5, delay: i * 0.01, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-ink-faint">
        <span>{data[0].label}</span>
        {data.length > 2 && <span>{data[Math.floor(data.length / 2)].label}</span>}
        <span>{data[data.length - 1].label}</span>
      </div>
    </div>
  );
}

/** Horizontal share bars, e.g. payment methods. */
export function Shares({ data }: { data: { label: string; value: number; hint?: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.label}>
          <div className="tabular flex justify-between text-[13px]">
            <span>
              {d.label}
              {d.hint && <span className="text-ink-faint"> · {d.hint}</span>}
            </span>
            <span>{formatMoney(d.value)}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/[0.05]">
            <m.div
              className="h-full rounded-full bg-ink"
              initial={{ width: 0 }}
              animate={{ width: `${(d.value / total) * 100}%` }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
