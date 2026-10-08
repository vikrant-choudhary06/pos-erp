'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Dialog, Sheet } from '@/components/ui/sheet';
import { Tabs } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import type { Order, PosMenu } from '@/lib/pos-types';

type Saving = { busy: boolean };

export function DiscountDialog({
  order,
  open,
  onClose,
  onSave,
  onRemove,
  busy,
}: {
  order: Order;
  open: boolean;
  onClose: () => void;
  onSave: (body: { type: 'PERCENT' | 'FLAT'; value: number; reason?: string }) => void;
  onRemove: () => void;
} & Saving) {
  const [type, setType] = useState<'PERCENT' | 'FLAT'>('PERCENT');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) return;
    setType(order.discount?.type ?? 'PERCENT');
    setValue(order.discount ? String(Number(order.discount.value)) : '');
    setReason(order.discount?.reason ?? '');
  }, [open]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Discount"
      description="Applied before tax, on the whole bill."
      footer={
        <>
          {order.discount && (
            <Button variant="danger" className="mr-auto" onClick={onRemove} disabled={busy}>
              Remove
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={!Number(value)}
            onClick={() =>
              onSave({ type, value: Number(value), reason: reason.trim() || undefined })
            }
          >
            Apply
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Tabs
          value={type}
          onChange={setType}
          options={[
            { value: 'PERCENT', label: 'Percent' },
            { value: 'FLAT', label: 'Amount' },
          ]}
        />
        <Field label={type === 'PERCENT' ? 'Percent off' : 'Rupees off'}>
          {(id) => (
            <Input
              id={id}
              value={value}
              inputMode="decimal"
              onChange={(e) => /^\d*\.?\d{0,2}$/.test(e.target.value) && setValue(e.target.value)}
              className="tabular"
              autoFocus
            />
          )}
        </Field>
        {type === 'PERCENT' && (
          <div className="flex flex-wrap gap-1.5">
            {[5, 10, 15, 20, 25].map((p) => (
              <button
                key={p}
                onClick={() => setValue(String(p))}
                className="tabular rounded-lg border border-line px-3 py-1.5 text-[13px] hover:border-line-strong"
              >
                {p}%
              </button>
            ))}
          </div>
        )}
        <Field label="Reason" optional>
          {(id) => (
            <Input
              id={id}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Regular customer, complaint…"
              maxLength={200}
            />
          )}
        </Field>
      </div>
    </Sheet>
  );
}

export function CustomerDialog({
  order,
  open,
  onClose,
  onSave,
  busy,
}: {
  order: Order;
  open: boolean;
  onClose: () => void;
  onSave: (body: {
    customerPhone?: string;
    customerName?: string;
    covers?: number;
    notes?: string;
  }) => void;
} & Saving) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [covers, setCovers] = useState('');
  const [notes, setNotes] = useState('');
  const [known, setKnown] = useState<{
    name: string | null;
    visits: number;
    creditBalance: string;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    setPhone(order.customerPhone ?? '');
    setName(order.customerName ?? '');
    setCovers(order.covers ? String(order.covers) : '');
    setNotes(order.notes ?? '');
    setKnown(null);
  }, [open]);

  // look the number up once it is complete
  useEffect(() => {
    if (phone.length !== 10) return setKnown(null);
    let live = true;
    api<{ name: string | null; visits: number; creditBalance: string } | null>(
      `/customers/lookup?phone=${phone}`,
    )
      .then((c) => {
        if (!live) return;
        setKnown(c);
        if (c?.name && !name) setName(c.name);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [phone]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Guest details"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={phone.length > 0 && phone.length !== 10}
            onClick={() =>
              onSave({
                customerPhone: phone || undefined,
                customerName: name.trim() || undefined,
                covers: Number(covers) || undefined,
                notes: notes.trim() || undefined,
              })
            }
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field
          label="Mobile number"
          hint={
            known
              ? `${known.visits} visits${Number(known.creditBalance) ? ` · owes ₹${Number(known.creditBalance)}` : ''}`
              : undefined
          }
        >
          {(id) => (
            <Input
              id={id}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              inputMode="numeric"
              autoFocus
              className="tabular"
            />
          )}
        </Field>
        <Field label="Name" optional>
          {(id) => (
            <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          )}
        </Field>
        {order.type === 'DINE_IN' && (
          <Field label="Guests" optional>
            {(id) => (
              <Input
                id={id}
                value={covers}
                onChange={(e) => setCovers(e.target.value.replace(/\D/g, '').slice(0, 2))}
                inputMode="numeric"
                className="tabular w-24"
              />
            )}
          </Field>
        )}
        <Field label="Order note" optional>
          {(id) => (
            <Input
              id={id}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={200}
            />
          )}
        </Field>
      </div>
    </Sheet>
  );
}

export function ReasonDialog({
  open,
  title,
  body,
  confirm,
  onClose,
  onConfirm,
  busy,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirm: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
} & Saving) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Back
          </Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={reason.trim().length < 3}
            onClick={() => onConfirm(reason.trim())}
          >
            {confirm}
          </Button>
        </>
      }
    >
      {body && <p className="mb-3">{body}</p>}
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason"
        autoFocus
        maxLength={200}
      />
    </Dialog>
  );
}

export function MoveTableDialog({
  open,
  menu,
  busyTables,
  current,
  onClose,
  onMove,
}: {
  open: boolean;
  menu: PosMenu;
  busyTables: Set<string>;
  current: string | null;
  onClose: () => void;
  onMove: (tableId: string) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Move to table">
      <div className="grid grid-cols-3 gap-2">
        {menu.tables.map((t) => {
          const taken = busyTables.has(t.id) && t.id !== current;
          return (
            <button
              key={t.id}
              disabled={taken || t.id === current}
              onClick={() => onMove(t.id)}
              className="h-14 rounded-xl border border-line text-sm font-medium transition-colors hover:border-line-strong disabled:opacity-35"
            >
              {t.name}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
