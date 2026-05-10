/**
 * Vite dev plugin — handles `POST /api/lab-presets`.
 *
 * The Sound Lab POSTs the user's full override blob whenever Save fires (auto or
 * manual). This plugin reconciles the on-disk preset directory with the payload:
 *
 *   example/public/presets/<preset-id>.json    — one file per overridden preset
 *   example/public/presets/reverb.json         — reverb settings (if non-default)
 *
 * Files for presets that no longer differ from shipped defaults (cleared via
 * Reset) are deleted, so the directory always reflects the dev's current
 * working tunings. The directory ships with the production build (Vite serves
 * `public/` as static assets), so anonymous users on the deployed site pick up
 * the committed tunings automatically without us having to bake them into
 * `presets.ts` for every iteration.
 *
 * **Dev-only.** The plugin attaches its middleware via `configureServer`, which
 * Vite only invokes in `vite dev`. Production builds drop the endpoint, so the
 * lab's POST silently 404s and falls back to localStorage-only persistence.
 */
import type { Plugin } from 'vite';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ENDPOINT = '/api/lab-presets';
const RELATIVE_DIR = 'public/presets';

interface IncomingPayload {
  schemaVersion?: number;
  presets?: Record<string, unknown>;
  reverb?: unknown;
}

/**
 * Read the request body as JSON. Vite's middleware doesn't pre-parse it for us.
 * Caps at 256KB to avoid abuse — the override blob is normally a few KB.
 */
async function readJson(req: import('http').IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > 256 * 1024) {
        req.destroy();
        reject(new Error('payload too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text.length === 0 ? null : JSON.parse(text));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

export function labSavePlugin(): Plugin {
  return {
    name: 'fretwork:lab-save',
    apply: 'serve',
    configureServer(server) {
      // Resolve the on-disk directory once, relative to this plugin file.
      const dir = path.resolve(__dirname, RELATIVE_DIR);

      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'POST' || req.url?.split('?')[0] !== ENDPOINT) {
          return next();
        }

        let payload: IncomingPayload;
        try {
          payload = (await readJson(req)) as IncomingPayload;
        } catch {
          res.statusCode = 400;
          res.end('invalid JSON body');
          return;
        }
        if (!payload || payload.schemaVersion !== 1) {
          res.statusCode = 400;
          res.end('schemaVersion must be 1');
          return;
        }

        try {
          await fs.mkdir(dir, { recursive: true });

          // Reconcile preset files: write any that are in the payload, delete
          // any pre-existing files that aren't.
          const incoming = payload.presets ?? {};
          const incomingIds = new Set(Object.keys(incoming));
          const existing = await fs.readdir(dir).catch(() => [] as string[]);
          for (const file of existing) {
            if (!file.endsWith('.json')) continue;
            const id = file.replace(/\.json$/, '');
            // Don't delete reverb here — handled separately below.
            if (id === 'reverb') continue;
            if (!incomingIds.has(id)) {
              await fs.unlink(path.join(dir, file));
            }
          }
          for (const id of incomingIds) {
            const body = JSON.stringify(
              { schemaVersion: 1, preset: incoming[id] },
              null,
              2,
            ) + '\n';
            await fs.writeFile(path.join(dir, `${id}.json`), body, 'utf8');
          }

          // Reverb: write file iff payload.reverb is set; otherwise remove.
          const reverbFile = path.join(dir, 'reverb.json');
          if (payload.reverb) {
            const body = JSON.stringify(
              { schemaVersion: 1, reverb: payload.reverb },
              null,
              2,
            ) + '\n';
            await fs.writeFile(reverbFile, body, 'utf8');
          } else {
            await fs.rm(reverbFile, { force: true });
          }

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              ok: true,
              presetsWritten: incomingIds.size,
              reverbWritten: !!payload.reverb,
            }),
          );
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[fretwork:lab-save] write failed:', err);
          res.statusCode = 500;
          res.end('write failed');
        }
      });
    },
  };
}
