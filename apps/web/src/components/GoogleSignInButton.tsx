'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void;
          renderButton: (parent: HTMLElement, options: { theme: string; size: string; width?: number }) => void;
        };
      };
    };
  }
}

export interface GoogleSignInButtonProps {
  onCredential: (idToken: string) => void;
}

// GSI's own documented range — passing a value outside it is a silent no-op
// on Google's side (the button falls back to some internal default), so the
// measured width is clamped here rather than handed through raw.
const GSI_MIN_WIDTH = 200;
const GSI_MAX_WIDTH = 400;

/**
 * Google Identity Services button — 02-UX-DESIGN.md §5.2 ("Apple + Google
 * buttons first").
 *
 * `renderButton`'s `width` is a hard pixel value baked into the iframe GSI
 * returns — there is no percentage or `auto`. A fixed `336` overflowed the
 * signup/login card on any viewport narrower than ~368px (the card's own
 * padding included), which is every phone in portrait; found via the
 * rendered iframe's own bounding box (336px wide inside a 263–281px
 * container at 375–393px), not by guessing a smaller constant. Measuring the
 * actual container and re-rendering on resize is the fix that stays correct
 * at any width instead of picking a new number that will drift again.
 */
export function GoogleSignInButton({ onCredential }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Mirrors the latest callback into a ref so the init effect below can stay
  // mount-only ([] deps) without going stale — callers pass a plain inline
  // function (a fresh reference every render), which previously sat in the
  // effect's dependency array and caused initialize()/renderButton() to
  // re-run on every parent re-render, stacking a new Google-rendered
  // button/iframe into the same container each time rather than replacing
  // it. That's what made clicks flaky in practice: a stale, already-
  // superseded button could still be the one actually receiving the click.
  const onCredentialRef = useRef(onCredential);
  useEffect(() => {
    onCredentialRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID;
    const container = containerRef.current;
    if (!clientId || !container) return;

    let initialized = false;

    function renderAtCurrentWidth() {
      if (!window.google || !container) return;
      const measured = container.getBoundingClientRect().width;
      const width = Math.round(Math.min(GSI_MAX_WIDTH, Math.max(GSI_MIN_WIDTH, measured)));

      if (!initialized) {
        window.google.accounts.id.initialize({
          client_id: clientId!,
          callback: (response) => onCredentialRef.current(response.credential),
        });
        initialized = true;
      }
      // renderButton() only appends, it never replaces or resizes an
      // existing iframe — clearing first is what makes re-rendering at a
      // new width (on resize/rotate) actually take effect.
      container.innerHTML = '';
      window.google.accounts.id.renderButton(container, {
        theme: 'outline',
        size: 'large',
        width,
      });
    }

    // The container has zero width until layout settles (e.g. behind the
    // auth card's own mount), so width changes — not just viewport
    // resize — are what this needs to react to.
    const observer = new ResizeObserver(() => renderAtCurrentWidth());
    observer.observe(container);

    let script: HTMLScriptElement | null = null;
    if (window.google) {
      renderAtCurrentWidth();
    } else {
      script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = renderAtCurrentWidth;
      document.head.appendChild(script);
    }

    return () => {
      observer.disconnect();
      script?.remove();
    };
  }, []);

  if (!process.env.NEXT_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID) {
    return null;
  }

  return <div ref={containerRef} className="flex w-full justify-center [&>div]:max-w-full" />;
}
