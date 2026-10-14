'use client';

import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';

const RESEND_AFTER = 30;

export function OwnerLogin({ onDone }: { onDone: (next: string) => void }) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setError('');
    setSending(true);
    try {
      await api('/auth/code', { method: 'POST', body: { email } });
      setStep('code');
      setCooldown(RESEND_AFTER);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {step === 'email' ? (
        <m.form
          key="email"
          onSubmit={sendCode}
          className="space-y-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
        >
          <Field label="Email">
            {(id) => (
              <Input
                id={id}
                type="email"
                autoComplete="email"
                placeholder="you@restaurant.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            )}
          </Field>
          <Button type="submit" className="w-full" size="lg" loading={sending}>
            {sending ? 'Sending sign-in code…' : 'Continue with email'}
          </Button>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          {sending && (
            <p role="status" className="text-xs text-ink-soft">
              Connecting to the server. Its first request may take up to a minute.
            </p>
          )}
        </m.form>
      ) : (
        <m.div
          key="code"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
        >
          <p className="text-sm text-ink-soft">
            We sent a 6 digit code to <span className="font-medium text-ink">{email}</span>
          </p>
          <CodeForm email={email} onDone={onDone} />
          {error && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="mt-5 flex items-center justify-between text-[13px]">
            <button className="text-ink-soft hover:text-ink" onClick={() => setStep('email')}>
              Change email
            </button>
            <button
              className="text-ink-soft enabled:hover:text-ink disabled:text-ink-faint"
              disabled={cooldown > 0 || sending}
              onClick={() => sendCode()}
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
            </button>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}

function CodeForm({ email, onDone }: { email: string; onDone: (next: string) => void }) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(0);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  async function verify(code: string) {
    setError('');
    setVerifying(true);
    try {
      const res = await api<{ next: string }>('/auth/code/verify', {
        method: 'POST',
        body: { email, code },
      });
      onDone(res.next);
    } catch (err) {
      setError(errorMessage(err));
      setDigits(Array(6).fill(''));
      setShake((n) => n + 1);
      inputs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  }

  function fill(from: number, value: string) {
    const chars = value
      .replace(/\D/g, '')
      .slice(0, 6 - from)
      .split('');
    if (!chars.length) return;

    const next = [...digits];
    chars.forEach((c, i) => (next[from + i] = c));
    setDigits(next);

    const focusAt = Math.min(from + chars.length, 5);
    inputs.current[focusAt]?.focus();

    if (next.every(Boolean)) verify(next.join(''));
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
      setDigits((d) => d.map((v, j) => (j === i - 1 ? '' : v)));
    }
    if (e.key === 'ArrowLeft' && i > 0) inputs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < 5) inputs.current[i + 1]?.focus();
  }

  return (
    <div>
      <m.div
        key={shake}
        className="mt-5 flex gap-2"
        animate={shake ? { x: [0, -8, 7, -5, 3, 0] } : undefined}
        transition={{ duration: 0.4 }}
      >
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => {
              inputs.current[i] = el;
            }}
            value={digit}
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            autoFocus={i === 0}
            maxLength={6}
            disabled={verifying}
            aria-label={`Digit ${i + 1}`}
            onChange={(e) => {
              if (!e.target.value) {
                setDigits((d) => d.map((v, j) => (j === i ? '' : v)));
                return;
              }
              fill(i, e.target.value);
            }}
            onKeyDown={(e) => onKeyDown(i, e)}
            onFocus={(e) => e.target.select()}
            className={cn(
              'tabular h-13 w-full min-w-0 rounded-[10px] border border-line bg-card text-center text-lg font-medium',
              'transition-[border-color,box-shadow] outline-none focus:border-ink focus:ring-4 focus:ring-ink/[0.06]',
              verifying && 'text-ink-faint',
            )}
          />
        ))}
      </m.div>
      {verifying && (
        <p role="status" className="mt-3 text-sm text-ink-soft">
          Verifying your code…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
