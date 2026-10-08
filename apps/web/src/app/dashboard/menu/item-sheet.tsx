'use client';

import { FOOD_TYPES, type FoodType } from '@pos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { FoodMark } from '@/components/ui/misc';
import { Dialog, Sheet } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Tabs } from '@/components/ui/tabs';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { Category, MenuItem, TaxGroup } from '@/lib/types';
import { useModifierGroups } from './add-ons';
import { RecipeEditor } from './recipe';

type VariantRow = { key: string; id?: string; name: string; price: string };

type Form = {
  name: string;
  categoryId: string;
  foodType: FoodType;
  shortCode: string;
  basePrice: string;
  taxGroupId: string;
  hsnCode: string;
  description: string;
  isActive: boolean;
  hasVariants: boolean;
  variants: VariantRow[];
  modifierGroupIds: string[];
};

let rowKey = 0;
const newRow = (name = '', price = ''): VariantRow => ({ key: `row-${rowKey++}`, name, price });

function toForm(item: MenuItem | null, categoryId: string, taxGroupId: string): Form {
  if (!item) {
    return {
      name: '',
      categoryId,
      foodType: 'VEG',
      shortCode: '',
      basePrice: '',
      taxGroupId,
      hsnCode: '',
      description: '',
      isActive: true,
      hasVariants: false,
      variants: [newRow('Half'), newRow('Full')],
      modifierGroupIds: [],
    };
  }
  return {
    name: item.name,
    categoryId: item.category.id,
    foodType: item.foodType,
    shortCode: item.shortCode ?? '',
    basePrice: String(Number(item.basePrice)),
    taxGroupId: item.taxGroup?.id ?? '',
    hsnCode: item.hsnCode ?? '',
    description: item.description ?? '',
    isActive: item.isActive,
    hasVariants: item.hasVariants,
    variants: item.hasVariants
      ? item.variants.map((v) => ({ ...newRow(v.name, String(Number(v.price))), id: v.id }))
      : [newRow('Half'), newRow('Full')],
    modifierGroupIds: item.modifierGroups.map((g) => g.modifierGroupId),
  };
}

type Props = {
  item: MenuItem | 'new' | null;
  categories: Category[];
  defaultCategoryId: string | null;
  onClose: () => void;
};

