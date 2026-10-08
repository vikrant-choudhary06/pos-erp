import type { FoodType } from '@pos/shared';
import { cn } from '@/lib/cn';

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'muted' | 'danger';
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-md px-1.5 text-[11px] font-medium',
        tone === 'neutral' && 'bg-ink/[0.05] text-ink-soft',
        tone === 'muted' && 'border border-line text-ink-faint',
        tone === 'danger' && 'bg-danger/[0.08] text-danger',
      )}
    >
      {children}
    </span>
  );
}

const foodColor: Record<FoodType, string> = {
  VEG: 'text-veg',
  NON_VEG: 'text-nonveg',
  EGG: 'text-egg',
};

/** The square veg / non-veg mark printed on Indian menus. */
export function FoodMark({ type, className }: { type: FoodType; className?: string }) {
  return (
    <span
      title={type === 'VEG' ? 'Veg' : type === 'EGG' ? 'Egg' : 'Non-veg'}
      className={cn(
        'inline-grid size-3.5 shrink-0 place-items-center rounded-[3px] border-[1.5px] border-current',
        foodColor[type],
        className,
      )}
    >
      {type === 'VEG' ? (
        <span className="size-1.5 rounded-full bg-current" />
      ) : (
        <span className="size-0 border-x-[3.5px] border-b-[6px] border-x-transparent border-b-current" />
      )}
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center">
      <p className="text-sm font-medium">{title}</p>
      {body && <p className="mt-1 max-w-xs text-[13px] text-ink-soft">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-ink/[0.05]', className)} />;
}
