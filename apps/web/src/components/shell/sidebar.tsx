'use client';

import type { Permission } from '@pos/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import {
  Armchair,
  ChartColumn,
  ChefHat,
  ContactRound,
  History,
  House,
  Hotel,
  LogOut,
  Menu,
  MonitorSmartphone,
  Package,
  ReceiptText,
  Settings,
  Truck,
  UsersRound,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/session';
import { forgetSession } from '@/offline/cache';
import { OutletSwitcher } from './outlet-switcher';

type NavItem = { href: string; label: string; icon: typeof House; permission?: Permission };

const NAV: NavItem[][] = [
  [
    { href: '/dashboard', label: 'Overview', icon: House },
    { href: '/pos', label: 'Open POS', icon: MonitorSmartphone, permission: 'order.take' },
    { href: '/kitchen', label: 'Kitchen screen', icon: ChefHat, permission: 'kitchen.view' },
  ],
  [
    { href: '/dashboard/orders', label: 'Orders', icon: ReceiptText, permission: 'reports.view' },
    { href: '/dashboard/reports', label: 'Reports', icon: ChartColumn, permission: 'reports.view' },
    {
      href: '/dashboard/customers',
      label: 'Customers',
      icon: ContactRound,
      permission: 'order.take',
    },
  ],
  [
    { href: '/dashboard/menu', label: 'Menu', icon: UtensilsCrossed },
    { href: '/dashboard/tables', label: 'Tables', icon: Armchair },
    {
      href: '/dashboard/inventory',
      label: 'Inventory',
      icon: Package,
      permission: 'inventory.manage',
    },
    {
      href: '/dashboard/purchases',
      label: 'Purchases',
      icon: Truck,
      permission: 'purchase.manage',
    },
  ],
  [
    { href: '/dashboard/staff', label: 'Staff', icon: UsersRound, permission: 'staff.manage' },
    { href: '/dashboard/activity', label: 'Activity', icon: History, permission: 'outlet.manage' },
    { href: '/dashboard/settings', label: 'Settings', icon: Settings, permission: 'outlet.manage' },
  ],
];

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // close the mobile drawer after navigating
  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-paper/90 px-5 py-3 backdrop-blur lg:hidden">
        <Logo href="/dashboard" />
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg p-2 text-ink-soft hover:bg-ink/[0.04]"
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </button>
      </div>

      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-line lg:block">
        <SidebarContent />
      </aside>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <m.div
              className="absolute inset-0 bg-black/20"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <m.aside
              className="absolute inset-y-0 left-0 w-64 bg-paper shadow-xl"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 42 }}
            >
              <button
                onClick={() => setOpen(false)}
                className="absolute top-4 right-3 rounded-lg p-1.5 text-ink-faint hover:text-ink"
                aria-label="Close menu"
              >
                <X className="size-4" />
              </button>
              <SidebarContent />
            </m.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

function SidebarContent() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { me, can } = useSession();
  const hotels = useQuery({
    queryKey: ['hotel-properties', me.business.id],
    queryFn: () => api<{ id: string }[]>('/pms/properties'),
    enabled: can('hotel.view') || can('hotel.housekeeping') || can('hotel.manage'),
  });

  const hotelNav: NavItem[] = hotels.data?.length
    ? [{ href: '/dashboard/hotel', label: 'Hotel', icon: Hotel }]
    : [];
  const groups = [...NAV, hotelNav]
    .map((group) => group.filter((item) => !item.permission || can(item.permission)))
    .filter((group) => group.length);
  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href);

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    await forgetSession();
    queryClient.clear();
    router.replace('/login');
  }

  return (
    <div className="flex h-full flex-col px-3 py-5">
      <div className="px-2">
        <Logo href="/dashboard" />
      </div>

      <div className="mt-6">
        <OutletSwitcher />
      </div>

      <nav className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto">
        {groups.map((group, i) => (
          <div key={i} className={cn('space-y-0.5', i > 0 && 'border-t border-line pt-3')}>
            {group.map(({ href, label, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors',
                    active ? 'text-ink' : 'text-ink-soft hover:text-ink',
                  )}
                >
                  {active && (
                    <m.span
                      layoutId="nav-active"
                      className="absolute inset-0 rounded-lg bg-ink/[0.055]"
                      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                    />
                  )}
                  <Icon className="relative size-4" strokeWidth={1.8} />
                  <span className="relative">{label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-4 border-t border-line pt-4">
        <div className="flex items-center gap-2.5 px-2">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-xs font-medium text-on-ink">
            {initials(me.user.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{me.user.name}</p>
            <p className="truncate text-xs text-ink-faint">{me.user.role.name}</p>
          </div>
          <ThemeToggle className="size-8 text-ink-faint" />
          <button
            onClick={logout}
            className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-ink/[0.04] hover:text-ink"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
