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

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID;
    if (!clientId || !containerRef.current) return;

    function render() {
      if (!window.google || !containerRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId!,
        callback: (response) => onCredential(response.credential),
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
  }, [onCredential]);

  if (!process.env.NEXT_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID) {
    return null;
  }

  return <div ref={containerRef} />;
}
