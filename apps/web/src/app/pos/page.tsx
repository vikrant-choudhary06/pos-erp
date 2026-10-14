'use client';

import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { useEffect, useState } from 'react';
import { HotelWorkspace } from '@/components/pms/hotel-workspace';
import { Button } from '@/components/ui/button';
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
  const restaurantAccess = can('order.take') || can('bill.settle');
  const hotelAccess = can('hotel.view') || can('hotel.housekeeping') || can('hotel.manage');
  const [workspace, setWorkspace] = useState(restaurantAccess ? 'restaurant' : 'hotel');
  const [hotelOpened, setHotelOpened] = useState(!restaurantAccess && hotelAccess);
  const [orderId, setOrderId] = useState<string | null>(null);
  const menu = usePosMenu(restaurantAccess);
  useEffect(() => setOrderId(null), [outletId]);

  useLive(restaurantAccess ? outletId : undefined);
  useOfflineSync(menu.data);

  if (!outletId) {
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center text-sm text-ink-soft">
        You don’t have access to any outlet yet. Ask the owner to add you to one.
      </div>
    );
  }

  if (!restaurantAccess && !hotelAccess) {
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center text-sm text-ink-soft">
        Your role can’t take orders. Open the kitchen screen instead.
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <PosHeader
        onHome={() => {
          setOrderId(null);
          if (restaurantAccess) setWorkspace('restaurant');
        }}
      />
      {hotelAccess && (
        <div
          role="tablist"
          aria-label="POS workspace"
          className="flex shrink-0 gap-2 border-b border-line bg-card px-4 py-2"
        >
          {restaurantAccess && (
            <button
              role="tab"
              aria-selected={workspace === 'restaurant'}
              onClick={() => setWorkspace('restaurant')}
              className={`rounded-lg px-4 py-2 text-sm ${workspace === 'restaurant' ? 'bg-ink text-on-ink' : 'text-ink-soft'}`}
            >
              Restaurant
            </button>
          )}
          <button
            role="tab"
            aria-selected={workspace === 'hotel'}
            onClick={() => {
              setHotelOpened(true);
              setWorkspace('hotel');
            }}
            className={`rounded-lg px-4 py-2 text-sm ${workspace === 'hotel' ? 'bg-ink text-on-ink' : 'text-ink-soft'}`}
          >
            Hotel
          </button>
        </div>
      )}
      {restaurantAccess && (
        <div className={workspace === 'restaurant' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
          <ShiftBanner />
          <div className="relative min-h-0 flex-1">
            {menu.isError && !menu.data ? (
              <div
                role="alert"
                className="grid h-full content-center justify-items-center gap-3 p-6 text-sm"
              >
                <p>Could not load the POS. Check your connection and try again.</p>
                <Button onClick={() => menu.refetch()}>Try again</Button>
              </div>
            ) : !menu.data ? (
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
                    <OrderScreen
                      orderId={orderId}
                      menu={menu.data}
                      onClose={() => setOrderId(null)}
                    />
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
      )}
      {hotelAccess && hotelOpened && (
        <div
          className={workspace === 'hotel' ? 'min-h-0 flex-1 overflow-y-auto p-4 sm:p-6' : 'hidden'}
        >
          <HotelWorkspace />
        </div>
      )}
    </div>
  );
}
