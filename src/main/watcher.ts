import { watch, type FSWatcher } from 'node:fs'

export type WatchFn = (
  root: string,
  options: { recursive?: boolean },
  listener: () => void
) => Pick<FSWatcher, 'on' | 'close'>

export interface WatchHandle {
  close: () => void
}

export function startWatch(
  root: string,
  onChange: () => void,
  opts: { debounceMs?: number; watchFn?: WatchFn; platform?: NodeJS.Platform } = {}
): WatchHandle {
  const debounceMs = opts.debounceMs ?? 300
  const watchFn = opts.watchFn ?? (watch as WatchFn)
  const platform = opts.platform ?? process.platform
  const recursive = platform !== 'linux'
  if (!recursive) {
    console.warn(`[watcher] recursive fs.watch unsupported on ${platform}; nested changes may be missed.`)
  }

  let timer: ReturnType<typeof setTimeout> | null = null
  const schedule = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      onChange()
    }, debounceMs)
  }

  let watcher: Pick<FSWatcher, 'on' | 'close'> | null = null
  try {
    watcher = watchFn(root, { recursive }, () => schedule())
    watcher.on('error', () => {})
  } catch {
    console.warn(`[watcher] could not watch ${root}; live reindex disabled.`)
  }

  return {
    close: () => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      try {
        watcher?.close()
      } catch {
        // Watch teardown is best-effort.
      }
    }
  }
}
