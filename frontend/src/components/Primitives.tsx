/** Reusable badges, error messages, and dialogs, including where keyboard focus returns after closing. */
import { useEffect, useRef, type ReactNode } from "react";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    // Remember where the keyboard was so closing the dialog returns the user there.
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? "dialog--wide" : ""}`}
      onCancel={onClose}
      aria-label={title}
    >
      <header className="dialog-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close panel"
        >
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}

export function ErrorNotice({ message }: { message: string }) {
  return message ? (
    <p className="notice notice--error" role="alert">
      {message}
    </p>
  ) : null;
}

export function SectionTitle({
  eyebrow,
  children,
}: {
  eyebrow?: string;
  children: ReactNode;
}) {
  return (
    <div className="section-title">
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h2>{children}</h2>
    </div>
  );
}
