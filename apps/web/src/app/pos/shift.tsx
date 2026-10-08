'use client';

import { formatMoney, PAYMENT_METHODS } from '@pos/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { Tabs } from '@/components/ui/tabs';
import { api, errorMessage } from '@/lib/api';
import type { Shift } from '@/lib/pos-types';
import { esc, printHtml } from '@/lib/print';
import { useSession } from '@/lib/session';
import { useShift } from './use-pos';

/** Strip under the header: open a shift, or manage the one that is running. */
export function ShiftBanner() {
  const { can } = useSession();
  const shift = useShift();
  const [panel, setPanel] = useState<'open' | 'manage' | null>(null);

  if (!can('shift.manage') || shift.isLoading) return null;

  return (
    <>
      {shift.data ? (
        <div className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-line bg-card px-4 text-xs text-ink-soft">
          <span>
            Shift open since{' '}
            {new Date(shift.data.openedAt).toLocaleTimeString('en-IN', { timeStyle: 'short' })}
            {shift.data.openedBy ? ` · ${shift.data.openedBy}` : ''}
          </span>
          <button
            onClick={() => setPanel('manage')}
            className="font-medium text-ink hover:underline"
          >
            Cash drawer
          </button>
        </div>
      ) : (
        <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-line bg-ink px-4 text-[13px] text-white">
          <span>No cash shift is open. Payments need an open shift.</span>
          <button
            onClick={() => setPanel('open')}
            className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-ink"
          >
            Open shift
          </button>
        </div>
      )}

      <OpenShift open={panel === 'open'} onClose={() => setPanel(null)} />
      {shift.data && (
        <ManageShift shift={shift.data} open={panel === 'manage'} onClose={() => setPanel(null)} />
      )}
    </>
  );
}

function OpenShift({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { outletId } = useSession();
  const queryClient = useQueryClient();
  const [cash, setCash] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api('/shifts', { method: 'POST', body: { outletId, openingCash: Number(cash) || 0 } });
      queryClient.invalidateQueries({ queryKey: ['shift'] });
      toast.success('Shift opened');
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Open shift"
      description="Count the cash in the drawer before the first sale."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={submit}>
            Open shift
          </Button>
        </>
      }
    >
      <Field label="Cash in drawer">
        {(id) => <MoneyInput id={id} value={cash} onChange={setCash} autoFocus />}
      </Field>
    </Sheet>
  );
}

