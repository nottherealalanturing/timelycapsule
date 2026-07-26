'use client';

import { ToastProvider } from '@tc/ui-web';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AuthProvider } from '../lib/auth-context';
import { MasterKeyProvider } from '../lib/master-key-context';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MasterKeyProvider>
          <AuthProvider>{children}</AuthProvider>
        </MasterKeyProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
