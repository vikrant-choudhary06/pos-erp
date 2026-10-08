'use client';

import { DEFAULT_OUTLET_SETTINGS, INDIAN_STATES, outletSettings } from '@pos/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api';
import type { Outlet } from '@/lib/types';

const empty = {
  name: '',
  code: '',
  phone: '',
  addressLine: '',
  city: '',
  stateCode: '',
  pincode: '',
  gstin: '',
  fssaiNo: '',
  priceIncludesTax: false,
  isActive: true,
  serviceChargePercent: '',
  billFooter: DEFAULT_OUTLET_SETTINGS.billFooter,
  printKot: true,
};

function settingsForm(outlet: Outlet) {
  const s = outletSettings(outlet.settings);
  return {
    serviceChargePercent: s.serviceChargePercent ? String(s.serviceChargePercent) : '',
    billFooter: s.billFooter,
    printKot: s.printKot,
  };
}

export function OutletSheet({
  outlet,
  onClose,
}: {
  outlet: Outlet | 'new' | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const existing = outlet && outlet !== 'new' ? outlet : null;
  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (!outlet) return;
    setForm(
      existing
        ? {
            name: existing.name,
            code: existing.code,
            phone: existing.phone ?? '',
            addressLine: existing.addressLine ?? '',
            city: existing.city ?? '',
            stateCode: existing.stateCode ?? '',
            pincode: existing.pincode ?? '',
            gstin: existing.gstin ?? '',
            fssaiNo: existing.fssaiNo ?? '',
            priceIncludesTax: existing.priceIncludesTax,
            isActive: existing.isActive,
            ...settingsForm(existing),
          }
        : empty,
    );
  }, [outlet]);

  const set =
    (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = useMutation({
    mutationFn: () => {
      const { isActive, serviceChargePercent, billFooter, printKot, ...fields } = form;
      const body = {
        ...fields,
        phone: form.phone || undefined,
        addressLine: form.addressLine || undefined,
        pincode: form.pincode || undefined,
        fssaiNo: form.fssaiNo || undefined,
        gstin: form.gstin || null,
      };
      return existing
        ? api(`/outlets/${existing.id}`, {
            method: 'PATCH',
            body: {
              ...body,
              isActive,
              settings: {
                serviceChargePercent: Number(serviceChargePercent) || 0,
                billFooter: billFooter.trim(),
                printKot,
              },
            },
          })
        : api('/outlets', { method: 'POST', body });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outlets'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success(existing ? 'Outlet saved' : 'Outlet added');
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Sheet
      open={outlet !== null}
      onClose={onClose}
      title={existing ? existing.name : 'New outlet'}
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button form="outlet-form" type="submit" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form
        id="outlet-form"
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid grid-cols-[1fr_120px] gap-3">
          <Field label="Name">
            {(id) => (
              <Input
                id={id}
                value={form.name}
                onChange={set('name')}
                required
                autoFocus={!existing}
              />
            )}
          </Field>
          <Field label="Code" hint="On invoice numbers">
            {(id) => (
              <Input
                id={id}
                value={form.code}
                onChange={(e) =>
                  setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })
                }
                maxLength={10}
                className="font-mono"
                required
              />
            )}
          </Field>
        </div>

        <Field label="Address" optional>
          {(id) => <Input id={id} value={form.addressLine} onChange={set('addressLine')} />}
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="City">
            {(id) => <Input id={id} value={form.city} onChange={set('city')} required />}
          </Field>
          <Field label="State">
            {(id) => (
              <Select id={id} value={form.stateCode} onChange={set('stateCode')} required>
                <option value="" disabled>
                  Select
                </option>
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Pincode" optional>
            {(id) => (
              <Input
                id={id}
                value={form.pincode}
                onChange={(e) =>
                  setForm({ ...form, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })
                }
                inputMode="numeric"
              />
            )}
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone" optional>
            {(id) => (
              <Input
                id={id}
                value={form.phone}
                onChange={(e) =>
                  setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })
                }
                inputMode="numeric"
              />
            )}
          </Field>
          <Field label="GSTIN" optional>
            {(id) => (
              <Input
                id={id}
                value={form.gstin}
                onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                maxLength={15}
                className="tabular"
              />
            )}
          </Field>
        </div>

        <Field label="FSSAI licence no." optional>
          {(id) => (
            <Input
              id={id}
              value={form.fssaiNo}
              onChange={(e) =>
                setForm({ ...form, fssaiNo: e.target.value.replace(/\D/g, '').slice(0, 14) })
              }
              inputMode="numeric"
              className="tabular"
            />
          )}
        </Field>

        {existing && (
          <div className="space-y-4 rounded-xl border border-line p-4">
            <p className="text-[13px] font-medium">Billing</p>
            <div className="grid grid-cols-[140px_1fr] gap-3">
              <Field label="Service charge" hint="Dine-in only">
                {(id) => (
                  <div className="relative">
                    <Input
                      id={id}
                      value={form.serviceChargePercent}
                      onChange={(e) =>
                        /^\d{0,2}(\.\d{0,2})?$/.test(e.target.value) &&
                        setForm({ ...form, serviceChargePercent: e.target.value })
                      }
                      inputMode="decimal"
                      placeholder="0"
                      className="tabular pr-8"
                    />
                    <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-ink-faint">
                      %
                    </span>
                  </div>
                )}
              </Field>
              <Field label="Line at the bottom of the bill" optional>
                {(id) => (
                  <Input
                    id={id}
                    value={form.billFooter}
                    onChange={(e) => setForm({ ...form, billFooter: e.target.value })}
                    maxLength={200}
                  />
                )}
              </Field>
            </div>
            <label className="flex items-center justify-between gap-4">
              <span className="text-[13px]">Print KOT when sent to the kitchen</span>
              <Switch checked={form.printKot} onChange={(v) => setForm({ ...form, printKot: v })} />
            </label>
          </div>
        )}

        <div className="divide-y divide-line rounded-xl border border-line">
          <label className="flex items-center justify-between gap-4 px-4 py-3">
            <span>
              <span className="block text-[13px] font-medium">Menu prices include GST</span>
              <span className="block text-xs text-ink-faint">
                Tax is worked out from the price instead of added on top
              </span>
            </span>
            <Switch
              checked={form.priceIncludesTax}
              onChange={(v) => setForm({ ...form, priceIncludesTax: v })}
            />
          </label>
          {existing && (
            <label className="flex items-center justify-between gap-4 px-4 py-3">
              <span>
                <span className="block text-[13px] font-medium">Open</span>
                <span className="block text-xs text-ink-faint">
                  Closed outlets are hidden from staff
                </span>
              </span>
              <Switch checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />
            </label>
          )}
        </div>
      </form>
    </Sheet>
  );
}
