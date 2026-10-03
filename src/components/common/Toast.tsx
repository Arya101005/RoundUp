import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import clsx from 'clsx';
import { ToastContext, type ToastKind } from './toastContext';

interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
}

const kindIcon: Record<ToastKind, ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />,
  error: <AlertCircle className="h-4 w-4 text-danger" aria-hidden />,
  info: <Info className="h-4 w-4 text-accent" aria-hidden />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useMemo(() => ({ value: 1 }), []);

  const toast = useCallback((kind: ToastKind, title: string, description?: string) => {
    const id = nextId.value++;
    setItems((prev) => [...prev, { id, kind, title, description }]);
  }, [nextId]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastPrimitive.Provider duration={4000} swipeDirection="right">
        {items.map((item) => (
          <ToastPrimitive.Root
            key={item.id}
            onOpenChange={(open) => {
              if (!open) dismiss(item.id);
            }}
            className={clsx(
              'flex w-80 items-start gap-3 rounded-lg border border-line bg-elevated p-3.5 shadow-[var(--shadow-float)]',
              'data-[state=open]:animate-scale-in',
            )}
          >
            <div className="mt-0.5">{kindIcon[item.kind]}</div>
            <div className="min-w-0 flex-1">
              <ToastPrimitive.Title className="text-sm font-semibold text-ink">
                {item.title}
              </ToastPrimitive.Title>
              {item.description && (
                <ToastPrimitive.Description className="mt-0.5 text-xs text-muted">
                  {item.description}
                </ToastPrimitive.Description>
              )}
            </div>
            <ToastPrimitive.Close
              aria-label="Dismiss notification"
              className="rounded p-1 text-muted transition hover:text-ink"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
