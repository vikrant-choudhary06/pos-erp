'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { domMax, LazyMotion, MotionConfig } from 'motion/react';
import { useState } from 'react';
import { Toaster } from 'sonner';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );

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
