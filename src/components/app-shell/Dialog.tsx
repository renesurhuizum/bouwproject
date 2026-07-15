"use client";

// Lichtgewicht vervanging van alert()/confirm(): een Promise-gebaseerde
// bevestigingsdialoog en korte meldingen (toast), in de app-stijl.
// Gebruik: const dlg = useDialog(); … await dlg.confirm({...}); dlg.notify("…");
// en render {dlg.element} onderaan de pagina.

import { useCallback, useRef, useState } from "react";

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ToastKind = "ok" | "error";

export function useDialog() {
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const [toast, setToast] = useState<{ message: string; kind: ToastKind } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setConfirmState(opts);
    });
  }, []);

  const close = useCallback((v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setConfirmState(null);
  }, []);

  const notify = useCallback((message: string, kind: ToastKind = "ok") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, kind });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const element = (
    <>
      {confirmState && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => close(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={confirmState.title}
            className="w-full max-w-sm rounded-card border border-line bg-paper-raised p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-bold text-ink-900">{confirmState.title}</h2>
            <p className="mt-2 text-sm text-ink-700">{confirmState.message}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                autoFocus
                onClick={() => close(false)}
                className="rounded-lg border border-line bg-paper-raised px-4 py-2 text-sm font-medium text-ink-700"
              >
                {confirmState.cancelLabel ?? "Annuleren"}
              </button>
              <button
                onClick={() => close(true)}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-paper-raised ${
                  confirmState.danger ? "bg-danger" : "bg-ink-900"
                }`}
              >
                {confirmState.confirmLabel ?? "Doorgaan"}
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-20 left-1/2 z-50 w-max max-w-[90vw] -translate-x-1/2 rounded-lg px-4 py-2.5 text-sm font-medium text-paper-raised shadow-lg ${
            toast.kind === "error" ? "bg-danger" : "bg-ink-900"
          }`}
        >
          {toast.message}
        </div>
      )}
    </>
  );

  return { confirm, notify, element };
}
