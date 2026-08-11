// Opens one SSE connection to GET /api/stream and distributes events to whichever callback each
// caller registered for a given event name. Reconnects with backoff on drop; bumps `reconnectedAt`
// on every successful reconnect (not the first connect) so callers can refetch once to close any
// gap in the stream, instead of running a fallback poll that would defeat "no polling".
import { useEffect, useRef, useState } from 'react';
import type { SseEventName, SseEventPayloadMap } from '@flowforge/shared';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;

type Listener<K extends SseEventName> = (data: SseEventPayloadMap[K]) => void;

export interface LiveStream {
  connected: boolean;
  reconnectedAt: number;
  on: <K extends SseEventName>(event: K, listener: Listener<K>) => () => void;
}

export function useLiveStream(): LiveStream {
  const [connected, setConnected] = useState(false);
  const [reconnectedAt, setReconnectedAt] = useState(0);
  const listenersRef = useRef(new Map<SseEventName, Set<Listener<SseEventName>>>());

  useEffect(() => {
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = RECONNECT_BASE_MS;
    let hasConnectedBefore = false;
    let cancelled = false;

    const eventNames: SseEventName[] = ['run.queued', 'run.started', 'run.log', 'run.finished', 'worker.updated', 'stats.tick'];

    const connect = () => {
      source = new EventSource(new URL('/api/stream', API_BASE_URL));

      source.onopen = () => {
        if (cancelled) return;
        setConnected(true);
        retryDelay = RECONNECT_BASE_MS;
        if (hasConnectedBefore) setReconnectedAt(Date.now());
        hasConnectedBefore = true;
      };

      source.onerror = () => {
        if (cancelled) return;
        setConnected(false);
        source?.close();
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, RECONNECT_MAX_MS);
      };

      for (const name of eventNames) {
        source.addEventListener(name, (event: MessageEvent<string>) => {
          if (cancelled) return;
          const data = JSON.parse(event.data) as SseEventPayloadMap[typeof name];
          listenersRef.current.get(name)?.forEach((listener) => listener(data));
        });
      }
    };

    connect();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      source?.close();
    };
  }, []);

  const on = <K extends SseEventName>(event: K, listener: Listener<K>): (() => void) => {
    const set = listenersRef.current.get(event) ?? new Set();
    set.add(listener as Listener<SseEventName>);
    listenersRef.current.set(event, set);
    return () => {
      set.delete(listener as Listener<SseEventName>);
    };
  };

  return { connected, reconnectedAt, on };
}
