'use client';

import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Logo } from '@/components/logo';
import { Tabs } from '@/components/ui/tabs';
import { OwnerLogin } from './owner-login';
import { StaffLogin } from './staff-login';

type Mode = 'owner' | 'staff';

export default function LoginPage() {
  const router = useRouter();
  const client = useQueryClient();
  const [mode, setMode] = useState<Mode>('owner');

  const onDone = (next: string) => {
    client.clear();
    router.replace(next === 'onboarding' ? '/onboarding' : '/dashboard');
    router.refresh();
  };

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <Logo />
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-soft hover:text-ink"
        >
          <ArrowLeft className="size-3.5" /> Home
        </Link>
      </header>

      <div className="flex flex-1 items-start justify-center px-6 pt-[12vh] pb-16">
        <m.div
          className="w-full max-w-[360px]"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            {mode === 'owner'
              ? 'New here? Use your email and we will set up your business.'
              : 'Use the employee ID your manager gave you.'}
          </p>

          <Tabs
            className="mt-7 w-full [&>button]:flex-1"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'owner', label: 'Owner' },
              { value: 'staff', label: 'Staff' },
            ]}
          />

          <div className="mt-6">
            <AnimatePresence mode="wait" initial={false}>
              <m.div
                key={mode}
                initial={{ opacity: 0, x: mode === 'owner' ? -8 : 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {mode === 'owner' ? <OwnerLogin onDone={onDone} /> : <StaffLogin onDone={onDone} />}
              </m.div>
            </AnimatePresence>
          </div>
        </m.div>
      </div>
    </main>
  );
}
