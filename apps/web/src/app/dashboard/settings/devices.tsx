'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Monitor } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/misc';
import { Dialog, Sheet } from '@/components/ui/sheet';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';

type Device = {
  id: string;
  name: string;
  code: string;
  lastSeenAt: string | null;
  createdAt: string;
};

/**
 * Shared tills. Registering puts a long-lived device cookie in this browser,
 * after which staff sign in on it with just their PIN.
 */
export function Devices() {
  const queryClient = useQueryClient();
  const { outletId, me } = useSession();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [removing, setRemoving] = useState<Device | null>(null);

  const devices = useQuery({
    queryKey: ['devices', outletId],
    queryFn: () => api<Device[]>(`/devices?outletId=${outletId}`),
    enabled: Boolean(outletId),
  });

  const register = useMutation({
    mutationFn: () =>
      api<Device>('/devices', { method: 'POST', body: { outletId, name: name.trim() } }),
    onSuccess: (device) => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      toast.success(
        `This browser is now till ${device.code}. Staff can sign in here with their PIN.`,
      );
      setAdding(false);
      setName('');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api(`/devices/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      toast.success('Device removed and signed out');
      setRemoving(null);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <>
      {devices.isLoading ? (
        <Skeleton className="h-24 rounded-2xl" />
      ) : (
        <div className="rounded-2xl border border-line bg-card">
          {devices.data?.length ? (
            <ul className="divide-y divide-line">
              {devices.data.map((d) => (
                <li key={d.id} className="flex items-center gap-4 px-5 py-3.5">
                  <Monitor className="size-4 text-ink-faint" strokeWidth={1.8} />
                  <span className="flex-1">
                    <span className="block text-sm">
                      {d.name} <span className="font-mono text-xs text-ink-faint">{d.code}</span>
                    </span>
                    <span className="block text-xs text-ink-faint">
                      {d.lastSeenAt
                        ? `Last used ${new Date(d.lastSeenAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`
                        : 'Not used yet'}
                    </span>
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setRemoving(d)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-4 text-[13px] text-ink-soft">
              No shared tills at {me.outlets.find((o) => o.id === outletId)?.name}. Set one up from
              the counter computer or tablet itself.
            </p>
          )}
          <div className="border-t border-line px-5 py-3">
            <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
              Use this browser as a till
            </Button>
          </div>
        </div>
      )}

      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title="Set up this browser as a till"
        description="Open this page on the counter computer or tablet you want to use."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              loading={register.isPending}
              disabled={name.trim().length < 2}
              onClick={() => register.mutate()}
            >
              Set up
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name">
            {(id) => (
              <Input
                id={id}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Front counter"
                maxLength={40}
                autoFocus
              />
            )}
          </Field>
          <p className="text-[13px] text-ink-soft">
            After this, anyone signing out here lands on a PIN screen instead of the email login.
            Staff need a PIN set on the Staff page.
          </p>
        </div>
      </Sheet>

      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name}?`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={revoke.isPending}
              onClick={() => removing && revoke.mutate(removing.id)}
            >
              Remove
            </Button>
          </>
        }
      >
        Anyone signed in on it is signed out right away. Use this if a tablet is lost.
      </Dialog>
    </>
  );
}
