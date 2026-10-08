'use client';

import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: 'md' | 'lg';
};

/** Panel that slides in from the right. Used for every create/edit form. */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'md',
}: Props) {
  const mounted = useMounted();
  useEscape(open, onClose);
  useScrollLock(open);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <m.div
            className="absolute inset-0 bg-black/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <m.aside
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={cn(
              'absolute inset-y-0 right-0 flex w-full flex-col bg-card shadow-2xl shadow-black/10',
              width === 'md' ? 'max-w-[440px]' : 'max-w-[560px]',
            )}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 42 }}
          >
            <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
              <div>
                <h2 className="text-base font-semibold tracking-tight">{title}</h2>
                {description && <p className="mt-0.5 text-[13px] text-ink-soft">{description}</p>}
              </div>
              <button
                onClick={onClose}
                className="-mr-2 rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-paper hover:text-ink"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-6">{children}</div>
            {footer && (
              <footer className="flex justify-end gap-2 border-t border-line px-6 py-4">
                {footer}
              </footer>
            )}
          </m.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: React.ReactNode;
  actions: React.ReactNode;
};

/** Small centered dialog for confirmations. */
export function Dialog({ open, onClose, title, children, actions }: DialogProps) {
  const mounted = useMounted();
  useEscape(open, onClose);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <m.div
            className="absolute inset-0 bg-black/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <m.div
            role="alertdialog"
            aria-modal="true"
            aria-label={title}
            className="relative w-full max-w-sm rounded-2xl bg-card p-6 shadow-2xl shadow-black/10"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <h2 className="text-base font-semibold tracking-tight">{title}</h2>
            {children && <div className="mt-2 text-sm text-ink-soft">{children}</div>}
            <div className="mt-6 flex justify-end gap-2">{actions}</div>
          </m.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// portals need document.body, which doesn't exist during SSR
function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

function useEscape(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onEscape();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onEscape]);
}

function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}
