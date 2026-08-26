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

/**
 * The single shared theme control — every page that needs a toggle imports
 * this one; there is intentionally no second implementation anywhere in the
 * app (Product Quality Pass, 2026-08 audit confirmed this and widened where
 * it's rendered, not what renders it).
 *
 * Manual override on top of the light default (see apps/web/src/app/
 * layout.tsx's THEME_INIT_SCRIPT, which owns the pre-paint instant). This
 * does not follow the OS live — light is a deliberate default, not a stand-
 * in for the system preference, so an untouched visitor stays light
 * regardless of what their OS does after the page has loaded.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    setTheme(currentTheme());

    // Multiple instances of this control can be mounted at once (sidebar +
    // Settings, marketing header + /try, etc.), each with its own React
    // state. `data-theme` on <html> is the single source of truth, so
    // watching it directly keeps every instance's label in sync with
    // whichever one was actually clicked — without one, a second instance
    // would keep showing a stale label until its own next click or a full
    // reload, and could even read as a silent no-op (see toggle() below).
    const observer = new MutationObserver(() => setTheme(currentTheme()));
    observer.observe(document.documentElement, { attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  function toggle() {
    // Reads the DOM directly rather than trusting local state, since local
    // state can be stale relative to another mounted instance's last click.
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
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
