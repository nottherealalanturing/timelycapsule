'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect } from 'react';

const CEREMONY_MS = 2200;
const REDUCED_MOTION_MS = 900;

export function SealCeremony({ open, onDone }: { open: boolean; onDone: () => void }) {
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(onDone, reducedMotion ? REDUCED_MOTION_MS : CEREMONY_MS);
    return () => clearTimeout(timer);
  }, [open, onDone, reducedMotion]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[var(--color-bg)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            aria-hidden
            className="flex h-24 w-24 items-center justify-center rounded-full bg-[var(--color-accent-gold,#c9a227)] text-3xl"
            initial={reducedMotion ? { opacity: 0 } : { scale: 0, rotate: -30 }}
            animate={reducedMotion ? { opacity: 1 } : { scale: [0, 1.15, 1], rotate: [-30, 8, 0] }}
            transition={{ duration: reducedMotion ? 0.3 : 1.1, ease: 'easeOut' }}
          >
            ✦
          </motion.div>
          <motion.p
            className="font-[var(--font-display)] text-xl text-foreground"
            initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reducedMotion ? 0.1 : 0.9, duration: 0.4 }}
          >
            Sealed.
          </motion.p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
