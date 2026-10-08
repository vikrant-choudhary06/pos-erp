'use client';

import { formatMoney, type OrderType } from '@pos/shared';
import { Minus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { FoodMark } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import type { PosItem } from '@/lib/pos-types';
import { priceOf } from './use-pos';

export type Pick = { variantId?: string; optionIds: string[]; quantity: number; notes?: string };

/** Portion, add-ons, quantity and a note for one item. */
export function ItemPicker({
  item,
  orderType,
  onClose,
  onAdd,
}: {
  item: PosItem | null;
  orderType: OrderType;
  onClose: () => void;
  onAdd: (item: PosItem, pick: Pick) => void;
}) {
  const [variantId, setVariantId] = useState<string>();
  const [optionIds, setOptionIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!item) return;
    setVariantId(item.hasVariants ? item.variants[0]?.id : undefined);
    setOptionIds([]);
    setQuantity(1);
    setNotes('');
  }, [item]);

  // closed: render the empty sheet so the panel can animate out
  if (!item) {
    return (
      <Sheet open={false} onClose={onClose} title="">
        {null}
      </Sheet>
    );
  }

  const toggle = (groupId: string, optionId: string, max: number) => {
    const group = item.modifierGroups.find((g) => g.id === groupId)!;
    const inGroup = optionIds.filter((id) => group.options.some((o) => o.id === id));
    if (optionIds.includes(optionId))
      return setOptionIds(optionIds.filter((id) => id !== optionId));
    // single choice groups behave like radio buttons
    if (max === 1)
      return setOptionIds([...optionIds.filter((id) => !inGroup.includes(id)), optionId]);
    if (inGroup.length >= max) return;
    setOptionIds([...optionIds, optionId]);
  };

  const missing = item.modifierGroups.find(
    (g) => g.options.filter((o) => optionIds.includes(o.id)).length < g.minSelect,
  );
  const unit =
    priceOf(item, variantId, orderType) +
    item.modifierGroups
      .flatMap((g) => g.options)
      .filter((o) => optionIds.includes(o.id))
      .reduce((s, o) => s + Number(o.price), 0);

  return (
    <Sheet
      open
      onClose={onClose}
      title={item.name}
      footer={
        <div className="flex w-full items-center gap-3">
          <div className="flex items-center rounded-xl border border-line">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="grid size-10 place-items-center text-ink-soft hover:text-ink"
              aria-label="Less"
            >
              <Minus className="size-4" />
            </button>
            <span className="tabular w-8 text-center text-sm font-medium">{quantity}</span>
            <button
              onClick={() => setQuantity(Math.min(99, quantity + 1))}
              className="grid size-10 place-items-center text-ink-soft hover:text-ink"
              aria-label="More"
            >
              <Plus className="size-4" />
            </button>
          </div>
          <Button
            className="flex-1"
            size="lg"
            disabled={Boolean(missing) || (item.hasVariants && !variantId)}
            onClick={() =>
              onAdd(item, { variantId, optionIds, quantity, notes: notes.trim() || undefined })
            }
          >
            {missing
              ? `Choose ${missing.name.toLowerCase()}`
              : `Add · ${formatMoney(unit * quantity)}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-[13px] text-ink-soft">
          <FoodMark type={item.foodType} />{' '}
          {item.taxes.length
            ? item.taxes.map((t) => `${t.name} ${Number(t.rate)}%`).join(' + ')
            : 'No tax'}
        </div>

        {item.hasVariants && (
          <Group title="Portion">
            {item.variants.map((v) => (
              <Choice
                key={v.id}
                active={variantId === v.id}
                onClick={() => setVariantId(v.id)}
                label={v.name}
                price={formatMoney(priceOf(item, v.id, orderType))}
              />
            ))}
          </Group>
        )}

        {item.modifierGroups.map((g) => (
          <Group
            key={g.id}
            title={g.name}
            hint={
              g.minSelect > 0
                ? `Pick ${g.minSelect === g.maxSelect ? g.minSelect : `${g.minSelect}–${g.maxSelect}`}`
                : g.maxSelect > 1
                  ? `Up to ${g.maxSelect}`
                  : 'Optional'
            }
          >
            {g.options.map((o) => (
              <Choice
                key={o.id}
                active={optionIds.includes(o.id)}
                onClick={() => toggle(g.id, o.id, g.maxSelect)}
                label={o.name}
                price={Number(o.price) ? `+${formatMoney(o.price)}` : ''}
              />
            ))}
          </Group>
        ))}

        <div>
          <p className="mb-2 text-[13px] font-medium">Note for the kitchen</p>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={120}
            placeholder="Less spicy, no onion…"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {['Less spicy', 'Extra spicy', 'No onion', 'Jain', 'Pack separately'].map((n) => (
              <button
                key={n}
                onClick={() => setNotes(notes ? `${notes}, ${n.toLowerCase()}` : n)}
                className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-soft hover:border-line-strong hover:text-ink"
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-[13px] font-medium">{title}</p>
        {hint && <p className="text-xs text-ink-faint">{hint}</p>}
      </div>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

function Choice({
  active,
  onClick,
  label,
  price,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  price: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-[13px] transition-colors',
        active ? 'border-ink bg-ink text-white' : 'border-line hover:border-line-strong',
      )}
    >
      <span>{label}</span>
      <span className={cn('tabular text-xs', active ? 'text-white/70' : 'text-ink-faint')}>
        {price}
      </span>
    </button>
  );
}
