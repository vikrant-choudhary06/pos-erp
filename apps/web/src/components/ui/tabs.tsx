'use client';

import * as m from 'motion/react-m';
import { useId } from 'react';
import { cn } from '@/lib/cn';

type Props<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: React.ReactNode }[];
  className?: string;
};

export function Tabs<T extends string>({ value, onChange, options, className }: Props<T>) {
  const id = useId();

  return (
    <div
      role="tablist"
      className={cn('inline-flex rounded-[10px] bg-ink/[0.045] p-[3px]', className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative h-8 rounded-[8px] px-3.5 text-[13px] font-medium transition-colors',
              active ? 'text-ink' : 'text-ink-soft hover:text-ink',
            )}
          >
            {active && (
              <m.span
                layoutId={id}
                className="absolute inset-0 rounded-[8px] bg-card shadow-sm shadow-black/[0.06]"
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
