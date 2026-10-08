'use client';

import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { useSession } from '@/lib/session';
import { useLive } from '@/lib/use-live';
import { Floor } from './floor';
import { OrderScreen } from './order-screen';
import { PosHeader } from './pos-header';
import { ShiftBanner } from './shift';
import { usePosMenu } from './use-pos';
import { useOfflineSync } from '@/offline/use-offline-sync';

export default function PosPage() {
  const { outletId, can } = useSession();
  const [orderId, setOrderId] = useState<string | null>(null);
  const menu = usePosMenu();

  useLive(outletId);
  useOfflineSync(menu.data);

  if (!outletId) {
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center text-sm text-ink-soft">
        You don’t have access to any outlet yet. Ask the owner to add you to one.
      </div>
    );
  }

  if (!can('order.take') && !can('bill.settle')) {
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center text-sm text-ink-soft">
        Your role can’t take orders. Open the kitchen screen instead.
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <PosHeader onHome={() => setOrderId(null)} />
      <ShiftBanner />
      <div className="relative min-h-0 flex-1">
        {!menu.data ? (
          <div className="grid h-full place-items-center text-ink-faint">
            <Spinner />
          </div>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            {orderId ? (
              <m.div
                key="order"
                className="h-full"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <OrderScreen orderId={orderId} menu={menu.data} onClose={() => setOrderId(null)} />
              </m.div>
            ) : (
              <m.div
                key="floor"
                className="h-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <Floor menu={menu.data} onOpen={setOrderId} />
              </m.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
