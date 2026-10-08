'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { api, errorMessage } from '@/lib/api';

export function StaffLogin({ onDone }: { onDone: (next: string) => void }) {
  const [form, setForm] = useState({ businessCode: '', employeeCode: '', password: '' });
  const [loading, setLoading] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api('/auth/staff-login', { method: 'POST', body: form });
      onDone('dashboard');
    } catch (err) {
      toast.error(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Business code">
        {(id) => (
          <Input
            id={id}
            value={form.businessCode}
            onChange={set('businessCode')}
            placeholder="SHAR1234"
            className="uppercase placeholder:normal-case"
            autoCapitalize="characters"
            required
          />
        )}
      </Field>
      <Field label="Employee ID">
        {(id) => (
          <Input
            id={id}
            value={form.employeeCode}
            onChange={set('employeeCode')}
            placeholder="E002"
            className="uppercase placeholder:normal-case"
            required
          />
        )}
      </Field>
      <Field label="Password">
        {(id) => (
          <Input
            id={id}
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={set('password')}
            required
          />
        )}
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={loading}>
        Sign in
      </Button>
    </form>
  );
}
