'use client';

import { formatMoney, ORDER_TYPES } from '@pos/shared';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import {
  ArrowLeft,
  ChefHat,
  Minus,
  MoreHorizontal,
  Percent,
  Plus,
  Printer,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FoodMark } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { newId } from '@/lib/id';
import type { Kot, Order, OrderItem, PosItem, PosMenu } from '@/lib/pos-types';
import { billHtml, kotHtml, printHtml } from '@/lib/print';
import { useSession } from '@/lib/session';
import { CustomerDialog, DiscountDialog, MoveTableDialog, ReasonDialog } from './dialogs';
import { ItemPicker, type Pick } from './item-picker';
import { MenuPanel } from './menu-panel';
import { PayDialog } from './pay-dialog';
import {
  type Draft,
  draftUnit,
  previewBill,
  useActiveOrders,
  useBillHeader,
  useOrder,
} from './use-pos';
import { usePosActions } from './actions';

type Panel = 'pay' | 'discount' | 'guest' | 'move' | 'void' | 'reopen' | 'leave' | null;

export function OrderScreen({
  orderId,
  menu,
  onClose,
}: {
  orderId: string;
  menu: PosMenu;
  onClose: () => void;
}) {
  const { can } = useSession();
  const { data: order } = useOrder(orderId);
  const active = useActiveOrders();
  const actions = usePosActions(menu);
  const header = useBillHeader();

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [picking, setPicking] = useState<PosItem | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [cancelling, setCancelling] = useState<OrderItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<'menu' | 'ticket'>('menu');
  const [more, setMore] = useState(false);

  const bill = useMemo(
    () => (order ? previewBill(order, drafts, menu) : null),
    [order, drafts, menu],
  );

  if (!order || !bill) {
    return (
      <div className="grid h-full place-items-center text-ink-faint">
        <Spinner />
      </div>
    );
  }

  const editable = order.status === 'OPEN';
  const closed = order.status === 'PAID' || order.status === 'VOID';
  const pending = order.items.filter((i) => i.status === 'PENDING');
  const hasUnsent = drafts.length > 0 || pending.length > 0;
  const lineCount =
    drafts.reduce((s, d) => s + d.quantity, 0) +
    order.items.filter((i) => i.status !== 'CANCELLED').length;

  // ---- actions -------------------------------------------------------------

  async function run<T>(label: string, task: () => Promise<T>) {
    setBusy(label);
    try {
      return await task();
    } catch (err) {
      toast.error(errorMessage(err));
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  async function saveDrafts() {
    const saved = await actions.sendLines(order!, drafts);
    setDrafts([]);
    return saved;
  }

  const printKots = (kots: Kot[]) => {
    if (menu.outlet.settings.printKot) kots.forEach((k) => printHtml(kotHtml(k), 'kot'));
  };

  const sendKot = () =>
    run('kot', async () => {
      const kots = await actions.sendKot(order, drafts);
      setDrafts([]);
      printKots(kots);
      toast.success(kots.length > 1 ? `${kots.length} KOTs sent` : `KOT #${kots[0].kotNo} sent`);
    });

  const printBill = () =>
    run('bill', async () => {
      const { order: billed, kots } = await actions.bill(order, drafts);
      setDrafts([]);
      printKots(kots);
      printHtml(billHtml(billed, { ...header, footer: menu.outlet.settings.billFooter }));
    });

  const openPayment = () =>
    run('pay', async () => {
      await saveDrafts();
      setPanel('pay');
    });

  const patch = (body: Parameters<typeof actions.update>[1]) =>
    run('patch', async () => {
      await actions.update(order, body);
      setPanel(null);
    });

  const changeQty = (item: OrderItem, quantity: number) =>
    run('qty', () => actions.setQuantity(order, item, quantity));

  function addDraft(item: PosItem, pick: Pick) {
    setPicking(null);
    setDrafts((list) => {
      const same = list.find(
        (d) =>
          d.item.id === item.id &&
          d.variantId === pick.variantId &&
          d.optionIds.join() === pick.optionIds.join() &&
          !d.notes &&
          !pick.notes,
      );
      if (same)
        return list.map((d) => (d === same ? { ...d, quantity: d.quantity + pick.quantity } : d));
      return [...list, { key: newId(), item, ...pick }];
    });
  }

  function onPick(item: PosItem) {
    if (!editable) return toast.error('Reopen the bill to add items');
    if (item.hasVariants || item.modifierGroups.length) return setPicking(item);
    addDraft(item, { optionIds: [], quantity: 1 });
  }

  function leave() {
    if (drafts.length) return setPanel('leave');
    onClose();
  }

  const busyTables = new Set((active.data ?? []).map((o) => o.tableId).filter(Boolean) as string[]);

  // ---- render ----------------------------------------------------------------

  const ticket = (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">
            {order.table ? `Table ${order.table.name}` : ORDER_TYPES[order.type]}
            <span className="ml-2 text-[13px] font-normal text-ink-faint">#{order.orderNo}</span>
          </p>
          <button
            onClick={() => !closed && setPanel('guest')}
            className="mt-0.5 flex max-w-full items-center gap-1 truncate text-xs text-ink-soft hover:text-ink"
          >
            <UserRound className="size-3 shrink-0" />
            {order.customerName || order.customerPhone || 'Add guest'}
            {order.covers ? ` · ${order.covers} guests` : ''}
          </button>
        </div>
        <div className="relative flex gap-1">
          {can('bill.discount') && editable && (
            <IconButton
              label="Discount"
              onClick={() => setPanel('discount')}
              active={Boolean(order.discount)}
            >
              <Percent className="size-4" />
            </IconButton>
          )}
          <IconButton label="More" onClick={() => setMore(!more)}>
            <MoreHorizontal className="size-4" />
          </IconButton>
          <AnimatePresence>
            {more && (
              <m.div
                className="absolute top-full right-0 z-30 mt-1 w-48 rounded-xl border border-line bg-card p-1 shadow-lg shadow-black/[0.06]"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                onClick={() => setMore(false)}
              >
                {order.type === 'DINE_IN' && !closed && (
                  <MenuItem onClick={() => setPanel('move')}>Move table</MenuItem>
                )}
                {!closed && <MenuItem onClick={() => setPanel('guest')}>Guest & notes</MenuItem>}
                <MenuItem
                  onClick={() =>
                    printHtml(
                      billHtml(order, { ...header, footer: menu.outlet.settings.billFooter }),
                    )
                  }
                >
                  {order.invoice ? 'Reprint bill' : 'Print estimate'}
                </MenuItem>
                {order.status === 'BILLED' && can('bill.void') && Number(order.paidTotal) === 0 && (
                  <MenuItem onClick={() => setPanel('reopen')}>Reopen bill</MenuItem>
                )}
                {order.status !== 'VOID' &&
                  (can('bill.void') || order.items.every((i) => i.status === 'PENDING')) && (
                    <MenuItem danger onClick={() => setPanel('void')}>
                      {order.items.length ? 'Void order' : 'Cancel order'}
                    </MenuItem>
                  )}
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {order.items.length === 0 && drafts.length === 0 && (
          <p className="px-6 py-16 text-center text-[13px] text-ink-faint">
            Tap items on the menu to add them
          </p>
        )}
        <ul>
          {order.items.map((item) => (
            <Line
              key={item.id}
              name={item.itemName}
              variant={item.variantName}
              foodType={item.foodType}
              modifiers={item.modifiers.map((x) => x.name)}
              notes={item.notes}
              quantity={Number(item.quantity)}
              amount={
                (Number(item.unitPrice) + Number(item.modifiersTotal)) * Number(item.quantity)
              }
              status={item.status}
              editable={editable && item.status === 'PENDING'}
              onQty={(q) => changeQty(item, q)}
              onCancel={
                editable &&
                item.status !== 'PENDING' &&
                item.status !== 'CANCELLED' &&
                can('order.cancel_item')
                  ? () => setCancelling(item)
                  : undefined
              }
            />
          ))}
          <AnimatePresence initial={false}>
            {drafts.map((d) => (
              <m.div
                key={d.key}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.16 }}
              >
                <Line
                  name={d.item.name}
                  variant={d.item.variants.find((v) => v.id === d.variantId)?.name ?? null}
                  foodType={d.item.foodType}
                  modifiers={d.item.modifierGroups
                    .flatMap((g) => g.options)
                    .filter((o) => d.optionIds.includes(o.id))
                    .map((o) => o.name)}
                  notes={d.notes ?? null}
                  quantity={d.quantity}
                  amount={draftUnit(d, order.type) * d.quantity}
                  status="NEW"
                  editable
                  onQty={(q) =>
                    setDrafts((list) =>
                      q <= 0
                        ? list.filter((x) => x.key !== d.key)
                        : list.map((x) => (x.key === d.key ? { ...x, quantity: q } : x)),
                    )
                  }
                />
              </m.div>
            ))}
          </AnimatePresence>
        </ul>
      </div>

      <div className="border-t border-line px-4 py-3">
        <dl className="tabular space-y-1 text-[13px] text-ink-soft">
          <Row label="Subtotal" value={bill.subtotal} />
          {bill.discount > 0 && (
            <Row
              label={`Discount${order.discount?.type === 'PERCENT' ? ` ${Number(order.discount.value)}%` : ''}`}
              value={-bill.discount}
            />
          )}
          {bill.serviceCharge > 0 && <Row label="Service charge" value={bill.serviceCharge} />}
          {bill.tax > 0 && (
            <Row label={menu.outlet.priceIncludesTax ? 'GST (included)' : 'GST'} value={bill.tax} />
          )}
          {bill.roundOff !== 0 && <Row label="Round off" value={bill.roundOff} />}
        </dl>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-sm font-medium">Total</span>
          <span className="tabular text-2xl font-semibold tracking-tight">
            {formatMoney(bill.total)}
          </span>
        </div>
        {Number(order.paidTotal) > 0 && !closed && (
          <p className="tabular mt-1 text-right text-xs text-ink-faint">
            {formatMoney(order.paidTotal)} paid
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-line p-3">
        {closed ? (
          <>
            <Button
              variant="secondary"
              size="lg"
              onClick={() =>
                printHtml(billHtml(order, { ...header, footer: menu.outlet.settings.billFooter }))
              }
            >
              <Printer className="size-4" /> Print
            </Button>
            <Button size="lg" onClick={onClose}>
              Done
            </Button>
          </>
        ) : (
          <>
            {can('order.take') && (
              <Button
                variant="secondary"
                size="lg"
                className={cn(!can('bill.settle') && 'col-span-2')}
                disabled={!hasUnsent || !editable}
                loading={busy === 'kot'}
                onClick={sendKot}
              >
                <ChefHat className="size-4" /> Send KOT
              </Button>
            )}
            {can('bill.settle') && (
              <Button
                variant="secondary"
                size="lg"
                className={cn(!can('order.take') && 'col-span-2')}
                disabled={lineCount === 0}
                loading={busy === 'bill'}
                onClick={printBill}
              >
                <Printer className="size-4" /> {order.status === 'BILLED' ? 'Reprint' : 'Bill'}
              </Button>
            )}
            {can('bill.settle') && (
              <Button
                size="lg"
                className="col-span-2"
                disabled={lineCount === 0}
                loading={busy === 'pay'}
                onClick={openPayment}
              >
                Pay {formatMoney(Math.max(bill.total - Number(order.paidTotal), 0))}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line bg-paper px-3 py-2 md:hidden">
        <button
          onClick={leave}
          className="grid size-9 place-items-center rounded-lg hover:bg-black/[0.04]"
          aria-label="Back"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="ml-auto flex rounded-[10px] bg-black/[0.045] p-[3px] text-[13px]">
          <button
            onClick={() => setView('menu')}
            className={cn('h-8 rounded-[8px] px-3', view === 'menu' && 'bg-card shadow-sm')}
          >
            Menu
          </button>
          <button
            onClick={() => setView('ticket')}
            className={cn('h-8 rounded-[8px] px-3', view === 'ticket' && 'bg-card shadow-sm')}
          >
            Order{' '}
            {lineCount > 0 && <span className="tabular ml-1 text-ink-faint">{lineCount}</span>}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div
          className={cn('min-w-0 flex-1 flex-col', view === 'menu' ? 'flex' : 'hidden', 'md:flex')}
        >
          <div className="hidden items-center gap-2 border-b border-line px-3 py-2 md:flex">
            <Button variant="ghost" size="sm" onClick={leave}>
              <ArrowLeft className="size-4" /> Tables
            </Button>
          </div>
          {editable ? (
            <>
              <div className="min-h-0 flex-1">
                <MenuPanel menu={menu} orderType={order.type} onPick={onPick} />
              </div>
              {lineCount > 0 && bill && (
                <div className="border-t border-line bg-paper p-3 md:hidden">
                  <Button className="w-full justify-between" onClick={() => setView('ticket')}>
                    <span>
                      View order <span className="tabular opacity-60">· {lineCount}</span>
                    </span>
                    <span className="tabular">{formatMoney(bill.total)}</span>
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="grid flex-1 place-items-center px-8 text-center text-sm text-ink-soft">
              {order.status === 'BILLED'
                ? 'Bill printed. Take payment, or reopen the bill to change items.'
                : order.status === 'PAID'
                  ? `Paid. ${order.payments.map((p) => `${p.method.toLowerCase()} ${formatMoney(p.amount)}`).join(', ')}`
                  : `Voided${order.voidReason ? `: ${order.voidReason}` : ''}`}
            </div>
          )}
        </div>
        <div
          className={cn(
            'w-full shrink-0 border-l border-line md:block md:w-[360px] xl:w-[400px]',
            view === 'ticket' ? 'block' : 'hidden',
          )}
        >
          {ticket}
        </div>
      </div>

      <ItemPicker
        item={picking}
        orderType={order.type}
        onClose={() => setPicking(null)}
        onAdd={addDraft}
      />

      <PayDialog
        order={order}
        total={bill.total}
        open={panel === 'pay'}
        onClose={() => setPanel(null)}
        onPay={(payments) => actions.pay(order, payments)}
        onPaid={(paid, change, print) => {
          setPanel(null);
          if (print)
            printHtml(billHtml(paid, { ...header, footer: menu.outlet.settings.billFooter }));
          toast.success(change > 0 ? `Paid. Return ${formatMoney(change)} change.` : 'Paid');
          if (paid.status === 'PAID') onClose();
        }}
      />

      <DiscountDialog
        order={order}
        open={panel === 'discount'}
        busy={busy === 'discount'}
        onClose={() => setPanel(null)}
        onSave={(body) =>
          run('discount', async () => {
            await actions.setDiscount(order, body);
            setPanel(null);
          })
        }
        onRemove={() =>
          run('discount', async () => {
            await actions.setDiscount(order, null);
            setPanel(null);
          })
        }
      />

      <CustomerDialog
        order={order}
        open={panel === 'guest'}
        busy={busy === 'patch'}
        onClose={() => setPanel(null)}
        onSave={patch}
      />

      <MoveTableDialog
        open={panel === 'move'}
        menu={menu}
        busyTables={busyTables}
        current={order.tableId}
        onClose={() => setPanel(null)}
        onMove={(tableId) => patch({ tableId })}
      />

      <ReasonDialog
        open={panel === 'void'}
        title={order.items.length ? `Void order #${order.orderNo}?` : 'Cancel this order?'}
        body={
          order.status === 'PAID'
            ? 'Payments will be marked refunded and stock put back.'
            : undefined
        }
        confirm={order.items.length ? 'Void' : 'Cancel order'}
        busy={busy === 'void'}
        onClose={() => setPanel(null)}
        onConfirm={(reason) =>
          run('void', async () => {
            await actions.voidOrder(order, reason);
            setDrafts([]);
            setPanel(null);
            onClose();
          })
        }
      />

      <ReasonDialog
        open={panel === 'reopen'}
        title="Reopen this bill?"
        body={`Invoice ${order.invoice?.invoiceNo ?? ''} will be cancelled and a new number issued when you bill again.`}
        confirm="Reopen"
        busy={busy === 'reopen'}
        onClose={() => setPanel(null)}
        onConfirm={(reason) =>
          run('reopen', async () => {
            await actions.reopen(order, reason);
            setPanel(null);
          })
        }
      />

      <ReasonDialog
        open={cancelling !== null}
        title={`Cancel ${cancelling?.itemName ?? ''}?`}
        body="It has already gone to the kitchen."
        confirm="Cancel item"
        busy={busy === 'cancel'}
        onClose={() => setCancelling(null)}
        onConfirm={(reason) =>
          run('cancel', async () => {
            await actions.cancelSent(order, cancelling!, reason);
            setCancelling(null);
          })
        }
      />

      <Dialog
        open={panel === 'leave'}
        onClose={() => setPanel(null)}
        title="Items not sent yet"
        actions={
          <>
            <Button
              variant="danger"
              onClick={() => {
                setDrafts([]);
                setPanel(null);
                onClose();
              }}
            >
              Discard
            </Button>
            <Button
              loading={busy === 'kot'}
              onClick={async () => {
                setPanel(null);
                await sendKot();
                onClose();
              }}
            >
              Send KOT
            </Button>
          </>
        }
      >
        {drafts.length} new {drafts.length === 1 ? 'item hasn’t' : 'items haven’t'} gone to the
        kitchen.
      </Dialog>
    </div>
  );
}

function Line({
  name,
  variant,
  foodType,
  modifiers,
  notes,
  quantity,
  amount,
  status,
  editable,
  onQty,
  onCancel,
}: {
  name: string;
  variant: string | null;
  foodType: OrderItem['foodType'];
  modifiers: string[];
  notes: string | null;
  quantity: number;
  amount: number;
  status: OrderItem['status'] | 'NEW';
  editable: boolean;
  onQty: (q: number) => void;
  onCancel?: () => void;
}) {
  const cancelled = status === 'CANCELLED';
  const label: Record<string, string> = {
    NEW: 'New',
    PENDING: 'Saved',
    SENT: 'Sent',
    PREPARING: 'Cooking',
    READY: 'Ready',
    SERVED: 'Served',
    CANCELLED: 'Cancelled',
  };

  return (
    <li className="group flex gap-3 border-b border-line/70 px-4 py-2.5 last:border-0">
      <FoodMark type={foodType} className="mt-1 size-3" />
      <div className="min-w-0 flex-1">
        <p className={cn('text-[13px] leading-snug', cancelled && 'text-ink-faint line-through')}>
          {name}
          {variant && <span className="text-ink-faint"> · {variant}</span>}
        </p>
        {(modifiers.length > 0 || notes) && (
          <p className="truncate text-xs text-ink-faint">
            {[modifiers.length ? `+ ${modifiers.join(', ')}` : '', notes ?? '']
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
        <div className="mt-1 flex items-center gap-2">
          {editable ? (
            <div className="flex items-center rounded-lg border border-line">
              <button
                onClick={() => onQty(quantity - 1)}
                className="grid size-7 place-items-center text-ink-soft hover:text-ink"
                aria-label="Less"
              >
                {quantity === 1 ? <Trash2 className="size-3.5" /> : <Minus className="size-3.5" />}
              </button>
              <span className="tabular w-6 text-center text-xs font-medium">{quantity}</span>
              <button
                onClick={() => onQty(quantity + 1)}
                className="grid size-7 place-items-center text-ink-soft hover:text-ink"
                aria-label="More"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          ) : (
            <span className="tabular text-xs text-ink-soft">× {quantity}</span>
          )}
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-medium',
              status === 'NEW'
                ? 'bg-ink text-white'
                : status === 'READY'
                  ? 'bg-veg/10 text-veg'
                  : 'bg-black/[0.05] text-ink-faint',
            )}
          >
            {label[status]}
          </span>
          {onCancel && (
            <button
              onClick={onCancel}
              className="ml-auto text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger"
              aria-label="Cancel item"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <span className={cn('tabular text-[13px]', cancelled && 'text-ink-faint line-through')}>
        {formatMoney(amount)}
      </span>
    </li>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt>{label}</dt>
      <dd>{value < 0 ? `−${formatMoney(-value)}` : formatMoney(value)}</dd>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'grid size-9 place-items-center rounded-lg transition-colors',
        active ? 'bg-ink text-white' : 'text-ink-soft hover:bg-black/[0.04] hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

function MenuItem({
  onClick,
  danger,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'block w-full rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-paper',
        danger && 'text-danger',
      )}
    >
      {children}
    </button>
  );
}
