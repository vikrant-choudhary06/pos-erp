'use client';

import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useTheme } from '@/lib/theme';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn(
        'relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg text-ink-soft transition-colors hover:bg-ink/[0.05] hover:text-ink',
        className,
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <m.span
          key={theme}
          initial={{ opacity: 0, rotate: -60, scale: 0.6 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 60, scale: 0.6 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        >
          {dark ? <Moon className="size-4" /> : <Sun className="size-4" />}
        </m.span>
      </AnimatePresence>
    </button>
  );
}
