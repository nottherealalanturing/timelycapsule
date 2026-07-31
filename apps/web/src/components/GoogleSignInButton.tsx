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

/** Google Identity Services button — 02-UX-DESIGN.md §5.2 ("Apple + Google buttons first"). */
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
    if (!clientId || !containerRef.current) return;

    function render() {
      if (!window.google || !containerRef.current) return;
      // Defensive clear in case this ever runs more than once for any
      // other reason — renderButton() only appends, it never replaces.
      containerRef.current.innerHTML = '';
      window.google.accounts.id.initialize({
        client_id: clientId!,
        callback: (response) => onCredentialRef.current(response.credential),
      });
      window.google.accounts.id.renderButton(containerRef.current, {
        theme: 'outline',
        size: 'large',
        width: 336,
      });
    }

    if (window.google) {
      render();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, []);

  if (!process.env.NEXT_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID) {
    return null;
  }

  return <div ref={containerRef} />;
}
