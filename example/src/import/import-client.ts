/**
 * Page-side harness for the parser worker.
 *
 * Responsibilities:
 *   - Enforce file-size cap *before* spawning the worker (no point spinning up
 *     isolation for a file we'll reject).
 *   - Spawn the worker, hand it an `ArrayBuffer` via transfer (zero-copy), and
 *     wait for `{ kind: 'ok' | 'err' }` back.
 *   - Apply a hard 10-second timeout: if the worker hasn't responded by then,
 *     `terminate()` it and reject with `ParserTimeoutError`. Pathological
 *     input cannot hang the page.
 *   - Honor an `AbortSignal` for user-initiated cancel (e.g., the import
 *     dialog's Cancel button).
 *
 * Anyone consuming this should treat the return as the *validated, sanitized,
 * sandboxed* IR — safe to render metadata strings, safe to map into the
 * Pattern/Composition model.
 */

import {
  MAX_FILE_SIZE,
  assertFileSize,
  ParserTimeoutError,
  ImportError,
  ParserCrashedError,
  type ImportIR,
  type FormatId,
} from '@fretwork/lib';
import type { WorkerRequest, WorkerResponse } from './parser-worker';

export const DEFAULT_TIMEOUT_MS = 10_000;

export interface ParseResult {
  ir: ImportIR;
  warnings: string[];
  format: FormatId;
}

export interface ParseOptions {
  timeoutMs?: number;
  /** Allows the caller to cancel the import (terminate worker + reject). */
  signal?: AbortSignal;
}

export async function parseInWorker(file: File, opts: ParseOptions = {}): Promise<ParseResult> {
  assertFileSize(file.size, MAX_FILE_SIZE);

  const bytes = await file.arrayBuffer();
  const worker = new Worker(new URL('./parser-worker.ts', import.meta.url), { type: 'module' });
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<ParseResult>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timer != null) clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      worker.terminate();
    };

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const onAbort = () =>
      finish(() => reject(new ImportError('cancelled', 'Import cancelled')));

    if (opts.signal?.aborted) {
      worker.terminate();
      reject(new ImportError('cancelled', 'Import cancelled'));
      return;
    }
    opts.signal?.addEventListener('abort', onAbort);

    timer = setTimeout(() => {
      finish(() => reject(new ParserTimeoutError(timeoutMs)));
    }, timeoutMs);

    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (msg.kind === 'ok') {
        finish(() => resolve({ ir: msg.ir, warnings: msg.warnings, format: msg.format }));
      } else {
        finish(() => reject(new ImportError(msg.code, msg.message)));
      }
    });

    worker.addEventListener('error', (event) => {
      const detail = (event as ErrorEvent).message || 'worker error';
      finish(() => reject(new ParserCrashedError(detail)));
    });

    const req: WorkerRequest = { kind: 'parse', bytes, fileName: file.name };
    // Transfer ownership of the buffer — main thread can no longer touch `bytes`
    // after this call, eliminating copy cost and any post-send mutation hazard.
    worker.postMessage(req, [bytes]);
  });
}
