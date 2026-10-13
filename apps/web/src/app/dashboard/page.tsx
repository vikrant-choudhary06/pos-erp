'use client';

import { BUSINESS_TYPES, formatMoney, localDate } from '@pos/shared';
import { useQuery } from '@tanstack/react-query';
import * as m from 'motion/react-m';
import { ArrowUpRight, Check, Copy } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/session';
import type { Category, DiningTable, MenuItem, Staff } from '@/lib/types';

export default function OverviewPage() {
  const { me, outletId, can } = useSession();

  const items = useQuery({
    queryKey: ['menu-items'],
    queryFn: () => api<MenuItem[]>('/menu/items'),
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<Category[]>('/menu/categories'),
  });
  const floor = useQuery({
    queryKey: ['floor', outletId],
    queryFn: () => api<{ tables: DiningTable[] }>(`/outlets/${outletId}/floor`),
    enabled: Boolean(outletId),
  });
  const staff = useQuery({
    queryKey: ['staff'],
    queryFn: () => api<Staff[]>('/staff'),
    enabled: can('staff.manage'),
  });

  const steps = [
    {
      done: (categories.data?.length ?? 0) > 0,
      title: 'Create menu categories',
      body: 'Starters, Main course, Beverages…',
      href: '/dashboard/menu',
    },
    {
      done: (items.data?.length ?? 0) > 0,
      title: 'Add your dishes',
      body: 'With prices, half/full portions and GST.',
      href: '/dashboard/menu',
    },
    {
      done: (floor.data?.tables.length ?? 0) > 0,
      title: 'Set up tables',
      body: 'Skip this if you only do takeaway.',
      href: '/dashboard/tables',
    },
    ...(can('staff.manage')
      ? [
          {
            done: (staff.data?.length ?? 0) > 1,
            title: 'Add your staff',
            body: 'Give waiters and cashiers their own login.',
            href: '/dashboard/staff',
          },
        ]
      : []),
  ];
  const loaded = items.isSuccess && categories.isSuccess && floor.isSuccess;
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <>
      <div className="mb-10">
        <p className="text-sm text-ink-soft">{greeting()},</p>
        <h1 className="mt-0.5 text-[26px] font-semibold tracking-tight">
          {me.user.name.split(' ')[0]}
        </h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="rounded-2xl border border-line bg-card">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="text-sm font-semibold">Getting started</h2>
            {loaded && (
              <span className="tabular text-xs text-ink-faint">
                {doneCount} of {steps.length} done
              </span>
            )}
          </div>
          <ul className="divide-y divide-line">
            {steps.map((step, i) => (
              <m.li
                key={step.title}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i, duration: 0.3 }}
              >
                <Link
                  href={step.href}
                  className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-paper/60"
                >
                  <span
                    className={cn(
                      'grid size-6 shrink-0 place-items-center rounded-full border transition-colors',
                      step.done ? 'border-ink bg-ink text-on-ink' : 'border-line-strong',
                    )}
                  >
                    {step.done && <Check className="size-3.5" strokeWidth={2.5} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm', step.done && 'text-ink-faint line-through')}>
                      {step.title}
                    </p>
                    <p className="text-[13px] text-ink-faint">{step.body}</p>
                  </div>
                  <ArrowUpRight className="size-4 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              </m.li>
            ))}
          </ul>
        </section>

        <div className="space-y-4">
          <BusinessCodeCard />
          {can('reports.view') && <TodayCard />}
          <p className="px-1 text-xs text-ink-faint">
            {BUSINESS_TYPES[me.business.businessType]} · {me.outlets.length}{' '}
            {me.outlets.length === 1 ? 'outlet' : 'outlets'}
          </p>
        </div>
      </div>
    </>
  );
}

function BusinessCodeCard() {
  const { me } = useSession();
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(me.business.businessCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="rounded-2xl border border-line bg-card p-5">
      <h2 className="text-sm font-semibold">Business code</h2>
      <div className="mt-3 flex items-center justify-between">
        <p className="font-mono text-xl tracking-wider">{me.business.businessCode}</p>
        <button
          onClick={copy}
          className="rounded-lg p-2 text-ink-faint transition-colors hover:bg-paper hover:text-ink"
          aria-label="Copy business code"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </button>
      </div>
      <p className="mt-1 text-[13px] text-ink-faint">
        Staff need this along with their employee ID to sign in.
      </p>
    </section>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function TodayCard() {
  const { outletId } = useSession();
  const date = localDate(new Date());
  const { data } = useQuery({
    queryKey: ['report-sales', 'today', outletId, date],
    queryFn: () =>
      api<{ summary: { total: number; orders: number; averageBill: number } }>(
        `/reports/sales?from=${date}&to=${date}&outletId=${outletId}`,
      ),
    enabled: Boolean(outletId),
    refetchInterval: 60_000,
  });

  return (
    <Link
      href="/dashboard/reports"
      className="block rounded-2xl border border-line bg-card p-5 transition-colors hover:border-line-strong"
    >
      <h2 className="text-sm font-semibold">Today</h2>
      <p className="tabular mt-3 text-3xl font-semibold tracking-tight">
        {data ? formatMoney(data.summary.total) : '—'}
      </p>
      <p className="tabular mt-1 text-[13px] text-ink-faint">
        {data?.summary.orders
          ? `${data.summary.orders} completed orders · ${formatMoney(data.summary.averageBill)} average`
          : 'Completed bills, including hotel room charges, show up here.'}
      </p>
    </Link>
  );
}
