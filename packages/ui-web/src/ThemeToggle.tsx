'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  const attr = document.documentElement.getAttribute('data-theme');
  // The root layout's pre-paint script always writes one or the other —
  // there's no absent-attribute case to fall back from here anymore.
  return attr === 'dark' ? 'dark' : 'light';
}

function hasStoredPreference(): boolean {
  try {
    return localStorage.getItem('tc-theme') !== null;
  } catch {
    // Storage blocked (private mode, etc.) — treat as "nothing stored" so
    // the OS-follow behaviour below still applies rather than freezing.
    return false;
  }
}

/**
 * The single shared theme control — every page that needs a toggle imports
 * this one; there is intentionally no second implementation anywhere in the
 * app (Product Quality Pass, 2026-08 audit confirmed this and widened where
 * it's rendered, not what renders it).
 *
 * Manual override on top of the system default (see
 * apps/web/src/app/layout.tsx's THEME_INIT_SCRIPT, which owns the pre-paint
 * instant). As long as nothing has been explicitly chosen yet, this also
 * keeps following the OS live via `matchMedia` — otherwise a visitor who
 * first opened the app in light and later switches their OS to dark sees
 * stale light on every future visit until they touch this control
 * themselves, which isn't "following the system," it's following the first
 * visit.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    setTheme(currentTheme());
    if (hasStoredPreference() || typeof window.matchMedia !== 'function') return;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    function onSystemChange(e: MediaQueryListEvent) {
      const next: Theme = e.matches ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      setTheme(next);
    }
    mq.addEventListener('change', onSystemChange);
    return () => mq.removeEventListener('change', onSystemChange);
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('tc-theme', next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="rounded-[var(--radius-pill)] px-3 py-1.5 text-sm text-secondary hover:bg-[var(--color-bg-raised)]"
    >
      {theme === 'dark' ? '☀︎ Light' : '☾ Dark'}
    </button>
  );
}
