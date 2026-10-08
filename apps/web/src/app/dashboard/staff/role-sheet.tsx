'use client';

import { PERMISSION_GROUPS, PERMISSIONS, type Permission } from '@pos/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { Checkbox } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api';
import type { Role } from '@/lib/types';

export function RoleSheet({ role, onClose }: { role: Role | 'new' | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const existing = role && role !== 'new' ? role : null;
  const locked = existing?.isSystem && existing.name === 'Owner';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState<string[]>([]);

  useEffect(() => {
    if (!role) return;
    setName(existing?.name ?? '');
    setDescription(existing?.description ?? '');
    setPermissions(existing?.permissions ?? ['order.take']);
  }, [role]);

  const toggle = (p: Permission, on: boolean) =>
    setPermissions((list) => (on ? [...list, p] : list.filter((x) => x !== p)));

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['roles'] });

  const save = useMutation({
    mutationFn: () => {
      const body = { name, description: description || undefined, permissions };
      return existing
        ? api(`/roles/${existing.id}`, { method: 'PATCH', body })
        : api('/roles', { method: 'POST', body });
    },
    onSuccess: () => {
      refresh();
      toast.success(existing ? 'Role saved' : 'Role created');
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: () => api(`/roles/${existing!.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      refresh();
      toast.success('Role deleted');
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Sheet
      open={role !== null}
      onClose={onClose}
      title={existing ? existing.name : 'New role'}
      description={locked ? 'The owner always has full access.' : undefined}
      footer={
        locked ? (
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            {existing && !existing.isSystem && (
              <Button
                variant="danger"
                className="mr-auto"
                loading={remove.isPending}
                onClick={() => remove.mutate()}
              >
                Delete
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button form="role-form" type="submit" loading={save.isPending}>
              Save
            </Button>
          </>
        )
      }
    >
      <form
        id="role-form"
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            {(id) => (
              <Input
                id={id}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Senior waiter"
                disabled={locked}
                required
              />
            )}
          </Field>
          <Field label="Description" optional>
            {(id) => (
              <Input
                id={id}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={locked}
              />
            )}
          </Field>
        </div>

        {PERMISSION_GROUPS.map((group) => (
          <fieldset key={group.label}>
            <legend className="mb-2 text-xs font-medium tracking-wide text-ink-faint uppercase">
              {group.label}
            </legend>
            <div className="divide-y divide-line rounded-xl border border-line">
              {group.permissions.map((p) => (
                <label
                  key={p}
                  className="flex cursor-pointer items-center justify-between gap-4 px-4 py-2.5 text-[13px] has-disabled:cursor-default"
                >
                  {PERMISSIONS[p]}
                  <Checkbox
                    checked={locked || permissions.includes(p)}
                    onChange={(on) => toggle(p, on)}
                    disabled={locked}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </form>
    </Sheet>
  );
}
