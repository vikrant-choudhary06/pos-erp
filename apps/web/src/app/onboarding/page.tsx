'use client';

import { BUSINESS_TYPES, INDIAN_STATES, type BusinessType } from '@pos/shared';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';

const STEPS = ['About you', 'Your business', 'Location'] as const;

const initial = {
  ownerName: '',
  phone: '',
  businessName: '',
  businessType: 'RESTAURANT' as BusinessType,
  city: '',
  stateCode: '',
  outletName: '',
  gstin: '',
};

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    queryKey: ['onboarding'],
    queryFn: () => api<{ email: string | null }>('/onboarding'),
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function next(e: React.FormEvent) {
    e.preventDefault();
    if (step < STEPS.length - 1) return setStep(step + 1);

    setSaving(true);
    try {
      await api('/onboarding', { method: 'POST', body: form });
      router.replace('/dashboard');
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <Logo href="/onboarding" />
        {data?.email && <span className="text-[13px] text-ink-soft">{data.email}</span>}
      </header>

      <div className="flex flex-1 justify-center px-6 pt-[8vh] pb-16">
        <div className="w-full max-w-[420px]">
          <ol className="flex gap-1.5">
            {STEPS.map((label, i) => (
              <li key={label} className="flex-1">
                <div className="h-1 overflow-hidden rounded-full bg-line">
                  <m.div
                    className="h-full bg-ink"
                    initial={false}
                    animate={{ width: i <= step ? '100%' : '0%' }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
                <p className={cn('mt-2 text-xs', i === step ? 'text-ink' : 'text-ink-faint')}>
                  {label}
                </p>
              </li>
            ))}
          </ol>

          <form onSubmit={next} className="mt-10">
            <AnimatePresence mode="wait" initial={false}>
              <m.div
                key={step}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-5"
              >
                {step === 0 && (
                  <>
                    <Heading title="Let's get you set up" body="This takes about a minute." />
                    <Field label="Your name">
                      {(id) => (
                        <Input
                          id={id}
                          value={form.ownerName}
                          onChange={(e) => set('ownerName', e.target.value)}
                          autoComplete="name"
                          autoFocus
                          required
                          minLength={2}
                        />
                      )}
                    </Field>
                    <Field label="Mobile number">
                      {(id) => (
                        <div className="flex">
                          <span className="grid h-10 place-items-center rounded-l-[10px] border border-r-0 border-line bg-paper px-3 text-sm text-ink-soft">
                            +91
                          </span>
                          <Input
                            id={id}
                            className="rounded-l-none"
                            value={form.phone}
                            onChange={(e) =>
                              set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))
                            }
                            inputMode="numeric"
                            autoComplete="tel-national"
                            pattern="[6-9][0-9]{9}"
                            title="10 digit mobile number"
                            required
                          />
                        </div>
                      )}
                    </Field>
                  </>
                )}

                {step === 1 && (
                  <>
                    <Heading title="Tell us about the business" />
                    <Field label="Business name" hint="Printed on bills. You can change it later.">
                      {(id) => (
                        <Input
                          id={id}
                          value={form.businessName}
                          onChange={(e) => set('businessName', e.target.value)}
                          placeholder="Sharma Dhaba"
                          autoFocus
                          required
                          minLength={2}
                        />
                      )}
                    </Field>
                    <div className="space-y-1.5">
                      <p className="text-[13px] font-medium">Type</p>
                      <div className="grid grid-cols-2 gap-2">
                        {(Object.keys(BUSINESS_TYPES) as BusinessType[]).map((type) => (
                          <button
                            type="button"
                            key={type}
                            onClick={() => set('businessType', type)}
                            className={cn(
                              'flex h-10 items-center justify-between rounded-[10px] border px-3 text-left text-[13px] transition-colors',
                              form.businessType === type
                                ? 'border-ink bg-card'
                                : 'border-line bg-card text-ink-soft hover:border-line-strong',
                            )}
                          >
                            {BUSINESS_TYPES[type]}
                            {form.businessType === type && <Check className="size-3.5" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {step === 2 && (
                  <>
                    <Heading
                      title="Where is it?"
                      body="We use the state for GST. Add more outlets later from settings."
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="City">
                        {(id) => (
                          <Input
                            id={id}
                            value={form.city}
                            onChange={(e) => set('city', e.target.value)}
                            autoFocus
                            required
                          />
                        )}
                      </Field>
                      <Field label="State">
                        {(id) => (
                          <Select
                            id={id}
                            value={form.stateCode}
                            onChange={(e) => set('stateCode', e.target.value)}
                            required
                          >
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
                    </div>
                    <Field label="Outlet name" optional>
                      {(id) => (
                        <Input
                          id={id}
                          value={form.outletName}
                          onChange={(e) => set('outletName', e.target.value)}
                          placeholder={
                            form.businessName
                              ? `${form.businessName}, ${form.city || 'MG Road'}`
                              : ''
                          }
                        />
                      )}
                    </Field>
                    <Field label="GSTIN" optional>
                      {(id) => (
                        <Input
                          id={id}
                          value={form.gstin}
                          onChange={(e) => set('gstin', e.target.value.toUpperCase())}
                          maxLength={15}
                          placeholder="23ABCDE1234F1Z5"
                          className="tabular uppercase"
                        />
                      )}
                    </Field>
                  </>
                )}
              </m.div>
            </AnimatePresence>

            <div className="mt-8 flex items-center gap-2">
              {step > 0 && (
                <Button type="button" variant="ghost" onClick={() => setStep(step - 1)}>
                  Back
                </Button>
              )}
              <Button type="submit" className="ml-auto min-w-28" loading={saving}>
                {step === STEPS.length - 1 ? 'Create business' : 'Continue'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}

function Heading({ title, body }: { title: string; body?: string }) {
  return (
    <div className="pb-1">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {body && <p className="mt-1.5 text-sm text-ink-soft">{body}</p>}
    </div>
  );
}
