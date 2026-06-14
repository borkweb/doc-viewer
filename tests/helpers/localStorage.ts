// Shared deterministic localStorage stub for renderer tests. setup-dom.ts does NOT
// register a localStorage global; session.ts/theme.ts use the bare global. A test calls
// stubLocalStorage() (optionally seeding 'curator.session') and MUST invoke the returned
// teardown in afterEach to restore the original global.
export function stubLocalStorage(seed?: unknown): () => void {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const store = new Map<string, string>()
  if (seed !== undefined) store.set('curator.session', JSON.stringify(seed))
  const stub = {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => store.clear(),
    key: () => null,
    get length() { return store.size }
  } as unknown as Storage
  Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true, writable: true })
  return () => {
    if (prior) Object.defineProperty(globalThis, 'localStorage', prior)
    else delete (globalThis as { localStorage?: unknown }).localStorage
  }
}