export function ItemSheet({ item, categories, defaultCategoryId, onClose }: Props) {
  const queryClient = useQueryClient();
  const isNew = item === 'new';
  const existing = item && item !== 'new' ? item : null;

  const taxGroups = useQuery({
    queryKey: ['tax-groups'],
    queryFn: () => api<TaxGroup[]>('/menu/tax-groups'),
    staleTime: Infinity,
  });

  const [form, setForm] = useState<Form>(() => toForm(null, '', ''));
  const [confirming, setConfirming] = useState(false);
  const { can } = useSession();
  const addOns = useModifierGroups();

  // reset the form whenever a different item is opened
  useEffect(() => {
    if (!item) return;
    const category = defaultCategoryId ?? categories[0]?.id ?? '';
    setForm(toForm(existing, category, taxGroups.data?.[0]?.id ?? ''));
  }, [item]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const setVariant = (key: string, patch: Partial<VariantRow>) =>
    set(
      'variants',
      form.variants.map((v) => (v.key === key ? { ...v, ...patch } : v)),
    );

  const save = useMutation({
    mutationFn: () => {
      const variants = form.hasVariants
        ? form.variants.map((v) => ({ id: v.id, name: v.name, price: Number(v.price) }))
        : [];
      const body = {
        name: form.name,
        categoryId: form.categoryId,
        foodType: form.foodType,
        shortCode: form.shortCode || null,
        // with portions, the cheapest one doubles as the base price
        basePrice: form.hasVariants
          ? Math.min(...variants.map((v) => v.price))
          : Number(form.basePrice),
        taxGroupId: form.taxGroupId || null,
        hsnCode: form.hsnCode || undefined,
        description: form.description || undefined,
        isActive: form.isActive,
        variants,
        modifierGroupIds: form.modifierGroupIds,
      };
      return existing
        ? api(`/menu/items/${existing.id}`, { method: 'PATCH', body })
        : api('/menu/items', { method: 'POST', body });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-items'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success(isNew ? 'Item added' : 'Item saved');
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: () => api(`/menu/items/${existing!.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-items'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Item deleted');
      setConfirming(false);
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <>
      <Sheet
        open={item !== null}
        onClose={onClose}
        title={isNew ? 'New item' : 'Edit item'}
        width="lg"
        footer={
          <>
            {existing && (
              <Button variant="danger" className="mr-auto" onClick={() => setConfirming(true)}>
                Delete
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button form="item-form" type="submit" loading={save.isPending}>
              Save
            </Button>
          </>
        }
      >
        <form
          id="item-form"
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
                placeholder="Paneer Butter Masala"
                autoFocus={isNew}
                required
              />
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              {(id) => (
                <Select
                  id={id}
                  value={form.categoryId}
                  onChange={(e) => set('categoryId', e.target.value)}
                  required
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Short code" optional hint="Type it on the POS to add fast">
              {(id) => (
                <Input
                  id={id}
                  value={form.shortCode}
                  onChange={(e) =>
                    set('shortCode', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                  }
                  maxLength={8}
                  placeholder="PBM"
                  className="font-mono uppercase"
                />
              )}
            </Field>
          </div>

          <div className="space-y-1.5">
            <p className="text-[13px] font-medium">Type</p>
            <Tabs
              value={form.foodType}
              onChange={(v) => set('foodType', v)}
              options={(Object.keys(FOOD_TYPES) as FoodType[]).map((type) => ({
                value: type,
                label: (
                  <span className="flex items-center gap-1.5">
                    <FoodMark type={type} className="size-3" />
                    {FOOD_TYPES[type]}
                  </span>
                ),
              }))}
            />
          </div>

          <div className="rounded-xl border border-line">
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-[13px] font-medium">Portions</p>
                <p className="text-xs text-ink-faint">Half / full, small / large…</p>
              </div>
              <Switch
                checked={form.hasVariants}
                onChange={(v) => set('hasVariants', v)}
                label="Has portions"
              />
            </div>

            <div className="border-t border-line px-4 py-4">
              {form.hasVariants ? (
                <div className="space-y-2">
                  <AnimatePresence initial={false}>
                    {form.variants.map((variant) => (
                      <m.div
                        key={variant.key}
                        className="flex gap-2"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18 }}
                      >
                        <Input
                          value={variant.name}
                          onChange={(e) => setVariant(variant.key, { name: e.target.value })}
                          placeholder="Full"
                          aria-label="Portion name"
                          required
                        />
                        <PriceInput
                          value={variant.price}
                          onChange={(price) => setVariant(variant.key, { price })}
                          className="w-36 shrink-0"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            set(
                              'variants',
                              form.variants.filter((v) => v.key !== variant.key),
                            )
                          }
                          disabled={form.variants.length <= 1}
                          className="grid size-10 shrink-0 place-items-center rounded-lg text-ink-faint hover:bg-paper hover:text-ink disabled:opacity-30"
                          aria-label="Remove portion"
                        >
                          <X className="size-4" />
                        </button>
                      </m.div>
                    ))}
                  </AnimatePresence>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-ml-2"
                    onClick={() => set('variants', [...form.variants, newRow()])}
                    disabled={form.variants.length >= 10}
                  >
                    <Plus className="size-3.5" /> Add portion
                  </Button>
                </div>
              ) : (
                <Field label="Price">
                  {(id) => (
                    <PriceInput
                      id={id}
                      value={form.basePrice}
                      onChange={(v) => set('basePrice', v)}
                      className="max-w-44"
                    />
                  )}
                </Field>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tax">
              {(id) => (
                <Select
                  id={id}
                  value={form.taxGroupId}
                  onChange={(e) => set('taxGroupId', e.target.value)}
                >
                  <option value="">No tax</option>
                  {taxGroups.data?.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="HSN / SAC" optional>
              {(id) => (
                <Input
                  id={id}
                  value={form.hsnCode}
                  onChange={(e) => set('hsnCode', e.target.value.replace(/\D/g, ''))}
                  maxLength={8}
                  placeholder="996331"
                  className="tabular"
                />
              )}
            </Field>
          </div>

          {(addOns.data?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <p className="text-[13px] font-medium">Add-ons</p>
              <div className="flex flex-wrap gap-2">
                {addOns.data!.map((g) => {
                  const on = form.modifierGroupIds.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() =>
                        set(
                          'modifierGroupIds',
                          on
                            ? form.modifierGroupIds.filter((id) => id !== g.id)
                            : [...form.modifierGroupIds, g.id],
                        )
                      }
                      className={
                        on
                          ? 'h-8 rounded-lg bg-ink px-3 text-[13px] text-on-ink'
                          : 'h-8 rounded-lg border border-line px-3 text-[13px] text-ink-soft hover:border-line-strong'
                      }
                    >
                      {g.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <Field label="Description" optional>
            {(id) => (
              <Textarea
                id={id}
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                maxLength={300}
                rows={2}
              />
            )}
          </Field>

          <label className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
            <span>
              <span className="block text-[13px] font-medium">Show on menu</span>
              <span className="block text-xs text-ink-faint">Hidden items can't be billed</span>
            </span>
            <Switch checked={form.isActive} onChange={(v) => set('isActive', v)} />
          </label>
        </form>

        {existing && can('inventory.manage') && (
          <div className="mt-8 border-t border-line pt-6">
            <p className="mb-1 text-[13px] font-medium">Recipe</p>
            <p className="mb-4 text-xs text-ink-faint">
              Ingredients for one plate. Saved separately.
            </p>
            <RecipeEditor item={existing} />
          </div>
        )}
      </Sheet>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Delete ${existing?.name ?? 'item'}?`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              Delete
            </Button>
          </>
        }
      >
        It will disappear from the menu. Past bills keep their copy.
      </Dialog>
    </>
  );
}

function PriceInput({
  value,
  onChange,
  className,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  id?: string;
}) {
  return (
    <div className={`relative ${className ?? ''}`}>
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-ink-faint">
        ₹
      </span>
      <Input
        id={id}
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (/^\d*\.?\d{0,2}$/.test(v)) onChange(v);
        }}
        inputMode="decimal"
        placeholder="0"
        className="tabular pl-7"
        aria-label="Price"
        required
      />
    </div>
  );
}
