/// <reference lib="webworker" />
/**
 * Music-import parser worker.
 *
 * Lives in a separate Web Worker so a parser exploit / pathological input cannot
 * touch the DOM, fetch arbitrary URLs, or hang the main thread. The page-side
 * harness (`import-client.ts`) terminates this worker on success, error, timeout,
 * or user cancel.
 *
 * Pipeline inside the worker:
 *   1. Sniff the file format from the head bytes.
 *   2. Find the registered parser for that format.
 *   3. Invoke `parse(...)` to produce an `ImportIR`.
 *   4. Validate the IR (clamp/sanitize/reject out-of-range data).
 *   5. Post the validated IR + warnings back to the page.
 *
 * Format parsers register themselves via side-effect imports of
 * `./register-parsers` (commented out until a parser exists). Foundation plan
 * leaves the registration import disabled — the worker dispatches "no parser
 * registered" errors until plan 2 lands the GP parser.
 */

// Import from the narrow `@fretwork/lib/import` subpath so the worker does
// NOT transitively evaluate the lib's main barrel — that barrel re-exports
// React components, Tone.js, and other DOM-touching modules whose top-level
// code references `window`/`document`, which a worker doesn't have.
import {
  findParserForFile,
  sniffFormat,
  validateImportIR,
  ImportError,
  UnsupportedFormatError,
  ParserCrashedError,
  type FormatId,
  type ImportIR,
} from '@fretwork/lib/import';

// Side-effect registration import — parsers register themselves at module load.
import './register-parsers';

export type WorkerRequest = {
  kind: 'parse';
  bytes: ArrayBuffer;
  fileName: string;
};

export type WorkerResponse =
  | { kind: 'ok'; ir: ImportIR; warnings: string[]; format: FormatId }
  | { kind: 'err'; code: string; message: string };

declare const self: DedicatedWorkerGlobalScope;

self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    if (!req || req.kind !== 'parse') {
      throw new ImportError('bad_request', 'Unknown worker request kind');
    }

    const head = new Uint8Array(req.bytes.slice(0, 16));
    const format = sniffFormat(head, req.fileName);
    if (format === 'unknown') {
      throw new UnsupportedFormatError(`Could not detect format of "${req.fileName}"`);
    }

    const parser = findParserForFile({ name: req.fileName, head, format });
    if (!parser) {
      throw new UnsupportedFormatError(`No parser registered for "${format}"`);
    }

    const rawIr = await parser.parse({ bytes: req.bytes, fileName: req.fileName, format });
    const { ir, warnings } = validateImportIR(rawIr);
    const ok: WorkerResponse = { kind: 'ok', ir, warnings, format };
    self.postMessage(ok);
  } catch (err) {
    const e =
      err instanceof ImportError
        ? err
        : new ParserCrashedError(String((err as Error)?.message ?? err));
    const fail: WorkerResponse = { kind: 'err', code: e.code, message: e.message };
    self.postMessage(fail);
  }
});
