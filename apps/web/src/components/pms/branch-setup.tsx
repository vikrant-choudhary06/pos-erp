'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { INDIAN_STATES } from '@pos/shared';
import { toast } from 'sonner';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { HotelProperty } from './types';

export function BranchSetup({
  properties,
  onClose,
  onSaved,
}: {
  properties: HotelProperty[];
  onClose: () => void;
  onSaved: (outletId: string) => Promise<void>;
}) {
  const { me, outletId, can } = useSession();
  const client = useQueryClient();
  const unconfigured = me.outlets.filter(
    (outlet) => !properties.some((hotel) => hotel.outletId === outlet.id),
  );
  const [target, setTarget] = useState(
    unconfigured.find((outlet) => outlet.id === outletId)?.id ?? unconfigured[0]?.id ?? 'new',
  );
  const [name, setName] = useState('');
  const [createdOutlet, setCreatedOutlet] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    try {
      let id = createdOutlet ?? target;
      if (id === 'new') {
        const outlet = await api<{ id: string }>('/outlets', {
          method: 'POST',
          body: {
            name: name.trim(),
            code: fields.get('code'),
            city: fields.get('city'),
            stateCode: fields.get('stateCode'),
            addressLine: fields.get('addressLine') || undefined,
          },
        });
        id = outlet.id;
        // Retain the new branch if enabling the hotel fails, so Retry does not create it twice.
        setCreatedOutlet(id);
        await client.invalidateQueries({ queryKey: ['me'] });
        await client.invalidateQueries({ queryKey: ['outlets'] });
      }
      await api('/pms/properties', { method: 'POST', body: { name: name.trim(), outletId: id } });
      await onSaved(id);
      toast.success('Hotel branch ready. Add your rooms and rates next.');
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Add hotel branch"
      description="Set up a branch, then add its rooms and staff."
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            form="hotel-branch"
            type="submit"
            loading={busy}
            disabled={target === 'new' && !can('outlet.manage')}
          >
            Create hotel branch
          </Button>
        </>
      }
    >
      <form id="hotel-branch" onSubmit={save} className="space-y-5">
        <Field
          label="Branch location"
          hint="Enable a hotel at an existing location or create a new branch."
        >
          {(id) => (
            <Select
              id={id}
              value={target}
              disabled={!!createdOutlet || busy}
              onChange={(event) => setTarget(event.target.value)}
            >
              {unconfigured.map((outlet) => (
                <option key={outlet.id} value={outlet.id}>
                  {outlet.name}
                  {outlet.city ? ` · ${outlet.city}` : ''}
                </option>
              ))}
              {can('outlet.manage') && <option value="new">Create a new location</option>}
            </Select>
          )}
        </Field>
        {target === 'new' && !can('outlet.manage') ? (
          <p className="text-sm text-ink-soft">Ask the owner to add a branch location first.</p>
        ) : (
          <>
            <Field label="Hotel branch name">
              {(id) => (
                <Input
                  id={id}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  minLength={2}
                  maxLength={80}
                  required
                  disabled={busy || !!createdOutlet}
                  placeholder="Hotel name · city"
                />
              )}
            </Field>
            {target === 'new' && !createdOutlet && (
              <>
                <Field label="Branch code" hint="2–10 letters or digits, used in invoice numbers.">
                  {(id) => (
                    <Input
                      id={id}
                      name="code"
                      pattern="[A-Za-z0-9]{2,10}"
                      maxLength={10}
                      required
                    />
                  )}
                </Field>
                <Field label="City">
                  {(id) => <Input id={id} name="city" minLength={2} required />}
                </Field>
                <Field label="State">
                  {(id) => (
                    <Select id={id} name="stateCode" defaultValue="" required>
                      <option value="" disabled>
                        Select state
                      </option>
                      {INDIAN_STATES.map((state) => (
                        <option key={state.code} value={state.code}>
                          {state.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Address" optional>
                  {(id) => <Input id={id} name="addressLine" maxLength={200} />}
                </Field>
              </>
            )}
            {createdOutlet && (
              <p role="status" className="rounded-lg bg-paper p-3 text-sm">
                The branch location is saved. Retry to finish enabling its hotel.
              </p>
            )}
            <p className="text-xs text-ink-soft">
              Branch billing details can be completed in business Settings. Assign staff to this
              branch under Staff.
            </p>
          </>
        )}
      </form>
    </Sheet>
  );
}
