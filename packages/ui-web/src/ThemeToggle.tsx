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

/** Manual override on top of the light default (see apps/web/src/app/layout.tsx's THEME_INIT_SCRIPT). */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    setTheme(currentTheme());
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
