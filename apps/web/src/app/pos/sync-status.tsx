'use client';

import { CloudOff, RefreshCw, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import type { Mutation } from '@/offline/db';
import { useOfflineState } from '@/offline/state';
import { dismissFailed, failedMutations } from '@/offline/sync';

/** Tells staff the till is offline, still syncing, or has something it couldn't send. */
export function SyncStatus() {
  const state = useOfflineState();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState<Mutation[]>([]);

  useEffect(() => {
    if (open) failedMutations().then(setFailed);
  }, [open, state.failed]);

  if (state.failed > 0) {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="mr-1 inline-flex items-center gap-1.5 rounded-md bg-danger/[0.08] px-2 py-1 text-xs font-medium text-danger"
        >
          <TriangleAlert className="size-3.5" /> {state.failed} not synced
        </button>
        <Sheet
          open={open}
          onClose={() => setOpen(false)}
          title="Couldn't sync"
          description="The server refused these. Check each one and redo it by hand if needed."
        >
          <ul className="divide-y divide-line rounded-xl border border-line">
            {failed.map((m) => (
              <li key={m.seq} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">{m.label}</p>
                  <p className="text-xs text-danger">{m.error}</p>
                  <p className="text-xs text-ink-faint">
                    {new Date(m.createdAt).toLocaleString('en-IN', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => dismissFailed(m.seq!)}>
                  Dismiss
                </Button>
              </li>
            ))}
          </ul>
        </Sheet>
      </>
    );
  }

  if (!state.online) {
    return (
      <span className="mr-1 inline-flex items-center gap-1.5 rounded-md bg-ink px-2 py-1 text-xs font-medium text-white">
        <CloudOff className="size-3.5" /> Offline
        {state.pending > 0 && (
          <span className="tabular text-white/70">· {state.pending} waiting</span>
        )}
      </span>
    );
  }

  if (state.pending > 0) {
    return (
      <span className="mr-1 inline-flex items-center gap-1.5 rounded-md bg-black/[0.05] px-2 py-1 text-xs text-ink-soft">
        <RefreshCw className="size-3.5 animate-spin" /> Syncing {state.pending}
      </span>
    );
  }

  return null;
}
