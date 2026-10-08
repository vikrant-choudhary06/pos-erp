'use client';

import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { Check, ChevronsUpDown, Store } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/session';

export function OutletSwitcher() {
  const { me, outletId, setOutletId } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = me.outlets.find((o) => o.id === outletId);
  const canSwitch = me.outlets.length > 1;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => canSwitch && setOpen(!open)}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-[10px] border border-line bg-card px-2.5 py-2 text-left',
          canSwitch && 'transition-colors hover:border-line-strong',
        )}
      >
        <Store className="size-4 shrink-0 text-ink-faint" strokeWidth={1.8} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{current?.name ?? 'No outlet'}</p>
          <p className="truncate text-[11px] text-ink-faint">{me.business.name}</p>
        </div>
        {canSwitch && <ChevronsUpDown className="size-3.5 shrink-0 text-ink-faint" />}
      </button>

      <AnimatePresence>
        {open && (
          <m.ul
            role="listbox"
            className="absolute inset-x-0 top-full z-20 mt-1.5 overflow-hidden rounded-[10px] border border-line bg-card p-1 shadow-lg shadow-black/[0.06]"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            {me.outlets.map((outlet) => (
              <li key={outlet.id}>
                <button
                  onClick={() => {
                    setOutletId(outlet.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-paper"
                >
                  <span className="truncate">{outlet.name}</span>
                  {outlet.id === outletId && <Check className="size-3.5" />}
                </button>
              </li>
            ))}
          </m.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
