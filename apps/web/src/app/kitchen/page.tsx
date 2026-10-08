'use client';

import { ORDER_TYPES } from '@pos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { ArrowLeft, Volume2, VolumeX } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FoodMark } from '@/components/ui/misc';
import { Spinner } from '@/components/ui/spinner';
import { Tabs } from '@/components/ui/tabs';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { Kot } from '@/lib/pos-types';
import { useSession } from '@/lib/session';
import { useLive } from '@/lib/use-live';

const NEXT: Partial<Record<Kot['status'], { status: Kot['status']; label: string }>> = {
  NEW: { status: 'PREPARING', label: 'Start' },
  PREPARING: { status: 'READY', label: 'Ready' },
  READY: { status: 'SERVED', label: 'Served' },
};

export default function KitchenPage() {
  const { outletId, me, can } = useSession();
  const queryClient = useQueryClient();
  const [station, setStation] = useState('all');
  const [sound, setSound] = useState(true);
  const now = useNow();
  const known = useRef<Set<string> | null>(null);

  const stations = useQuery({
    queryKey: ['stations', outletId],
    queryFn: () => api<{ id: string; name: string }[]>(`/outlets/${outletId}/stations`),
    enabled: Boolean(outletId),
  });

  const tickets = useQuery({
    queryKey: ['kitchen', outletId, station],
    queryFn: () =>
      api<Kot[]>(
        `/kitchen/tickets?outletId=${outletId}${station !== 'all' ? `&stationId=${station}` : ''}`,
      ),
    enabled: Boolean(outletId),
    refetchInterval: 30_000,
  });

  useLive(outletId);

  // chime when a ticket we haven't seen arrives
  useEffect(() => {
    if (!tickets.data) return;
    const ids = new Set(tickets.data.map((t) => t.id));
    if (
      known.current &&
      sound &&
      tickets.data.some((t) => !known.current!.has(t.id) && t.status === 'NEW')
    ) {
      chime();
    }
    known.current = ids;
  }, [tickets.data, sound]);

  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Kot['status'] }) =>
      api(`/kitchen/tickets/${id}`, { method: 'PATCH', body: { status } }),
    onMutate: async ({ id, status }) => {
      // feels instant on a busy pass
      queryClient.setQueryData<Kot[]>(['kitchen', outletId, station], (list) =>
        list?.map((t) => (t.id === id ? { ...t, status } : t)),
      );
    },
    onError: (err) => {
      toast.error(errorMessage(err));
      queryClient.invalidateQueries({ queryKey: ['kitchen'] });
    },
  });

  if (!can('kitchen.view') && !can('order.take')) {
    return (
      <p className="grid min-h-dvh place-items-center text-sm text-ink-soft">
        Your role can’t see the kitchen screen.
      </p>
    );
  }

  const list = tickets.data ?? [];
  const counts = {
    NEW: list.filter((t) => t.status === 'NEW').length,
    PREPARING: list.filter((t) => t.status === 'PREPARING').length,
    READY: list.filter((t) => t.status === 'READY').length,
  };

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line px-4">
        <Link
          href={can('order.take') ? '/pos' : '/dashboard'}
          className="grid size-9 place-items-center rounded-lg hover:bg-black/[0.04]"
          aria-label="Back"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="text-[15px] font-semibold">Kitchen</h1>
        <span className="hidden text-[13px] text-ink-soft sm:block">
          {me.outlets.find((o) => o.id === outletId)?.name}
        </span>
        <span className="tabular ml-2 hidden gap-3 text-xs text-ink-faint md:flex">
          <span>{counts.NEW} new</span>
          <span>{counts.PREPARING} cooking</span>
          <span>{counts.READY} ready</span>
        </span>
        <div className="ml-auto flex items-center gap-2">
          {(stations.data?.length ?? 0) > 0 && (
            <Tabs
              value={station}
              onChange={setStation}
              options={[
                { value: 'all', label: 'All' },
                ...(stations.data ?? []).map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          )}
          <button
            onClick={() => setSound(!sound)}
            className="grid size-9 place-items-center rounded-lg text-ink-soft hover:bg-black/[0.04]"
            aria-label={sound ? 'Mute' : 'Unmute'}
          >
            {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
        {tickets.isLoading ? (
          <div className="grid h-full place-items-center text-ink-faint">
            <Spinner />
          </div>
        ) : list.length === 0 ? (
          <div className="grid h-full place-items-center text-sm text-ink-faint">All caught up</div>
        ) : (
          <div className="flex h-full flex-col flex-wrap content-start gap-3 p-4">
            <AnimatePresence initial={false} mode="popLayout">
              {list.map((kot) => {
                const minutes = Math.floor((now - new Date(kot.createdAt).getTime()) / 60_000);
                const late = kot.status !== 'READY' && kot.status !== 'SERVED' && minutes >= 15;
                const next = NEXT[kot.status];
                return (
                  <m.article
                    key={kot.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: kot.status === 'SERVED' ? 0.45 : 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                    className={cn(
                      'flex max-h-full w-64 flex-col overflow-hidden rounded-2xl border bg-card',
                      kot.status === 'READY'
                        ? 'border-veg ring-2 ring-veg/30'
                        : late
                          ? 'border-danger'
                          : 'border-line',
                    )}
                  >
                    <div
                      className={cn(
                        'flex items-start justify-between px-4 py-3',
                        kot.status === 'NEW' ? 'bg-ink text-white' : 'border-b border-line',
                      )}
                    >
                      <div>
                        <p className="text-base font-semibold">
                          {kot.order.table ? kot.order.table.name : ORDER_TYPES[kot.order.type]}
                        </p>
                        <p
                          className={cn(
                            'text-xs',
                            kot.status === 'NEW' ? 'text-white/60' : 'text-ink-faint',
                          )}
                        >
                          KOT {kot.kotNo} · #{kot.order.orderNo}
                          {kot.station && station === 'all' ? ` · ${kot.station.name}` : ''}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'tabular text-sm font-medium',
                          late && kot.status !== 'NEW' && 'text-danger',
                        )}
                      >
                        {minutes}m
                      </span>
                    </div>
                    <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
                      {kot.items.map((item) => (
                        <li
                          key={item.id}
                          className={cn(
                            'flex gap-2.5',
                            item.status === 'CANCELLED' && 'text-ink-faint line-through',
                          )}
                        >
                          <span className="tabular w-6 shrink-0 text-base font-semibold">
                            {Number(item.quantity)}
                          </span>
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 text-sm leading-snug font-medium">
                              {item.foodType && (
                                <FoodMark type={item.foodType} className="size-3" />
                              )}
                              {item.itemName}
                              {item.variantName && (
                                <span className="font-normal text-ink-soft">
                                  · {item.variantName}
                                </span>
                              )}
                            </p>
                            {item.modifiers.length > 0 && (
                              <p className="text-xs text-ink-soft">
                                + {item.modifiers.map((x) => x.name).join(', ')}
                              </p>
                            )}
                            {item.notes && (
                              <p className="text-xs font-medium text-danger">{item.notes}</p>
                            )}
                            {item.status === 'CANCELLED' && (
                              <p className="text-xs text-danger no-underline">Cancelled</p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                    {next && (
                      <button
                        onClick={() => move.mutate({ id: kot.id, status: next.status })}
                        className={cn(
                          'h-12 shrink-0 text-sm font-medium transition-colors',
                          next.status === 'READY'
                            ? 'bg-veg text-white hover:bg-veg/90'
                            : 'border-t border-line hover:bg-paper',
                        )}
                      >
                        {next.label}
                      </button>
                    )}
                  </m.article>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  );
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

let audio: AudioContext | null = null;

function chime() {
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime;
    for (const [i, freq] of [880, 1320].entries()) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.25, t + i * 0.15 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.15 + 0.3);
      osc.connect(gain).connect(audio.destination);
      osc.start(t + i * 0.15);
      osc.stop(t + i * 0.15 + 0.32);
    }
  } catch {
    // browsers block audio until the screen has been touched once
  }
}
