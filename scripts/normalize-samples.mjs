#!/usr/bin/env node
/**
 * normalize-samples — EBU R128 loudness-normalize a folder of .mp3 samples.
 *
 * Why this exists: sample-library files recorded at the same input gain still
 * vary by 6-10 dB in perceived loudness across the chromatic range (different
 * notes resonate differently; lower pitches read louder, harmonic content
 * shifts). Tone.Sampler triggers them all at the same velocity, so the
 * uneven source loudness audibly translates to "some notes are noticeably
 * louder than their neighbors." This script flattens that.
 *
 * Uses ffmpeg's `loudnorm` filter in two-pass linear mode (EBU R128 / LUFS):
 *   1. First pass: measure each file's integrated loudness, true peak, and
 *      loudness range. Print as JSON.
 *   2. Second pass: re-encode applying just enough linear gain to hit the
 *      target. `linear=true` means no dynamic compression — the gain change
 *      is uniform across the file, so dynamics within each sample are
 *      preserved. (Single-pass loudnorm uses a compressor; two-pass linear
 *      is cleaner for sample libraries.)
 *
 * Target: -16 LUFS integrated, -1.0 dBTP true-peak ceiling, 11 LU range.
 * These are reasonable defaults for a sample library — hot enough to be
 * useful, with enough headroom to avoid intersample-peak clipping.
 *
 * Usage:
 *   node scripts/normalize-samples.mjs <path-to-folder-of-mp3s>
 *
 * Behavior:
 *   - Reads every .mp3 in the given folder
 *   - Measures + normalizes each one independently
 *   - Writes the normalized copy to a `normalized/` subfolder
 *   - Originals are never modified
 *   - Re-encodes as mp3 at 192 kbps to match the rest of the pipeline
 *
 * After running: upload the normalized/ folder contents to your Supabase bucket
 * (overwriting the existing files at the bucket path).
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, mkdirSync, existsSync, statSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ffmpegPath from 'ffmpeg-static';

// EBU R128 targets — common values for sample libraries. Tweak if too hot/quiet.
const TARGET_I = -16;     // integrated loudness (LUFS)
const TARGET_TP = -1;     // true peak ceiling (dBTP)
const TARGET_LRA = 11;    // loudness range (LU)
const OUTPUT_BITRATE = '192k';

// Floor below which we treat the file as too quiet to safely amplify. If a
// file measures below this (essentially noise floor), normalizing would
// amplify the noise massively — fall back to just copying the original.
const MIN_MEASURED_I = -40;

const inputArg = process.argv[2];
if (!inputArg) {
  console.error('Usage: node scripts/normalize-samples.mjs <path-to-folder-of-mp3s>');
  process.exit(1);
}

const inputDir = resolve(inputArg);
if (!existsSync(inputDir) || !statSync(inputDir).isDirectory()) {
  console.error(`Folder not found: ${inputDir}`);
  process.exit(1);
}

const outputDir = join(inputDir, 'normalized');
mkdirSync(outputDir, { recursive: true });

const files = readdirSync(inputDir)
  .filter((f) => f.toLowerCase().endsWith('.mp3'))
  .sort();

if (files.length === 0) {
  console.error(`No .mp3 files in: ${inputDir}`);
  process.exit(1);
}

console.log(`Normalizing ${files.length} samples to ${TARGET_I} LUFS / ${TARGET_TP} dBTP / ${TARGET_LRA} LU range`);
console.log(`  from: ${inputDir}`);
console.log(`  to:   ${outputDir}\n`);

/** First pass — measure integrated loudness, true peak, loudness range.
 *  Returns the parsed JSON object or null if measurement failed. */
function measure(input) {
  const result = spawnSync(
    ffmpegPath,
    [
      '-hide_banner',
      '-i', input,
      '-af', `loudnorm=I=${TARGET_I}:TP=${TARGET_TP}:LRA=${TARGET_LRA}:print_format=json`,
      '-f', 'null', '-',
    ],
    { encoding: 'utf8' },
  );
  // ffmpeg prints the JSON block to stderr after analysis. Find the LAST
  // brace-delimited block (loudnorm prints exactly one).
  const stderr = result.stderr || '';
  const match = stderr.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

/** Second pass — apply linear normalization using the measured stats. */
function normalize(input, output, m) {
  const filter =
    `loudnorm=I=${TARGET_I}:TP=${TARGET_TP}:LRA=${TARGET_LRA}` +
    `:measured_I=${m.input_i}:measured_TP=${m.input_tp}` +
    `:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}` +
    `:offset=${m.target_offset}:linear=true:print_format=summary`;
  return spawnSync(
    ffmpegPath,
    [
      '-y',
      '-loglevel', 'error',
      '-i', input,
      '-af', filter,
      '-codec:a', 'libmp3lame',
      '-b:a', OUTPUT_BITRATE,
      output,
    ],
    { encoding: 'utf8' },
  );
}

let ok = 0;
let copied = 0;
let fail = 0;
for (const file of files) {
  const input = join(inputDir, file);
  const output = join(outputDir, file);

  const m = measure(input);
  if (!m) {
    console.log(`✗ ${file}  measurement failed`);
    fail++;
    continue;
  }
  const measuredI = Number(m.input_i);
  if (!Number.isFinite(measuredI) || measuredI < MIN_MEASURED_I) {
    // Too quiet to safely amplify — copy as-is.
    try {
      copyFileSync(input, output);
      console.log(`⚠ ${file}  too quiet (${measuredI} LUFS) — copied original`);
      copied++;
    } catch (e) {
      console.log(`✗ ${file}  copy failed: ${(e && e.message) || e}`);
      fail++;
    }
    continue;
  }

  const result = normalize(input, output, m);
  if (result.status !== 0) {
    console.log(`✗ ${file}  normalize failed: ${result.stderr?.trim() || 'unknown error'}`);
    fail++;
    continue;
  }
  const gain = (TARGET_I - measuredI).toFixed(1);
  const gainStr = `${Number(gain) >= 0 ? '+' : ''}${gain} dB`;
  console.log(`✓ ${file.padEnd(12)}  measured ${measuredI.toFixed(1).padStart(6)} LUFS → ${TARGET_I} LUFS  (${gainStr})`);
  ok++;
}

console.log(`\nDone: ${ok} normalized, ${copied} copied untouched, ${fail} failed.`);
console.log(`Output: ${outputDir}`);
if (fail > 0) process.exit(1);
