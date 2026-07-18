"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type BlcNoticeMeta = { label: string; value: string };

export function BlcNoticeOverlay({
  title,
  message,
  meta,
  children,
  primaryLabel = "Lanjut",
  secondaryLabel,
  onPrimary,
  onSecondary,
  onDismiss,
}: {
  title: string;
  message: string;
  meta?: BlcNoticeMeta[];
  children?: React.ReactNode;
  primaryLabel?: string;
  secondaryLabel?: string;
  onPrimary: () => void;
  onSecondary?: () => void;
  onDismiss?: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="blc-success-overlay" onClick={onDismiss ?? onPrimary}>
      <div className="blc-success-sheet" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p style={{ color: "#e8e0d0" }}>{message}</p>
        {meta && meta.length > 0 ? (
          <div className="blc-success-meta">
            {meta.map((row) => (
              <div key={row.label}>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </div>
            ))}
          </div>
        ) : null}
        {children}
        <div
          className="blc-actions"
          style={{ justifyContent: "center", marginTop: "1rem" }}
        >
          {secondaryLabel && onSecondary ? (
            <button type="button" className="blc-btn secondary" onClick={onSecondary}>
              {secondaryLabel}
            </button>
          ) : null}
          <button type="button" className="blc-btn" onClick={onPrimary}>
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