function ManageShift({
  shift,
  open,
  onClose,
}: {
  shift: Shift;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { me } = useSession();
  const [tab, setTab] = useState<'cash' | 'close'>('cash');
  const [type, setType] = useState<'PAY_IN' | 'PAY_OUT'>('PAY_OUT');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [counted, setCounted] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['shift'] });
  const expected = Number(shift.expectedCash);
  const difference = counted === '' ? null : Number(counted) - expected;

  async function addCash() {
    setBusy(true);
    try {
      await api(`/shifts/${shift.id}/cash`, {
        method: 'POST',
        body: { type, amount: Number(amount), reason: reason.trim() },
      });
      setAmount('');
      setReason('');
      refresh();
      toast.success(type === 'PAY_OUT' ? 'Cash taken out' : 'Cash added');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    setBusy(true);
    try {
      const closed = await api<Shift>(`/shifts/${shift.id}/close`, {
        method: 'POST',
        body: { closingCash: Number(counted) },
      });
      printHtml(shiftReport(closed, me.business.name));
      refresh();
      toast.success('Shift closed');
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Cash drawer" width="lg">
      <dl className="tabular grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Opening" value={Number(shift.openingCash)} />
        <Stat label="Cash sales" value={shift.cashSales} />
        <Stat label="In / out" value={shift.payIn - shift.payOut} />
        <Stat label="Should be in drawer" value={expected} strong />
      </dl>

      <div className="mt-6 divide-y divide-line rounded-xl border border-line">
        {shift.payments.length === 0 && (
          <p className="px-4 py-3 text-[13px] text-ink-faint">No payments yet</p>
        )}
        {shift.payments.map((p) => (
          <div key={p.method} className="tabular flex justify-between px-4 py-2.5 text-[13px]">
            <span>
              {PAYMENT_METHODS[p.method]} <span className="text-ink-faint">· {p.count}</span>
            </span>
            <span>{formatMoney(p.amount)}</span>
          </div>
        ))}
      </div>

      <Tabs
        className="mt-8"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'cash', label: 'Pay in / out' },
          { value: 'close', label: 'Close shift' },
        ]}
      />

      {tab === 'cash' ? (
        <div className="mt-5 space-y-4">
          <Tabs
            value={type}
            onChange={setType}
            options={[
              { value: 'PAY_OUT', label: 'Take out' },
              { value: 'PAY_IN', label: 'Put in' },
            ]}
          />
          <div className="grid grid-cols-[140px_1fr] gap-3">
            <MoneyInput value={amount} onChange={setAmount} />
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Paid milk vendor…"
              maxLength={120}
            />
          </div>
          <Button
            loading={busy}
            disabled={!Number(amount) || reason.trim().length < 2}
            onClick={addCash}
          >
            Save
          </Button>
          {shift.cashMovements.length > 0 && (
            <ul className="divide-y divide-line text-[13px]">
              {shift.cashMovements.map((c) => (
                <li key={c.id} className="tabular flex justify-between py-2">
                  <span className="text-ink-soft">{c.reason}</span>
                  <span>
                    {c.type === 'PAY_OUT' ? '−' : '+'}
                    {formatMoney(c.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <Field label="Cash counted in drawer">
            {(id) => <MoneyInput id={id} value={counted} onChange={setCounted} />}
          </Field>
          {difference !== null && (
            <p className={difference === 0 ? 'text-[13px] text-veg' : 'text-[13px] text-danger'}>
              {difference === 0
                ? 'Matches exactly'
                : difference > 0
                  ? `${formatMoney(difference)} extra`
                  : `${formatMoney(-difference)} short`}
            </p>
          )}
          <Button loading={busy} disabled={counted === ''} onClick={close}>
            Close shift and print report
          </Button>
        </div>
      )}
    </Sheet>
  );
}

function Stat({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={strong ? 'rounded-xl bg-ink p-3 text-white' : 'rounded-xl bg-paper p-3'}>
      <dt className={strong ? 'text-xs text-white/60' : 'text-xs text-ink-faint'}>{label}</dt>
      <dd className="mt-1 text-base font-semibold">{formatMoney(value)}</dd>
    </div>
  );
}

function MoneyInput({
  value,
  onChange,
  id,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-ink-faint">
        ₹
      </span>
      <Input
        id={id}
        value={value}
        inputMode="decimal"
        autoFocus={autoFocus}
        onChange={(e) => /^\d*\.?\d{0,2}$/.test(e.target.value) && onChange(e.target.value)}
        className="tabular pl-7"
      />
    </div>
  );
}

function shiftReport(shift: Shift, business: string) {
  const row = (label: string, value: number | string) =>
    `<div class="row"><span>${esc(label)}</span><span>${Number(value).toFixed(2)}</span></div>`;
  const time = (d: string | null) =>
    d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '';
  return `
    <h1>${esc(business)}</h1>
    <div class="c">SHIFT REPORT</div>
    <hr>
    <div class="row"><span>Opened</span><span>${time(shift.openedAt)}</span></div>
    <div class="row"><span>Closed</span><span>${time(shift.closedAt)}</span></div>
    <div class="row"><span>By</span><span>${esc(shift.closedBy)}</span></div>
    <hr>
    ${shift.payments.map((p) => row(`${PAYMENT_METHODS[p.method]} (${p.count})`, p.amount)).join('')}
    <hr>
    ${row('Opening cash', shift.openingCash)}
    ${row('Cash sales', shift.cashSales)}
    ${row('Pay in', shift.payIn)}
    ${row('Pay out', shift.payOut)}
    ${row('Expected', shift.expectedCash)}
    ${row('Counted', shift.closingCash ?? 0)}
    <hr>
    <div class="row big"><span>Difference</span><span>${Number(shift.difference ?? 0).toFixed(2)}</span></div>
  `;
}
