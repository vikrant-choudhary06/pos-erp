'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { domMax, LazyMotion, MotionConfig } from 'motion/react';
import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { ApiError } from '@/lib/api';

// no point retrying when offline (the till falls back to its own data) or
// when the server said no
const retry = (count: number, err: unknown) =>
  count < 1 && !(err instanceof ApiError && (err.status === 0 || err.status < 500));

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // 'always': queries must still run offline, they read the till's local copy
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry, networkMode: 'always' },
          mutations: { networkMode: 'always' },
        },
      }),
  );

  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  return (
    <QueryClientProvider client={client}>
      <LazyMotion features={domMax} strict>
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </LazyMotion>
      <Toaster
        position="bottom-center"
        toastOptions={{
          className: '!rounded-xl !border-line !text-[13px] !shadow-lg !shadow-black/5',
        }}
      />
    </QueryClientProvider>
  );
}
