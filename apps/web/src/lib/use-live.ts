'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

type Event = { type: 'order' | 'kot' | 'table' | 'shift' | 'menu' | 'ping'; id?: string };

const KEYS: Record<Exclude<Event['type'], 'ping'>, string[][]> = {
  order: [['orders-active'], ['order']],
  table: [['orders-active']],
  kot: [['kitchen']],
  shift: [['shift']],
  menu: [['pos-menu']],
};

/**
 * Listens to the outlet's server-sent events and refetches whatever changed,
 * so every till and the kitchen screen stay in step without polling.
 */
export function useLive(outletId: string | undefined, onEvent?: (e: Event) => void) {
  const queryClient = useQueryClient();
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (!outletId) return;
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout>;
    let closed = false;
    let reconnecting = false;

    const connect = () => {
      source = new EventSource(`/api/events?outletId=${outletId}`);
      source.onmessage = (msg) => {
        const event = JSON.parse(msg.data) as Event;
        if (event.type === 'ping') return;
        for (const key of KEYS[event.type] ?? []) queryClient.invalidateQueries({ queryKey: key });
        handler.current?.(event);
      };
      source.onerror = () => {
        source?.close();
        reconnecting = true;
        if (!closed) retry = setTimeout(connect, 3000);
      };
      source.onopen = () => {
        // catch up on anything missed while the connection was down
        if (reconnecting) queryClient.invalidateQueries();
        reconnecting = false;
      };
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(retry);
      source?.close();
    };
  }, [outletId, queryClient]);
}
