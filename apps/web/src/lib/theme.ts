'use client';

import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const KEY = 'theme';

/**
 * Runs in <head> before the page paints, so a dark screen never flashes
 * white first. Kept tiny and dependency free on purpose.
 */
export const THEME_SCRIPT = `try{var t=localStorage.getItem('${KEY}');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.classList.toggle('dark',t==='dark')}catch(e){}`;

function current(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  // follow the system setting until someone picks a theme here
  const media = matchMedia('(prefers-color-scheme: dark)');
  const onSystem = () => {
    if (readSaved()) return;
    apply(media.matches ? 'dark' : 'light');
  };
  media.addEventListener('change', onSystem);
  // and keep other tabs in step
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY && (e.newValue === 'light' || e.newValue === 'dark')) apply(e.newValue);
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    media.removeEventListener('change', onSystem);
    window.removeEventListener('storage', onStorage);
  };
}

function readSaved() {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function apply(theme: Theme) {
  const root = document.documentElement;
  // swap colours in one go instead of every element easing on its own
  root.classList.add('theme-switching');
  root.classList.toggle('dark', theme === 'dark');
  requestAnimationFrame(() =>
    requestAnimationFrame(() => root.classList.remove('theme-switching')),
  );
  listeners.forEach((l) => l());
}

export function useTheme() {
  const theme = useSyncExternalStore<Theme>(subscribe, current, () => 'light');

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // private mode: still switch for this visit
    }
    apply(next);
  }, []);

  return { theme, setTheme, toggle: () => setTheme(current() === 'dark' ? 'light' : 'dark') };
}
