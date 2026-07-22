import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/errors.js';
import { errorHandler } from './error-handler.js';

function mockRes() {
  const res = {
    statusCode: 0,
    status: vi.fn(function (this: Response, code: number) {
      res.statusCode = code;
      return res as unknown as Response;
    }),
    json: vi.fn(),
  };
  return res as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe('errorHandler', () => {
  it('formats an ApiError using its own code/status/details', () => {
    const res = mockRes();
    const req = { id: 'req-1' } as unknown as Request;

    errorHandler(ApiError.notFound('capsule missing'), req, res, () => {});

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'not_found', message: 'capsule missing', details: undefined, requestId: 'req-1' },
    });
  });

  it('falls back to a generic 500 envelope for unknown errors', () => {
    const res = mockRes();
    const req = { id: 'req-2' } as unknown as Request;

    errorHandler(new Error('boom'), req, res, () => {});

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'internal_error', message: 'Something went wrong', requestId: 'req-2' },
    });
  });

  it('generates a requestId when none is present on req', () => {
    const res = mockRes();
    const req = {} as unknown as Request;

    errorHandler(ApiError.forbidden(), req, res, () => {});

    const call = res.json.mock.calls[0]?.[0];
    expect(call.error.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
