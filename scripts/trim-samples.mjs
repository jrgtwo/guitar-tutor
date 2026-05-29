#!/usr/bin/env node
/**
 * trim-samples — strip leading and trailing silence from a folder of .mp3 sample files.
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
 *   - Trims trailing silence (anything below -30 dB at the end of the file)
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
// We intentionally do NOT use silenceremove's `start_silence`/`stop_silence`
// ("keep N seconds of silence") options. They make ffmpeg stamp a single-sample
// splice discontinuity at exactly the kept-silence boundary (e.g. 100 ms) — an
// audible click baked into the file, mid-note, that survives all playback
// processing. (This was the long-standing "sample click"; see the
// project_sample_click_root_cause memory.) Instead we cut at the onset and rely
// on a short FADE_S to declick the cut edges.
//
// Start vs stop thresholds are intentionally asymmetric:
//   - Start: aggressive (-32dB), cuts the leading silence cleanly before the
//     sharp pluck attack.
//   - Stop: much more permissive (-55dB), so the natural decay tail (which
//     can fall to -40..-50dB and still be musically valuable) isn't chopped.
// And stop_duration is longer (250ms vs 30ms) to ride through the brief
// sub-threshold dips inside a normal decay envelope; we only want to fire on
// genuine post-note silence.
const TRIM_ATTEMPTS = [
  {
    startThresholdDb: -32, startDurationS: 0.030,
    stopThresholdDb:  -55, stopDurationS:  0.250,
    detection: 'rms',
    label: 'rms (start -32dB / stop -55dB)',
  },
  {
    startThresholdDb: -38, startDurationS: 0.020,
    stopThresholdDb:  -60, stopDurationS:  0.250,
    detection: 'rms',
    label: 'rms loose (start -38dB / stop -60dB)',
  },
  {
    startThresholdDb: -45, startDurationS: 0.020,
    stopThresholdDb:  -65, stopDurationS:  0.250,
    detection: 'rms',
    label: 'rms gentle (start -45dB / stop -65dB)',
  },
];
// Linear fade applied AFTER trim, at both ends — declicks the silenceremove cut
// edges. Cut now lands at the onset (no kept silence), so this fade lands on
// real audio; 6 ms is short enough to keep the pluck attack snappy (the Sampler
// adds its own 5 ms attack on playback) while absorbing any cut discontinuity.
const FADE_S = 0.006;
const OUTPUT_BITRATE = '192k';
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

function runTrim(input, output, attempt) {
  const { startThresholdDb, startDurationS, stopThresholdDb, stopDurationS, detection } = attempt;
  // Trailing fade uses the reverse-trick (areverse,afade=t=in,areverse): a plain
  // `afade=t=out:d=X` without `start_time` defaults to fading out starting at time 0,
  // which silences everything past the first X ms. Reversing twice applies the
  // fade at the actual end of the (variable-duration) trimmed clip.
  const filter = [
    `silenceremove=start_periods=1`,
    `:start_duration=${startDurationS}:start_threshold=${startThresholdDb}dB`,
    `:detection=${detection}`,
    `:stop_periods=1:stop_duration=${stopDurationS}:stop_threshold=${stopThresholdDb}dB`,
    `,afade=t=in:d=${FADE_S}`,
    `,areverse,afade=t=in:d=${FADE_S},areverse`,
  ].join('');
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
let fallback = 0;
let copied = 0;
let fail = 0;
for (const file of files) {
  const input = join(inputDir, file);
  const output = join(outputDir, file);
  const inSize = statSync(input).size;

  let resolved = false;
  for (let attempt = 0; attempt < TRIM_ATTEMPTS.length; attempt++) {
    const { label } = TRIM_ATTEMPTS[attempt];
    const result = runTrim(input, output, TRIM_ATTEMPTS[attempt]);
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
