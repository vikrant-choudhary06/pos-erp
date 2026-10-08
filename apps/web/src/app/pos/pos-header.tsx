'use client';

import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { ChefHat, LayoutDashboard, Lock, LogOut, Wifi, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { APP_NAME, LogoMark } from '@/components/logo';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

export function PosHeader({ onHome }: { onHome: () => void }) {
  const { me, outletId, can } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const online = useOnline();
  const ref = useRef<HTMLDivElement>(null);
  const outlet = me.outlets.find((o) => o.id === outletId);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  // ending the session sends shared tills back to the PIN screen
  async function signOut() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    queryClient.clear();
    router.replace('/lock');
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-paper px-4">
      <button onClick={onHome} className="flex items-center gap-2" aria-label="Back to tables">
        <LogoMark />
        <span className="text-[15px] font-semibold tracking-tight">{APP_NAME}</span>
      </button>
      <span className="hidden text-[13px] text-ink-soft sm:block">{outlet?.name}</span>

      <div className="ml-auto flex items-center gap-1">
        {!online && (
          <span className="mr-2 inline-flex items-center gap-1.5 rounded-md bg-danger/[0.08] px-2 py-1 text-xs text-danger">
            <WifiOff className="size-3.5" /> Offline
          </span>
        )}
        {can('kitchen.view') && (
          <Link
            href="/kitchen"
            className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] text-ink-soft hover:bg-black/[0.04] hover:text-ink"
          >
            <ChefHat className="size-4" /> <span className="hidden sm:inline">Kitchen</span>
          </Link>
        )}

        <div ref={ref} className="relative">
          <button
            onClick={() => setOpen(!open)}
            className="flex h-9 items-center gap-2 rounded-lg pr-1 pl-2 hover:bg-black/[0.04]"
          >
            <span className="hidden text-right sm:block">
              <span className="block text-[13px] leading-tight font-medium">{me.user.name}</span>
              <span className="block text-[11px] leading-tight text-ink-faint">
                {me.user.role.name}
              </span>
            </span>
            <span className="grid size-7 place-items-center rounded-full bg-ink text-xs font-medium text-white">
              {me.user.name.slice(0, 1).toUpperCase()}
            </span>
          </button>
          <AnimatePresence>
            {open && (
              <m.div
                className="absolute top-full right-0 z-30 mt-1.5 w-52 rounded-xl border border-line bg-card p-1 shadow-lg shadow-black/[0.06]"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.14 }}
              >
                <MenuLink href="/dashboard" icon={LayoutDashboard}>
                  Dashboard
                </MenuLink>
                <button
                  onClick={signOut}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-paper"
                >
                  <Lock className="size-4 text-ink-faint" /> Lock / switch user
                </button>
                <button
                  onClick={async () => {
                    await api('/auth/logout', { method: 'POST' }).catch(() => {});
                    queryClient.clear();
                    router.replace('/login');
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-paper"
                >
                  <LogOut className="size-4 text-ink-faint" /> Sign out
                </button>
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}

function MenuLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: typeof Wifi;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] hover:bg-paper"
    >
      <Icon className="size-4 text-ink-faint" /> {children}
    </Link>
  );
}

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
