'use client';

import { formatMoney, type OrderType } from '@pos/shared';
import { Search } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { FoodMark } from '@/components/ui/misc';
import { cn } from '@/lib/cn';
import type { PosItem, PosMenu } from '@/lib/pos-types';
import { priceOf } from './use-pos';

const ALL = '__all';

export function MenuPanel({
  menu,
  orderType,
  onPick,
}: {
  menu: PosMenu;
  orderType: OrderType;
  onPick: (item: PosItem) => void;
}) {
  const [category, setCategory] = useState(ALL);
  const [search, setSearch] = useState('');
  const query = useDeferredValue(search.trim().toLowerCase());
  const input = useRef<HTMLInputElement>(null);

  // "/" jumps to search from anywhere on the till
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input, textarea, select');
      if (e.key === '/' && !typing) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const items = useMemo(() => {
    if (query) {
      const code = menu.items.filter((i) => i.shortCode?.toLowerCase() === query);
      const rest = menu.items.filter(
        (i) =>
          !code.includes(i) &&
          (i.name.toLowerCase().includes(query) || i.shortCode?.toLowerCase().startsWith(query)),
      );
      return [...code, ...rest];
    }
    return category === ALL ? menu.items : menu.items.filter((i) => i.categoryId === category);
  }, [menu.items, category, query]);

  const usedCategories = menu.categories.filter((c) =>
    menu.items.some((i) => i.categoryId === c.id),
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" />
          <input
            ref={input}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && items[0] && !items[0].outOfStock) {
                onPick(items[0]);
                setSearch('');
              }
              if (e.key === 'Escape') setSearch('');
            }}
            placeholder="Search or type a short code  ( / )"
            className="h-10 w-full rounded-[10px] border border-line bg-card pr-3 pl-9 text-sm outline-none placeholder:text-ink-faint focus:border-ink"
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {!query && (
          <nav className="w-36 shrink-0 overflow-y-auto border-r border-line py-2 sm:w-44">
            {[{ id: ALL, name: 'All' }, ...usedCategories].map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={cn(
                  'relative block w-full px-4 py-2.5 text-left text-[13px] transition-colors',
                  category === c.id ? 'font-medium text-ink' : 'text-ink-soft hover:text-ink',
                )}
              >
                {category === c.id && (
                  <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-ink" />
                )}
                {c.name}
              </button>
            ))}
          </nav>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {items.length === 0 ? (
            <p className="py-12 text-center text-sm text-ink-faint">
              {query ? 'Nothing matches' : 'No items in this category'}
            </p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
              {items.map((item) => {
                const prices = item.hasVariants
                  ? item.variants.map((v) => priceOf(item, v.id, orderType))
                  : [priceOf(item, undefined, orderType)];
                return (
                  <button
                    key={item.id}
                    disabled={item.outOfStock}
                    onClick={() => onPick(item)}
                    className={cn(
                      'flex min-h-[84px] flex-col justify-between rounded-xl border border-line bg-card p-3 text-left',
                      'transition-[border-color,transform] duration-100 hover:border-line-strong active:scale-[0.97]',
                      'disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100',
                    )}
                  >
                    <span className="flex items-start gap-2">
                      <FoodMark type={item.foodType} className="mt-0.5 size-3" />
                      <span className="line-clamp-2 text-[13px] leading-snug font-medium">
                        {item.name}
                      </span>
                    </span>
                    <span className="mt-2 flex items-end justify-between gap-2 text-xs">
                      <span className="tabular text-ink-soft">
                        {item.outOfStock
                          ? 'Sold out'
                          : prices.length > 1
                            ? `from ${formatMoney(Math.min(...prices))}`
                            : formatMoney(prices[0])}
                      </span>
                      {item.shortCode && (
                        <span className="font-mono text-[10px] text-ink-faint">
                          {item.shortCode}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
