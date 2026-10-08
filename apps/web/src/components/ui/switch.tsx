'use client';

import * as m from 'motion/react-m';
import { cn } from '@/lib/cn';

type Props = {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  disabled?: boolean;
};

export function Switch({ checked, onChange, label, disabled }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full p-[3px] transition-colors duration-200',
        checked ? 'bg-ink' : 'bg-line-strong',
        disabled && 'opacity-50',
      )}
    >
      <m.span
        layout
        transition={{ type: 'spring', stiffness: 700, damping: 40 }}
        className={cn('size-4 rounded-full bg-white shadow-sm', checked && 'ml-auto')}
      />
    </button>
  );
}

export function Checkbox({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className="size-4 shrink-0 cursor-pointer rounded border-line-strong accent-ink disabled:cursor-default"
    />
  );
}
