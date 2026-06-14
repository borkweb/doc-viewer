import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export type SpawnFn = typeof spawn

export interface CloneOptions {
  source: string // normalized https url
  ref?: string // omit for the repo's default branch
  signal?: AbortSignal
  spawnFn?: SpawnFn
}

// SECURITY: git is invoked with an argument ARRAY (never a shell string). The
// `--` separator prevents a malicious source/ref from being parsed as a flag.
// Shallow (`--depth 1 --single-branch --no-tags`); no submodule recursion (git
// does not recurse submodules unless asked). GIT_TERMINAL_PROMPT=0 disables
// interactive credential prompts.
export function buildGitArgs(source: string, ref: string | undefined, dest: string): string[] {
  const args = ['clone', '--depth', '1', '--single-branch', '--no-tags']
  if (ref) args.push('--branch', ref)
  args.push('--', source, dest)
  return args
}

interface RunResult {
  stdout: string
}

function runGit(
  spawnFn: SpawnFn,
  args: string[],
  signal?: AbortSignal
): Promise<RunResult> {
  return new Promise<RunResult>((resolve, reject) => {
    const child = spawnFn('git', args, {
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d) => { stdout += String(d) })
    child.stderr?.on('data', (d) => { stderr += String(d) })

    const onAbort = (): void => { child.kill('SIGTERM') }

    // Register terminal listeners BEFORE reacting to the signal: an already-aborted
    // signal kills the child synchronously, and a fast-killing child can emit
    // 'close' in the same tick — that event must not be lost.
    child.on('error', (err) => {
      signal?.removeEventListener('abort', onAbort)
      reject(err)
    })
    child.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort)
      if (signal?.aborted) {
        reject(new Error('Build canceled'))
        return
      }
      if (code === 0) resolve({ stdout })
      else reject(new Error(`git ${args[0]} failed (exit ${code ?? 'null'}): ${stderr.trim()}`))
    })

    if (signal) {
      if (signal.aborted) child.kill('SIGTERM')
      else signal.addEventListener('abort', onAbort)
    }
  })
}

// Shallow-clones into a fresh os.tmpdir() directory. On any failure/cancel the
// temp dir is removed before the error propagates; on success the caller owns
// (and must later delete) the returned path.
export async function cloneRepo(opts: CloneOptions): Promise<string> {
  const spawnFn = opts.spawnFn ?? spawn
  const dest = await mkdtemp(join(tmpdir(), 'dv-clone-'))
  try {
    await runGit(spawnFn, buildGitArgs(opts.source, opts.ref, dest), opts.signal)
  } catch (err) {
    await rm(dest, { recursive: true, force: true })
    throw err
  }
  return dest
}

// Resolve the checked-out branch name of a clone (used when no ref was requested
// so we record the real default branch as the ref name).
export async function resolveDefaultRef(dir: string, spawnFn: SpawnFn = spawn): Promise<string> {
  const { stdout } = await runGit(spawnFn, ['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'])
  return stdout.trim() || 'HEAD'
}
