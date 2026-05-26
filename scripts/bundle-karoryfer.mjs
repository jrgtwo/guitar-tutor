#!/usr/bin/env node
/**
 * bundle-karoryfer — turn a Karoryfer "ord" sample folder into mp3 takes
 * ready for Tone.Sampler.
 *
 * Karoryfer's "Black And Green Guitars" pack ships .wav files named like
 * `twang_<note>_<dyn>_rr<n>.wav` where the note uses flat spelling AND a
 * +1 octave offset relative to scientific pitch (e.g. `e3` = MIDI 40 = E2).
 *
 * This script:
 *   1. Filters to a single dynamic; bundles one or all round-robin takes
 *      (default: mf + rr1..rr4 — all four takes).
 *   2. Converts each chosen .wav → .mp3 at 128kbps via ffmpeg-static.
 *   3. Renames to canonical scientific-pitch sharp-spelled filenames
 *      (e.g. `twang_eb3_mf_rr1.wav` → `Ds2.mp3`).
 *   4. Writes each RR take into its own subfolder: `bundled/rr1/`, `bundled/rr2/`,
 *      `bundled/rr3/`, `bundled/rr4/`. Single-RR mode writes to `bundled/rr<n>/`
 *      with the same layout (one subfolder, same shape).
 *
 * After this, point `trim-samples.mjs` at each `bundled/rr<n>/` folder to add
 * the defensive fade-in + leading-silence trim.
 *
 * Usage:
 *   node scripts/bundle-karoryfer.mjs <path-to-karoryfer-ord-folder>
 *   node scripts/bundle-karoryfer.mjs <path-to-ord-folder> --dyn f --rr 2
 *   node scripts/bundle-karoryfer.mjs <path-to-ord-folder> --rr all
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ffmpegPath from 'ffmpeg-static';

const OUTPUT_BITRATE = '128k';

// Karoryfer's flat-spelled note tokens → canonical sharp-spelled scientific
// pitch. Karoryfer's octave numbers are +1 vs scientific (verified against
// `pitch_keycenter` values in the bundled .sfz programs), so the octave shift
// happens separately in the loop below.
const NOTE_MAP = {
  c:  'C',
  db: 'Cs',
  d:  'D',
  eb: 'Ds',
  e:  'E',
  f:  'F',
  gb: 'Fs',
  g:  'G',
  ab: 'Gs',
  a:  'A',
  bb: 'As',
  b:  'B',
};

const CHROMATIC_ORDER = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];

function parseArgs(argv) {
  const args = { input: null, dyn: 'mf', rr: 'all' };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dyn') args.dyn = argv[++i];
    else if (a === '--rr') args.rr = argv[++i];
    else positional.push(a);
  }
  args.input = positional[0] ?? null;
  return args;
}

const { input, dyn, rr } = parseArgs(process.argv.slice(2));
if (!input) {
  console.error('Usage: node scripts/bundle-karoryfer.mjs <path-to-karoryfer-ord-folder> [--dyn p|mf|f] [--rr 1|2|3|4|all]');
  process.exit(1);
}

const rrList = rr === 'all' ? ['1', '2', '3', '4'] : [rr];
if (!rrList.every((n) => /^[1-4]$/.test(n))) {
  console.error(`Invalid --rr value: ${rr}. Use 1|2|3|4 or all.`);
  process.exit(1);
}

const inputDir = resolve(input);
if (!existsSync(inputDir) || !statSync(inputDir).isDirectory()) {
  console.error(`Folder not found: ${inputDir}`);
  process.exit(1);
}

const allFiles = readdirSync(inputDir);

function bundleOneRR(rrNum) {
  const outputDir = join(inputDir, 'bundled', `rr${rrNum}`);
  mkdirSync(outputDir, { recursive: true });

  // Karoryfer ord files: `twang_<note>_<dyn>_rr<n>.wav`. Match exactly the
  // requested dynamic + RR.
  const filenameRe = new RegExp(`^twang_([a-g]b?)(\\d)_${dyn}_rr${rrNum}\\.wav$`, 'i');

  const matches = [];
  for (const f of allFiles) {
    const m = f.match(filenameRe);
    if (!m) continue;
    const [, noteTok, karoryferOctaveStr] = m;
    const sciNote = NOTE_MAP[noteTok.toLowerCase()];
    if (!sciNote) {
      console.warn(`  skip (unknown note token): ${f}`);
      continue;
    }
    const sciOctave = Number(karoryferOctaveStr) - 1;
    matches.push({
      inputFile: f,
      outputFile: `${sciNote}${sciOctave}.mp3`,
      sciNote,
      sciOctave,
    });
  }

  if (matches.length === 0) {
    console.error(`No files matched 'twang_<note>_${dyn}_rr${rrNum}.wav' in ${inputDir}`);
    return { ok: 0, fail: 0, outputDir, empty: true };
  }

  matches.sort((a, b) => {
    if (a.sciOctave !== b.sciOctave) return a.sciOctave - b.sciOctave;
    return CHROMATIC_ORDER.indexOf(a.sciNote) - CHROMATIC_ORDER.indexOf(b.sciNote);
  });

  console.log(`\n── rr${rrNum} ── ${matches.length} samples`);
  console.log(`   → ${outputDir}`);

  let ok = 0;
  let fail = 0;
  for (const m of matches) {
    const inPath = join(inputDir, m.inputFile);
    const outPath = join(outputDir, m.outputFile);
    const result = spawnSync(
      ffmpegPath,
      [
        '-y',
        '-loglevel', 'error',
        '-i', inPath,
        '-codec:a', 'libmp3lame',
        '-b:a', OUTPUT_BITRATE,
        outPath,
      ],
      { encoding: 'utf8' },
    );
    if (result.status === 0) {
      const inKb = (statSync(inPath).size / 1024).toFixed(1);
      const outKb = (statSync(outPath).size / 1024).toFixed(1);
      console.log(`  ✓ ${m.inputFile.padEnd(28)} → ${m.outputFile.padEnd(8)}  ${inKb}KB → ${outKb}KB`);
      ok++;
    } else {
      console.log(`  ✗ ${m.inputFile}  ffmpeg failed: ${result.stderr?.trim() || 'unknown error'}`);
      fail++;
    }
  }

  return { ok, fail, outputDir, empty: false };
}

console.log(`Bundling ${rrList.length === 1 ? `rr${rrList[0]}` : 'rr1..rr4'} (dyn=${dyn})`);
console.log(`  from: ${inputDir}`);

const results = rrList.map(bundleOneRR);
const totalOk = results.reduce((s, r) => s + r.ok, 0);
const totalFail = results.reduce((s, r) => s + r.fail, 0);

console.log(`\nDone: ${totalOk} bundled, ${totalFail} failed across ${rrList.length} take(s).`);
console.log(`\nNext: trim each subfolder:`);
for (const r of results) {
  if (!r.empty) console.log(`  node scripts/trim-samples.mjs "${r.outputDir}"`);
}
if (totalFail > 0 || results.every((r) => r.empty)) process.exit(1);
