'use client';

import { formatMoney } from '@pos/shared';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { Pencil, Plus, Search } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { PageHeader } from '@/components/shell/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Badge, EmptyState, FoodMark, Skeleton } from '@/components/ui/misc';
import { Tabs } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/session';
import type { Category, MenuItem } from '@/lib/types';
import { AddOns } from './add-ons';
import { CategorySheet } from './category-sheet';
import { ItemSheet } from './item-sheet';

export default function MenuPage() {
  const { can } = useSession();
  const editable = can('menu.manage');

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const query = useDeferredValue(search.trim().toLowerCase());

  const [editingItem, setEditingItem] = useState<MenuItem | 'new' | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | 'new' | null>(null);

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<Category[]>('/menu/categories'),
  });
  const items = useQuery({
    queryKey: ['menu-items'],
    queryFn: () => api<MenuItem[]>('/menu/items'),
  });

  // menus are small, filtering on the client keeps search instant
  const visible = useMemo(() => {
    return (items.data ?? []).filter((item) => {
      if (categoryId && item.category.id !== categoryId) return false;
      if (!query) return true;
      return (
        item.name.toLowerCase().includes(query) || item.shortCode?.toLowerCase().startsWith(query)
      );
    });
  }, [items.data, categoryId, query]);

  const noCategories = categories.isSuccess && categories.data.length === 0;
  const [view, setView] = useState<'items' | 'addons'>('items');

  return (
    <>
      <PageHeader
        title="Menu"
        description="Shared across all your outlets."
        actions={
          editable &&
          view === 'items' && (
            <Button onClick={() => setEditingItem('new')} disabled={noCategories}>
              <Plus className="size-4" /> Add item
            </Button>
          )
        }
      />

      <Tabs
        className="mb-6"
        value={view}
        onChange={setView}
        options={[
          { value: 'items', label: 'Items' },
          { value: 'addons', label: 'Add-ons' },
        ]}
      />

      {view === 'addons' ? (
        <AddOns />
      ) : noCategories ? (
        <EmptyState
          title="Start with a category"
          body="Group your dishes, like Starters, Main course or Beverages."
          action={
            editable && (
              <Button onClick={() => setEditingCategory('new')}>
                <Plus className="size-4" /> Add category
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-[200px_1fr]">
          <aside>
            <div className="flex items-center justify-between px-2.5 pb-2">
              <p className="text-xs font-medium tracking-wide text-ink-faint uppercase">
                Categories
              </p>
              {editable && (
                <button
                  onClick={() => setEditingCategory('new')}
                  className="rounded-md p-1 text-ink-faint hover:bg-ink/[0.04] hover:text-ink"
                  aria-label="Add category"
                >
                  <Plus className="size-3.5" />
                </button>
              )}
            </div>

            <ul className="flex gap-1 overflow-x-auto pb-2 md:flex-col md:overflow-visible md:pb-0">
              <CategoryButton
                active={categoryId === null}
                onClick={() => setCategoryId(null)}
                label="All items"
                count={items.data?.length}
              />
              {categories.isLoading &&
                Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="m-1 h-7" />)}
              {categories.data?.map((category) => (
                <CategoryButton
                  key={category.id}
                  active={categoryId === category.id}
                  onClick={() => setCategoryId(category.id)}
                  label={category.name}
                  count={category._count.items}
                  onEdit={editable ? () => setEditingCategory(category) : undefined}
                />
              ))}
            </ul>
          </aside>

          <section className="min-w-0">
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or short code"
                className="pl-9"
              />
            </div>

            {items.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <EmptyState
                title={query ? 'Nothing matches that search' : 'No items here yet'}
                action={
                  editable &&
                  !query && (
                    <Button variant="secondary" onClick={() => setEditingItem('new')}>
                      <Plus className="size-4" /> Add item
                    </Button>
                  )
                }
              />
            ) : (
              <ul className="overflow-hidden rounded-2xl border border-line bg-card">
                <AnimatePresence initial={false}>
                  {visible.map((item) => (
                    <m.li
                      key={item.id}
                      layout="position"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="border-b border-line last:border-0"
                    >
                      <ItemRow
                        item={item}
                        onClick={editable ? () => setEditingItem(item) : undefined}
                      />
                    </m.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </section>
        </div>
      )}

      <ItemSheet
        item={editingItem}
        defaultCategoryId={categoryId}
        categories={categories.data ?? []}
        onClose={() => setEditingItem(null)}
      />
      <CategorySheet
        category={editingCategory}
        onClose={() => setEditingCategory(null)}
        onDeleted={(id) => id === categoryId && setCategoryId(null)}
      />
    </>
  );
}

function CategoryButton({
  active,
  label,
  count,
  onClick,
  onEdit,
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
  onEdit?: () => void;
}) {
  return (
    <li className="group relative shrink-0">
      <button
        onClick={onClick}
        className={cn(
          'flex h-8 w-full items-center justify-between gap-3 rounded-lg px-2.5 text-left text-[13px] transition-colors',
          active ? 'bg-ink/[0.055] font-medium text-ink' : 'text-ink-soft hover:text-ink',
        )}
      >
        <span className="truncate">{label}</span>
        <span
          className={cn('tabular text-xs text-ink-faint', onEdit && 'md:group-hover:opacity-0')}
        >
          {count ?? ''}
        </span>
      </button>
      {onEdit && (
        <button
          onClick={onEdit}
          className="absolute top-1/2 right-1.5 hidden -translate-y-1/2 rounded p-1 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink md:block"
          aria-label={`Edit ${label}`}
        >
          <Pencil className="size-3" />
        </button>
      )}
    </li>
  );
}

function ItemRow({ item, onClick }: { item: MenuItem; onClick?: () => void }) {
  const prices = item.hasVariants
    ? item.variants.map((v) => Number(v.price))
    : [Number(item.basePrice)];
  const min = Math.min(...prices);
  const max = Math.max(...prices);

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors enabled:hover:bg-paper/60"
    >
      <FoodMark type={item.foodType} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={cn('truncate text-sm', !item.isActive && 'text-ink-faint')}>{item.name}</p>
          {item.shortCode && <Badge tone="muted">{item.shortCode}</Badge>}
          {!item.isActive && <Badge>Hidden</Badge>}
        </div>
        <p className="truncate text-xs text-ink-faint">
          {item.category.name}
          {item.hasVariants && ` · ${item.variants.map((v) => v.name).join(' / ')}`}
          {item.taxGroup && ` · ${item.taxGroup.name}`}
        </p>
      </div>
      <p className="tabular text-sm">
        {min === max ? formatMoney(min) : `${formatMoney(min)} – ${formatMoney(max)}`}
      </p>
    </button>
  );
}
