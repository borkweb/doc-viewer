import { watch } from 'node:fs'

export type WatchFn = typeof watch

export interface WatchHandle {
  close: () => void
}

export function startWatch(
  _root: string,
  _onChange: () => void,
  _opts: { debounceMs?: number; watchFn?: WatchFn; platform?: NodeJS.Platform } = {}
): WatchHandle {
  return { close: () => {} }
}
