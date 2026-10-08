'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { Dialog, Sheet } from '@/components/ui/sheet';
import { Checkbox, Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { Role, Staff } from '@/lib/types';

const empty = {
  name: '',
  phone: '',
  email: '',
  roleId: '',
  password: '',
  pin: '',
  allOutlets: false,
  outletIds: [] as string[],
  active: true,
};

type Props = {
  staff: Staff | 'new' | null;
  roles: Role[];
  onClose: () => void;
};

export function StaffSheet({ staff, roles, onClose }: Props) {
  const queryClient = useQueryClient();
  const { me } = useSession();
  const existing = staff && staff !== 'new' ? staff : null;
  const isOwner = existing?.isOwner ?? false;

  const [form, setForm] = useState(empty);
  const [created, setCreated] = useState<Staff | null>(null);
  const [confirming, setConfirming] = useState(false);

  const assignable = roles.filter((r) => !(r.isSystem && r.name === 'Owner'));

  useEffect(() => {
    if (!staff) return;
    if (existing) {
      setForm({
        ...empty,
        name: existing.name,
        phone: existing.phone ?? '',
        email: existing.email ?? '',
        roleId: existing.role.id,
        allOutlets: existing.allOutlets,
        outletIds: existing.outlets.map((o) => o.id),
        active: existing.status === 'ACTIVE',
      });
    } else {
      setForm({
        ...empty,
        roleId: assignable.find((r) => r.name === 'Waiter')?.id ?? assignable[0]?.id ?? '',
        outletIds: me.outlets.length === 1 ? [me.outlets[0].id] : [],
      });
    }
  }, [staff]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const toggleOutlet = (id: string, on: boolean) =>
    set('outletIds', on ? [...form.outletIds, id] : form.outletIds.filter((o) => o !== id));

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        phone: form.phone || undefined,
        email: form.email || undefined,
        password: form.password || undefined,
        pin: form.pin || undefined,
        ...(!isOwner && {
          roleId: form.roleId,
          allOutlets: form.allOutlets,
          outletIds: form.allOutlets ? [] : form.outletIds,
        }),
        ...(existing && !isOwner && { status: form.active ? 'ACTIVE' : 'INACTIVE' }),
      };
      return existing
        ? api<Staff>(`/staff/${existing.id}`, { method: 'PATCH', body })
        : api<Staff>('/staff', { method: 'POST', body });
    },
    onSuccess: (person) => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      onClose();
      if (existing) toast.success('Saved');
      else setCreated(person);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: () => api(`/staff/${existing!.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.success(`${existing?.name} removed`);
      setConfirming(false);
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const noOutlets = !isOwner && !form.allOutlets && form.outletIds.length === 0;

  return (
    <>
      <Sheet
        open={staff !== null}
        onClose={onClose}
        title={existing ? existing.name : 'Add staff'}
        description={
          existing
            ? `Employee ID ${existing.employeeCode}`
            : 'They get an employee ID automatically.'
        }
        footer={
          <>
            {existing && !isOwner && (
              <Button variant="danger" className="mr-auto" onClick={() => setConfirming(true)}>
                Remove
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button form="staff-form" type="submit" loading={save.isPending} disabled={noOutlets}>
              {existing ? 'Save' : 'Add'}
            </Button>
          </>
        }
      >
        <form
          id="staff-form"
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Field label="Name">
            {(id) => (
              <Input
                id={id}
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                autoFocus={!existing}
                required
              />
            )}
          </Field>

          {!isOwner && (
            <Field label="Role">
              {(id) => (
                <Select
                  id={id}
                  value={form.roleId}
                  onChange={(e) => set('roleId', e.target.value)}
                  required
                >
                  {assignable.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Mobile" optional>
              {(id) => (
                <Input
                  id={id}
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                  inputMode="numeric"
                />
              )}
            </Field>
            <Field label="Email" optional={!isOwner}>
              {(id) => (
                <Input
                  id={id}
                  type="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  disabled={isOwner}
                />
              )}
            </Field>
          </div>

          <fieldset className="space-y-3 rounded-xl border border-line p-4">
            <legend className="px-1 text-[13px] font-medium">Sign in</legend>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Password"
                hint={existing?.hasPassword ? 'Blank keeps the current one' : 'For the dashboard'}
              >
                {(id) => (
                  <Input
                    id={id}
                    type="password"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => set('password', e.target.value)}
                    minLength={6}
                    placeholder={existing?.hasPassword ? '••••••' : ''}
                  />
                )}
              </Field>
              <Field
                label="PIN"
                hint={existing?.hasPin ? 'Blank keeps the current one' : 'For the POS'}
              >
                {(id) => (
                  <Input
                    id={id}
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    value={form.pin}
                    onChange={(e) => set('pin', e.target.value.replace(/\D/g, '').slice(0, 6))}
                    minLength={4}
                    placeholder={existing?.hasPin ? '••••' : '4–6 digits'}
                    className="tabular"
                  />
                )}
              </Field>
            </div>
          </fieldset>

          {!isOwner && me.outlets.length > 0 && (
            <fieldset className="rounded-xl border border-line">
              <label className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-[13px] font-medium">Access to all outlets</span>
                <Switch checked={form.allOutlets} onChange={(v) => set('allOutlets', v)} />
              </label>
              {!form.allOutlets && (
                <div className="space-y-2.5 border-t border-line px-4 py-3">
                  {me.outlets.map((outlet) => (
                    <label
                      key={outlet.id}
                      className="flex cursor-pointer items-center gap-2.5 text-[13px]"
                    >
                      <Checkbox
                        checked={form.outletIds.includes(outlet.id)}
                        onChange={(on) => toggleOutlet(outlet.id, on)}
                      />
                      {outlet.name}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          )}

          {existing && !isOwner && (
            <label className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
              <span>
                <span className="block text-[13px] font-medium">Active</span>
                <span className="block text-xs text-ink-faint">
                  Inactive staff are signed out everywhere
                </span>
              </span>
              <Switch checked={form.active} onChange={(v) => set('active', v)} />
            </label>
          )}
        </form>
      </Sheet>

      <Dialog
        open={created !== null}
        onClose={() => setCreated(null)}
        title={`${created?.name} is added`}
        actions={<Button onClick={() => setCreated(null)}>Done</Button>}
      >
        <p>Share these so they can sign in:</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-paper p-4 text-ink">
          <div>
            <dt className="text-xs text-ink-faint">Business code</dt>
            <dd className="mt-0.5 font-mono text-base">{me.business.businessCode}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-faint">Employee ID</dt>
            <dd className="mt-0.5 font-mono text-base">{created?.employeeCode}</dd>
          </div>
        </dl>
      </Dialog>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Remove ${existing?.name}?`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              Remove
            </Button>
          </>
        }
      >
        They will be signed out and can't sign in again. Their past bills stay as they are.
      </Dialog>
    </>
  );
}
