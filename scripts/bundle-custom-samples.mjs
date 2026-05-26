#!/usr/bin/env node
/**
 * bundle-custom-samples — turn a Cubase per-string render folder into mp3 takes
 * ready for Tone.Sampler.
 *
 * Input shape (one folder containing 6 string tracks × 48 events each = 288 wav files):
 *   `<trackName>_<renderCounter>.wav`           ← first event on that track
 *   `<trackName>_<renderCounter>-<NN>.wav`      ← events 2..48 (NN = 01..47)
 *
 * Track names must match the keys of TRACK_OPEN_MIDI below (case-insensitive).
 * Within each track, events MUST be in this order (file mtime = render order):
 *   fret0_rr1, fret0_rr2, fret0_rr3, fret0_rr4, fret1_rr1, …, fret11_rr4
 *
 * Output: `<repoRoot>/samples/<packName>/rr<n>/<note>.mp3` — Karoryfer-style
 * layout, with one canonical take per (pitch, RR). Overlapping pitches (a note
 * recorded on multiple strings) collapse to the lowest-fret take, i.e. the
 * highest open-string note that still reaches the pitch within 0..11 frets.
 *
 * Result for standard tuning + frets 0..11 on every string:
 *   - Low E provides E2..G#2  (frets 0..4)
 *   - A      provides A2..C#3 (frets 0..4)
 *   - D      provides D3..F#3 (frets 0..4)
 *   - G      provides G3..A#3 (frets 0..3)
 *   - B      provides B3..D#4 (frets 0..4)
 *   - High E provides E4..D#5 (frets 0..11)
 *   = 36 unique pitches × 4 RR = 144 files in the final pack.
 *
 * After this, point trim-samples.mjs at each `rr<n>/` folder to add the
 * defensive fades + leading/trailing silence trim.
 *
 * Usage:
 *   node scripts/bundle-custom-samples.mjs <inputDir> <packName>
 *   node scripts/bundle-custom-samples.mjs "/mnt/h/guitar samples/jazzmasterp90/New folder" offset-p90
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';

const OUTPUT_BITRATE = '128k';
const FRETS_PER_STRING = 12;          // open + 11 frets
const RR_COUNT = 4;
const EVENTS_PER_TRACK = FRETS_PER_STRING * RR_COUNT; // 48

// Track name (as it appears in Cubase render filenames) → open-string MIDI.
// Standard tuning. Match is case-insensitive.
const TRACK_OPEN_MIDI = {
  'low e':        40, // E2
  'a string':     45, // A2
  'd string':     50, // D3
  'g string':     55, // G3
  'b string':     59, // B3
  'high e string': 64, // E4
};

const CHROMATIC = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];

function midiToNoteName(midi) {
  // Scientific pitch with lowercase 's' for sharps, matching Karoryfer convention.
  const pc = CHROMATIC[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${pc}${octave}`;
}

const inputArg = process.argv[2];
const packName = process.argv[3];
if (!inputArg || !packName) {
  console.error('Usage: node scripts/bundle-custom-samples.mjs <inputDir> <packName>');
  process.exit(1);
}

const inputDir = resolve(inputArg);
if (!existsSync(inputDir) || !statSync(inputDir).isDirectory()) {
  console.error(`Input folder not found: ${inputDir}`);
  process.exit(1);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const packRoot = join(repoRoot, 'samples', packName);

// Pre-create rr1..rr4 subfolders.
for (let rr = 1; rr <= RR_COUNT; rr++) {
  mkdirSync(join(packRoot, `rr${rr}`), { recursive: true });
}

const allOpenMidis = Object.values(TRACK_OPEN_MIDI);

// A given (openMidi, fret) recording is canonical for its pitch iff no other
// string has a higher open MIDI that still reaches the pitch (i.e. fret ≤ 11
// from a higher open string).
function isCanonical(openMidi, fret) {
  const pitch = openMidi + fret;
  for (const m of allOpenMidis) {
    if (m > openMidi && m <= pitch) return false; // a higher string covers this pitch
  }
  return true;
}

const allFiles = readdirSync(inputDir);

function eventsForTrack(trackName) {
  // Match `<trackName>_<digits>.wav` and `<trackName>_<digits>-<digits>.wav`,
  // case-insensitive on the track name. The unsuffixed file is event 1; the
  // -NN suffix gives events 2..48 (NN = 01..47).
  const escaped = trackName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${escaped}_(\\d+)(?:-(\\d+))?\\.wav$`, 'i');

  const matches = [];
  for (const f of allFiles) {
    const m = f.match(re);
    if (!m) continue;
    const [, renderTag, suffix] = m;
    const eventKey = suffix == null ? -1 : Number(suffix); // -1 sorts before 0..47
    matches.push({ file: f, renderTag, eventKey });
  }

  if (matches.length === 0) return [];

  // If multiple render counters are present, prefer the one with the most files.
  // (Defensive — in practice the user renders once and the folder is clean.)
  const byRender = new Map();
  for (const m of matches) {
    if (!byRender.has(m.renderTag)) byRender.set(m.renderTag, []);
    byRender.get(m.renderTag).push(m);
  }
  let best = null;
  for (const [, arr] of byRender) {
    if (!best || arr.length > best.length) best = arr;
  }
  best.sort((a, b) => a.eventKey - b.eventKey);
  return best.map((m) => m.file);
}

console.log(`Bundling Cubase per-string renders → ${packRoot}`);
console.log(`  from: ${inputDir}\n`);

let totalOk = 0;
let totalSkipped = 0;
let totalFail = 0;
let hadError = false;

for (const [trackName, openMidi] of Object.entries(TRACK_OPEN_MIDI)) {
  const files = eventsForTrack(trackName);
  if (files.length !== EVENTS_PER_TRACK) {
    console.error(`✗ "${trackName}": expected ${EVENTS_PER_TRACK} files, found ${files.length}. Aborting.`);
    hadError = true;
    continue;
  }

  console.log(`── ${trackName} (open MIDI ${openMidi} = ${midiToNoteName(openMidi)}) ──`);

  for (let idx = 0; idx < EVENTS_PER_TRACK; idx++) {
    const fret = idx >> 2;          // idx // 4
    const rr   = (idx & 3) + 1;     // (idx % 4) + 1
    const pitch = openMidi + fret;
    const noteName = midiToNoteName(pitch);
    const inputFile = files[idx];
    const inPath = join(inputDir, inputFile);

    if (!isCanonical(openMidi, fret)) {
      // A lower-fret take on a higher string is canonical for this pitch.
      totalSkipped++;
      continue;
    }

    const outPath = join(packRoot, `rr${rr}`, `${noteName}.mp3`);
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
      console.log(`  ✓ fret${String(fret).padStart(2)} rr${rr}  ${inputFile.padEnd(28)} → rr${rr}/${noteName}.mp3  ${inKb}KB → ${outKb}KB`);
      totalOk++;
    } else {
      console.log(`  ✗ fret${fret} rr${rr}  ${inputFile}  ffmpeg failed: ${result.stderr?.trim() || 'unknown error'}`);
      totalFail++;
    }
  }
  console.log('');
}

console.log(`Done: ${totalOk} bundled, ${totalSkipped} skipped (covered by a lower-fret take), ${totalFail} failed.`);

if (totalOk > 0) {
  console.log(`\nNext: trim each subfolder:`);
  for (let rr = 1; rr <= RR_COUNT; rr++) {
    console.log(`  node scripts/trim-samples.mjs "${join(packRoot, `rr${rr}`)}"`);
  }
}

if (hadError || totalFail > 0) process.exit(1);
