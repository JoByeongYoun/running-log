import { afterEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({ effects: [] as Array<() => void | (() => void)>, setWaiting: vi.fn() }));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: () => [null, hooks.setWaiting],
  useEffect: (effect: () => void | (() => void)) => hooks.effects.push(effect),
}));
import { ServiceWorker } from '@/components/pwa/ServiceWorker';

async function mount(type: string, waiting: object | null) {
  const registration = Object.assign(new EventTarget(), { waiting, installing: null as (EventTarget & { state: string; postMessage: ReturnType<typeof vi.fn> }) | null });
  const container = Object.assign(new EventTarget(), { controller: {}, register: vi.fn().mockResolvedValue(registration) });
  const reload = vi.fn();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubGlobal('navigator', { serviceWorker: container });
  vi.stubGlobal('performance', { getEntriesByType: () => [{ type }] });
  vi.stubGlobal('window', { location: { reload } });
  ServiceWorker();
  const cleanup = hooks.effects.pop()!();
  await Promise.resolve();
  return { container, registration, reload, cleanup };
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('service worker updates', () => {
  it('applies an already waiting update after a browser reload', async () => {
    const waiting = { postMessage: vi.fn() };
    const { container, reload, cleanup } = await mount('reload', waiting);
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    container.dispatchEvent(new Event('controllerchange'));
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledTimes(1);
    cleanup?.();
  });

  it('keeps an update waiting on ordinary navigation', async () => {
    const waiting = { postMessage: vi.fn() };
    const { cleanup } = await mount('navigate', waiting);
    expect(waiting.postMessage).not.toHaveBeenCalled();
    expect(hooks.setWaiting).toHaveBeenCalledWith(waiting);
    cleanup?.();
  });

  it('does not auto-apply updates discovered after the reloaded page is open', async () => {
    const { registration, cleanup } = await mount('reload', null);
    const worker = Object.assign(new EventTarget(), { state: 'installing', postMessage: vi.fn() });
    registration.installing = worker;
    registration.dispatchEvent(new Event('updatefound'));
    worker.state = 'installed';
    worker.dispatchEvent(new Event('statechange'));
    expect(hooks.setWaiting).toHaveBeenCalledWith(worker);
    expect(worker.postMessage).not.toHaveBeenCalled();
    cleanup?.();
  });

  it('removes the controller change listener on unmount', async () => {
    const { container, reload, cleanup } = await mount('reload', null);
    cleanup?.();
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).not.toHaveBeenCalled();
  });
});
