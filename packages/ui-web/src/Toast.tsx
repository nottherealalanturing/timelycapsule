'use client';

import { Toast as RadixToast } from 'radix-ui';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { cn } from './cn';

interface ToastItem {
  id: number;
  title: string;
  action?: { label: string; onClick: () => void };
  variant: 'default' | 'danger';
}

interface ToastContextValue {
  show: (title: string, options?: { action?: ToastItem['action']; variant?: ToastItem['variant'] }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Bottom-center, 4s auto-dismiss, max 1 visible, queued — 02-UX-DESIGN.md §6. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<ToastItem[]>([]);
  const [current, setCurrent] = useState<ToastItem | null>(null);

  const show = useCallback<ToastContextValue['show']>((title, options) => {
    const item: ToastItem = { id: Date.now() + Math.random(), title, variant: options?.variant ?? 'default', action: options?.action };
    setQueue((q) => [...q, item]);
  }, []);

  useEffect(() => {
    if (!current && queue.length > 0) {
      setCurrent(queue[0]!);
      setQueue((q) => q.slice(1));
    }
  }, [current, queue]);

  return (
    <ToastContext.Provider value={{ show }}>
      <RadixToast.Provider swipeDirection="down" duration={4000}>
        {children}
        {current ? (
          <RadixToast.Root
            className={cn(
              'rounded-[var(--radius-input)] px-4 py-3 shadow-[var(--shadow-md)] text-sm',
              current.variant === 'danger'
                ? 'bg-[var(--color-danger)] text-white'
                : 'bg-[var(--color-bg-raised)] text-foreground border border-[var(--color-text-secondary)]/20',
            )}
            onOpenChange={(open) => {
              if (!open) setCurrent(null);
            }}
          >
            <RadixToast.Description className="flex items-center gap-3">
              {current.title}
              {current.action ? (
                <RadixToast.Action asChild altText={current.action.label}>
                  <button onClick={current.action.onClick} className="font-medium underline underline-offset-2">
                    {current.action.label}
                  </button>
                </RadixToast.Action>
              ) : null}
            </RadixToast.Description>
          </RadixToast.Root>
        ) : null}
        <RadixToast.Viewport className="fixed bottom-4 left-1/2 z-50 flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 outline-none" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
