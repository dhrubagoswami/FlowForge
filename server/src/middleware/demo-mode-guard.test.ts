// Small dedicated test for the demo-mode guard itself, since env.DEMO_MODE is parsed once at
// module load — demo.routes.test.ts mocks this guard as a pass-through for its own tests (the
// route responses, not the guard), so the guard's actual on/off behavior is only proven here.
import { describe, expect, it, vi } from 'vitest';

describe('demoModeGuard', () => {
  it('does nothing (lets the request through) when DEMO_MODE is true', async () => {
    vi.resetModules();
    vi.doMock('../config/env.ts', () => ({ env: { DEMO_MODE: true } }));
    const { demoModeGuard } = await import('./demo-mode-guard.ts');

    await expect(demoModeGuard({} as never, {} as never)).resolves.toBeUndefined();
  });

  it('throws a 403 DEMO_MODE_DISABLED AppError when DEMO_MODE is false', async () => {
    vi.resetModules();
    vi.doMock('../config/env.ts', () => ({ env: { DEMO_MODE: false } }));
    const { demoModeGuard } = await import('./demo-mode-guard.ts');

    await expect(demoModeGuard({} as never, {} as never)).rejects.toMatchObject({ code: 'DEMO_MODE_DISABLED', statusCode: 403 });
  });
});
