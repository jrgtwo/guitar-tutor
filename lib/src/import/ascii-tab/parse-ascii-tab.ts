/**
 * ASCII-tab parser (Tier 1): plain-text guitar/bass tab → `ImportIR`.
 *
 * Tier 1 goal — *right notes, right order, approximate rhythm*. The notes and
 * their left-to-right order are extracted faithfully; timing is uniform (one
 * step per note column), leaving the user to fix the groove on the timeline.
 * Measure-bar and section-driven rhythm (Tier 2) are a later refinement.
 *
 * Strategy:
 *   - Classify lines; group consecutive tab lines into blocks.
 *   - A block's height is its string count (6 = guitar, 4 = bass). String index
 *     follows the usual high-string-on-top convention: the top line is the
 *     highest string index, the bottom line index 0 (= matches NoteCell).
 *   - Scan each line for digit runs (frets) at their character index. Labels are
 *     letters and articulation marks are non-digits, so they're ignored.
 *   - Group notes sharing a character column into one event (chord); order
 *     columns left-to-right, blocks top-to-bottom, one uniform step each.
 *   - `[Section]` headers become IR section markers at the current tick.
 *
 * See `docs/superpowers/specs/2026-05-31-chord-and-tab-import-flow-design.md`.
 */
import type { ImportIR, IREvent, IRNote, SectionMarker } from '../types';
import { PPQ } from '../../patterns/timebase';

/** Tier-1 uniform step: one eighth note per note column. */
const STEP_TICKS = PPQ / 2;

const SECTION_RE = /^\s*\[([^\]]+)\]\s*$/;

/** A tab line is dash-dominated and made only of tab glyphs (after an optional
 *  string label + bar). */
function isTabLine(line: string): boolean {
  const dashes = (line.match(/-/g) ?? []).length;
  if (dashes < 4) return false;
  const tabChars = (line.match(/[-0-9hpbsxX/\\~().|*<>^ ]/g) ?? []).length;
  return line.length > 0 && tabChars / line.length > 0.8;
}

interface ColumnNote {
  charIndex: number;
  string: number;
  fret: number;
}

/** Extract every (charIndex, string, fret) note from one block of tab lines. */
function notesInBlock(block: string[]): ColumnNote[] {
  const height = block.length;
  const notes: ColumnNote[] = [];
  block.forEach((line, offset) => {
    const stringIndex = height - 1 - offset; // top line = highest string
    for (const m of line.matchAll(/\d+/g)) {
      notes.push({ charIndex: m.index, string: stringIndex, fret: parseInt(m[0], 10) });
    }
  });
  return notes;
}

export function parseAsciiTab(text: string): ImportIR {
  const lines = text.split(/\r?\n/);

  const events: IREvent[] = [];
  const sections: SectionMarker[] = [];
  let step = 0;
  let blockHeight = 6; // string count = height of the (last non-empty) block

  let block: string[] = [];
  const flush = () => {
    if (block.length === 0) return;
    blockHeight = block.length;
    // Columns of this block, left to right.
    const notes = notesInBlock(block);
    const byColumn = new Map<number, IRNote[]>();
    for (const n of notes) {
      const arr = byColumn.get(n.charIndex) ?? [];
      arr.push({ string: n.string, fret: n.fret });
      byColumn.set(n.charIndex, arr);
    }
    for (const charIndex of [...byColumn.keys()].sort((a, b) => a - b)) {
      events.push({
        atTick: step * STEP_TICKS,
        durationTicks: STEP_TICKS,
        notes: byColumn.get(charIndex)!,
      });
      step++;
    }
    block = [];
  };

  for (const line of lines) {
    const header = line.match(SECTION_RE);
    if (header) {
      flush();
      sections.push({ atTick: step * STEP_TICKS, name: header[1].trim() });
      continue;
    }
    if (isTabLine(line)) {
      block.push(line);
    } else {
      flush();
    }
  }
  flush();

  const totalTicks = step * STEP_TICKS;
  const instrumentHint = blockHeight <= 4 ? 'bass' : 'guitar';

  return {
    meta: { sourceFormat: 'ascii-tab' },
    ticksPerQuarter: PPQ,
    totalTicks,
    tempos: [{ atTick: 0, bpm: 120, interpolation: 'step' }],
    timeSignatures: [{ atTick: 0, numerator: 4, denominator: 4 }],
    keySignatures: [],
    sections,
    tracks: [
      {
        id: 'tab-1',
        name: instrumentHint === 'bass' ? 'Bass' : 'Guitar',
        instrumentHint,
        capo: 0,
        events,
      },
    ],
  };
}
