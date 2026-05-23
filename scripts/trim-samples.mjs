#!/usr/bin/env node
/**
 * trim-samples — strip leading silence from a folder of .mp3 sample files.
 *
 * Uses the static ffmpeg binary bundled with the `ffmpeg-static` npm package,
 * so it works on WSL2 without any system-library dependencies (the apt-installed
 * ffmpeg is broken on this machine; see CLAUDE.md).
 *
 * Usage:
 *   node scripts/trim-samples.mjs <path-to-folder-of-mp3s>
 *
 * Behavior:
 *   - Reads every .mp3 in the given folder
 *   - Trims leading silence (anything below -30 dB at the start of the file)
 *   - Writes the trimmed copy to a `trimmed/` subfolder next to the originals
 *   - Originals are never modified
 *   - Re-encodes as mp3 at 128 kbps (same quality bracket as the source samples)
 *
 * After running: upload the trimmed/ folder contents to your Supabase bucket,
 * overwriting the existing files.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, mkdirSync, existsSync, statSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ffmpegPath from 'ffmpeg-static';

// Multiple trim attempts with auto-fallback if one over-eats. We use RMS
// detection (not the default peak detection) because peak detection is fooled
// by music: every zero-crossing momentarily drops the signal to 0, which
// resets ffmpeg's sustained-above-threshold counter. RMS averages over a
// window (default 20ms) so tonal content stays consistently above threshold
// once the note starts, even for quiet samples like G5 (peak ~-22dB).
//
// `keepSilenceS` preserves a few ms of pre-attack quiet before the detected
// onset so the file starts near zero amplitude — without it, the hard cut
// lands mid-cycle and creates an audible click at the start of playback.
const TRIM_ATTEMPTS = [
  { thresholdDb: -32, durationS: 0.030, detection: 'rms', keepSilenceS: 0.100, label: 'rms (-32dB / 30ms)' },
  { thresholdDb: -38, durationS: 0.020, detection: 'rms', keepSilenceS: 0.100, label: 'rms loose (-38dB / 20ms)' },
  { thresholdDb: -45, durationS: 0.020, detection: 'rms', keepSilenceS: 0.100, label: 'rms gentle (-45dB / 20ms)' },
];
// Linear fade-in applied AFTER trim. Pairs with `keepSilenceS` for robustness
// against click artifacts — even if the trim cut lands at a non-zero amplitude
// sample, the fade absorbs the discontinuity. Short enough (~25ms) that the
// attack still feels sharp.
const FADE_IN_S = 0.025;
const OUTPUT_BITRATE = '128k';
// If trim output is smaller than this fraction of the input, treat it as
// over-trimmed and try the next attempt.
const MIN_OUTPUT_RATIO = 0.15;

const inputArg = process.argv[2];
if (!inputArg) {
  console.error('Usage: node scripts/trim-samples.mjs <path-to-folder-of-mp3s>');
  process.exit(1);
}

const inputDir = resolve(inputArg);
if (!existsSync(inputDir) || !statSync(inputDir).isDirectory()) {
  console.error(`Folder not found: ${inputDir}`);
  process.exit(1);
}

const outputDir = join(inputDir, 'trimmed');
mkdirSync(outputDir, { recursive: true });

const files = readdirSync(inputDir)
  .filter((f) => f.toLowerCase().endsWith('.mp3'))
  .sort();

if (files.length === 0) {
  console.error(`No .mp3 files in: ${inputDir}`);
  process.exit(1);
}

console.log(`Trimming ${files.length} samples`);
console.log(`  from: ${inputDir}`);
console.log(`  to:   ${outputDir}\n`);

function runTrim(input, output, thresholdDb, durationS, detection, keepSilenceS) {
  return spawnSync(
    ffmpegPath,
    [
      '-y',
      '-loglevel', 'error',
      '-i', input,
      '-af', `silenceremove=start_periods=1:start_duration=${durationS}:start_threshold=${thresholdDb}dB:detection=${detection}:start_silence=${keepSilenceS},afade=t=in:d=${FADE_IN_S}`,
      '-codec:a', 'libmp3lame',
      '-b:a', OUTPUT_BITRATE,
      output,
    ],
    { encoding: 'utf8' },
  );
}

let ok = 0;
let fallback = 0;
let copied = 0;
let fail = 0;
for (const file of files) {
  const input = join(inputDir, file);
  const output = join(outputDir, file);
  const inSize = statSync(input).size;

  let resolved = false;
  for (let attempt = 0; attempt < TRIM_ATTEMPTS.length; attempt++) {
    const { thresholdDb, durationS, detection, keepSilenceS, label } = TRIM_ATTEMPTS[attempt];
    const result = runTrim(input, output, thresholdDb, durationS, detection, keepSilenceS);
    if (result.status !== 0) continue;
    const outSize = statSync(output).size;
    const ratio = outSize / inSize;
    if (ratio < MIN_OUTPUT_RATIO) continue; // over-trimmed; try next attempt
    const delta = (((outSize - inSize) / inSize) * 100).toFixed(1);
    const tag = attempt === 0 ? '' : ` [fallback: ${label}]`;
    console.log(`✓ ${file}  ${(inSize / 1024).toFixed(1)}KB → ${(outSize / 1024).toFixed(1)}KB  (${delta}%)${tag}`);
    if (attempt === 0) ok++;
    else fallback++;
    resolved = true;
    break;
  }

  if (!resolved) {
    // Both trim attempts over-shrank the file. Sample is too quiet for any
    // threshold-based trim — copy the original so the bucket still has a
    // working file.
    try {
      copyFileSync(input, output);
      console.log(`⚠ ${file}  copied original (trim over-ate at every threshold)`);
      copied++;
    } catch (e) {
      console.log(`✗ ${file}  copy failed: ${(e && e.message) || e}`);
      fail++;
    }
  }
}

console.log(`\nDone: ${ok} trimmed, ${fallback} via fallback, ${copied} copied untouched, ${fail} failed.`);
console.log(`Output: ${outputDir}`);
if (fail > 0) process.exit(1);
