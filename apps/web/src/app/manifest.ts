import type { MetadataRoute } from 'next';

/**
 * PWA manifest. Icons are the shipped Meridian V2 set (`design/brand/`, built
 * by `design/.build-brand.mjs`) — never re-drawn here.
 *
 * `theme_color`/`background_color` use the paper ground (`--i-ground` /
 * `--r-ground`, `05-IDENTITY-DECISION.md`), because light is the shipped
 * default for a visitor with no stored preference (`tokens.css`, the T-22
 * polish pass). This is the colour a browser/OS actually paints around the
 * app before first contentful paint and in the task switcher — it should
 * match what appears, not the dark register.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TimelyCapsule',
    short_name: 'TimelyCapsule',
    description: 'Write a letter, choose the day it opens, and it is kept until then — encrypted on your device before it leaves.',
    start_url: '/',
    display: 'standalone',
    background_color: '#E9EAE6',
    theme_color: '#E9EAE6',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
