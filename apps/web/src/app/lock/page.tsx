'use client';

import { useQuery } from '@tanstack/react-query';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { ArrowLeft, Delete } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Logo } from '@/components/logo';
import { Spinner } from '@/components/ui/spinner';
import { api, ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';

type LockScreen = {
  device: { id: string; name: string; code: string };
  outlet: { id: string; name: string };
  business: { name: string };
  staff: { id: string; name: string; role: string }[];
};

export default function LockPage() {
  const router = useRouter();
  const [person, setPerson] = useState<LockScreen['staff'][number] | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const screen = useQuery({
    queryKey: ['lock-screen'],
    queryFn: () => api<LockScreen>('/devices/current'),
    retry: false,
  });

  useEffect(() => {
    if (screen.error instanceof ApiError && screen.error.status === 401) router.replace('/login');
  }, [screen.error, router]);

  const submit = useCallback(
    async (value: string) => {
      if (!person || !screen.data) return;
      setBusy(true);
      try {
        const res = await api<{ outletId: string }>('/auth/pin', {
          method: 'POST',
          body: { userId: person.id, pin: value },
        });
        try {
          localStorage.setItem('pos.outlet', res.outletId);
        } catch {}
        router.replace('/pos');
      } catch (err) {
        setError(errorMessage(err));
        setPin('');
        setBusy(false);
      }
    },
    [person, screen.data, router],
  );

  const press = useCallback(
    (key: string) => {
      if (busy) return;
      setError('');
      if (key === 'back') return setPin((p) => p.slice(0, -1));
      setPin((p) => (p + key).slice(0, 6));
    },
    [busy],
  );

  // physical keyboards on counter PCs
  useEffect(() => {
    if (!person) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('back');
      else if (e.key === 'Enter' && pin.length >= 4) submit(pin);
      else if (e.key === 'Escape') setPerson(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [person, pin, press, submit]);

  if (!screen.data) {
    return (
      <div className="grid min-h-dvh place-items-center text-ink-faint">
        {screen.error && !(screen.error instanceof ApiError && screen.error.status === 401) ? (
          <p className="text-sm">{errorMessage(screen.error)}</p>
        ) : (
          <Spinner />
        )}
      </div>
    );
  }

  const { business, outlet, device, staff } = screen.data;

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-6 py-5">
        <Logo href="/lock" />
        <p className="text-right text-[13px] text-ink-soft">
          {business.name} · {outlet.name}
          <span className="ml-2 font-mono text-xs text-ink-faint">{device.code}</span>
        </p>
      </header>

      <div className="flex flex-1 items-center justify-center px-6 pb-16">
        <AnimatePresence mode="wait" initial={false}>
          {!person ? (
            <m.div
              key="people"
              className="w-full max-w-2xl"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <h1 className="text-center text-2xl font-semibold tracking-tight">Who’s working?</h1>
              {staff.length === 0 ? (
                <p className="mt-4 text-center text-sm text-ink-soft">
                  Nobody has a PIN for this outlet yet. Set PINs from Staff in the dashboard.
                </p>
              ) : (
                <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {staff.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setPerson(s);
                        setPin('');
                        setError('');
                      }}
                      className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-card px-4 py-6 transition-[border-color,transform] hover:-translate-y-0.5 hover:border-line-strong active:scale-[0.98]"
                    >
                      <span className="grid size-12 place-items-center rounded-full bg-ink text-base font-medium text-on-ink">
                        {s.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="text-center">
                        <span className="block text-sm font-medium">{s.name}</span>
                        <span className="block text-xs text-ink-faint">{s.role}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-10 text-center text-xs text-ink-faint">
                Owner?{' '}
                <a href="/login" className="underline underline-offset-2 hover:text-ink">
                  Sign in with email
                </a>
              </p>
            </m.div>
          ) : (
            <m.div
              key="pin"
              className="w-full max-w-[300px]"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <button
                onClick={() => setPerson(null)}
                className="inline-flex items-center gap-1.5 text-[13px] text-ink-soft hover:text-ink"
              >
                <ArrowLeft className="size-3.5" /> Back
              </button>
              <p className="mt-6 text-center text-lg font-semibold">{person.name}</p>
              <p className="text-center text-[13px] text-ink-soft">Enter your PIN</p>

              <m.div
                key={error}
                className="mt-6 flex justify-center gap-3"
                animate={error ? { x: [0, -8, 7, -5, 3, 0] } : undefined}
                transition={{ duration: 0.35 }}
              >
                {Array.from({ length: 6 }, (_, i) => (
                  <span
                    key={i}
                    className={cn(
                      'size-3 rounded-full border transition-colors',
                      i < pin.length ? 'border-ink bg-ink' : 'border-line-strong',
                      i >= 4 && i >= pin.length && 'opacity-40',
                    )}
                  />
                ))}
              </m.div>
              <p className="mt-3 h-5 text-center text-[13px] text-danger">{error}</p>

              <div className="mt-4 grid grid-cols-3 gap-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
                  <Key key={k} onClick={() => press(k)}>
                    {k}
                  </Key>
                ))}
                <Key onClick={() => press('back')} aria-label="Delete">
                  <Delete className="size-5" />
                </Key>
                <Key onClick={() => press('0')}>0</Key>
                <Key
                  onClick={() => pin.length >= 4 && submit(pin)}
                  className="bg-ink text-sm text-on-ink hover:bg-ink/85"
                  disabled={pin.length < 4 || busy}
                >
                  {busy ? <Spinner /> : 'Go'}
                </Key>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

function Key({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'tabular grid h-16 place-items-center rounded-2xl bg-card text-xl font-medium shadow-sm shadow-black/[0.03] transition-[background-color,transform] select-none hover:bg-ink/[0.03] active:scale-95 disabled:opacity-40',
        className,
      )}
      {...props}
    />
  );
}
