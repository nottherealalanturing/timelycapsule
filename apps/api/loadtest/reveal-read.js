// T-22 k6 load test — the HTTP half.
//
// The scheduler's drain has no HTTP surface of its own (it's a background
// worker loop, not an endpoint), so k6 can't drive it directly. What k6 CAN
// drive, and what actually is real HTTP load during a mass-unlock event, is
// recipients hitting their reveal links as capsules unlock around them —
// this simulates that: a mix of capsules that are still locked and capsules
// that have just unlocked, hit concurrently for the length of the seeded
// 60-second unlock window.
//
// Run alongside `wait-for-drain.ts` against a real API process:
//   NODE_ENV=test k6 run --duration 90s --vus 50 loadtest/reveal-read.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const tokens = JSON.parse(open('./tokens.json'));
const BASE_URL = __ENV.BASE_URL || 'http://localhost:4001';

export const options = {
  vus: 50,
  duration: '90s',
  thresholds: {
    // The reveal read itself must stay fast under this load regardless of
    // how busy the promoter/worker are hammering the same database.
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const token = tokens[Math.floor(Math.random() * tokens.length)];
  const res = http.get(`${BASE_URL}/v1/r/${token}`);
  // `locked` (200, pre-unlock) and `unlocked` (200, post-unlock) are both
  // correct responses here — which one a given token returns depends on
  // whether the promoter has reached it yet. Only a hard failure is wrong.
  check(res, {
    'status is 200': (r) => r.status === 200,
    'has a status field': (r) => {
      try {
        return typeof JSON.parse(r.body).status === 'string';
      } catch {
        return false;
      }
    },
  });
  sleep(0.1);
}
