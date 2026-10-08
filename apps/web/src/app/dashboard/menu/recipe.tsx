'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { Tabs } from '@/components/ui/tabs';
import { api, errorMessage } from '@/lib/api';
import { newId } from '@/lib/id';
import type { MenuItem } from '@/lib/types';
import { type BaseUnit, UNIT_LABEL } from '@/lib/units';

type Recipe = {
  id: string;
  variantId: string | null;
  ingredients: {
    inventoryItemId: string;
    quantity: string;
    inventoryItem: { name: string; baseUnit: BaseUnit };
  }[];
};

type Row = { key: string; inventoryItemId: string; quantity: string };

const ANY = 'any';

/** What one plate uses, so selling it takes stock out automatically. */
export function RecipeEditor({ item }: { item: MenuItem }) {
  const queryClient = useQueryClient();
  const [variant, setVariant] = useState<string>(
    item.hasVariants ? (item.variants[0]?.id ?? ANY) : ANY,
  );
  const [rows, setRows] = useState<Row[]>([]);

  const recipes = useQuery({
    queryKey: ['recipes', item.id],
    queryFn: () => api<Recipe[]>(`/inventory/recipes/${item.id}`),
  });
  const stock = useQuery({
    queryKey: ['inventory-items'],
    queryFn: () => api<{ id: string; name: string; baseUnit: BaseUnit }[]>('/inventory/items'),
  });

  useEffect(() => {
    if (!recipes.data) return;
    const recipe = recipes.data.find((r) => (r.variantId ?? ANY) === variant);
    setRows(
      recipe?.ingredients.map((i) => ({
        key: newId(),
        inventoryItemId: i.inventoryItemId,
        quantity: String(Number(i.quantity)),
      })) ?? [],
    );
  }, [recipes.data, variant]);

  const save = useMutation({
    mutationFn: () =>
      api(`/inventory/recipes/${item.id}`, {
        method: 'PUT',
        body: {
          variantId: variant === ANY ? null : variant,
          ingredients: rows
            .filter((r) => r.inventoryItemId && Number(r.quantity) > 0)
            .map((r) => ({ inventoryItemId: r.inventoryItemId, quantity: Number(r.quantity) })),
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes', item.id] });
      toast.success('Recipe saved');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const update = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  if (stock.data && stock.data.length === 0) {
    return (
      <p className="text-[13px] text-ink-soft">
        Add stock items on the Inventory page to build recipes.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {item.hasVariants && (
        <Tabs
          value={variant}
          onChange={setVariant}
          options={item.variants.map((v) => ({ value: v.id, label: v.name }))}
        />
      )}
      {rows.length === 0 && (
        <p className="text-[13px] text-ink-faint">
          No ingredients yet. Selling this won’t change stock.
        </p>
      )}
      {rows.map((r) => {
        const unit = stock.data?.find((s) => s.id === r.inventoryItemId)?.baseUnit;
        return (
          <div key={r.key} className="flex gap-2">
            <Select
              value={r.inventoryItemId}
              onChange={(e) => update(r.key, { inventoryItemId: e.target.value })}
              aria-label="Ingredient"
            >
              <option value="">Pick ingredient</option>
              {stock.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <div className="relative w-32 shrink-0">
              <Input
                value={r.quantity}
                onChange={(e) =>
                  /^\d*\.?\d{0,3}$/.test(e.target.value) &&
                  update(r.key, { quantity: e.target.value })
                }
                inputMode="decimal"
                className="tabular pr-10"
                aria-label="Quantity"
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-ink-faint">
                {unit ? UNIT_LABEL[unit] : ''}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setRows(rows.filter((x) => x.key !== r.key))}
              className="grid size-10 shrink-0 place-items-center rounded-lg text-ink-faint hover:text-ink"
              aria-label="Remove ingredient"
            >
              <X className="size-4" />
            </button>
          </div>
        );
      })}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={() => setRows([...rows, { key: newId(), inventoryItemId: '', quantity: '' }])}
        >
          <Plus className="size-3.5" /> Add ingredient
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={save.isPending}
          onClick={() => save.mutate()}
        >
          Save recipe
        </Button>
      </div>
    </div>
  );
}
