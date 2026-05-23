/**
 * Guitar Pro parser — wraps AlphaTab's `ScoreLoader.loadScoreFromBytes`.
 *
 * Supports every format AlphaTab recognizes (GP3 / GP4 / GP5 / GPX / GP7).
 * Runs only inside the parser worker (alphaTab is lazy-imported here to keep
 * the main bundle slim — alphaTab is ~15 MB unpacked).
 *
 * Tick conventions:
 *   - AlphaTab uses 960 ticks per quarter note.
 *   - Our `ImportIR.ticksPerQuarter` records 960 so downstream rescaling stays
 *     explicit and lossless. The mapper rescales to the project's canonical
 *     480 ppq when materializing Pattern events.
 *
 * String-index conventions (subtle, easy to get wrong):
 *   - AlphaTab's `Note.string` is **1-based**, with `1` = the lowest physical
 *     string (bottom of tablature). Higher values move toward the top of the
 *     tab (higher pitch).
 *   - AlphaTab's `Staff.stringTuning.tunings` is ordered **top of tab first**
 *     — index 0 holds the highest-pitch string.
 *   - Our IR uses **0-based** string indices with `0` = lowest physical
 *     string, and `tuning: string[]` ordered low-to-high.
 *   - Therefore: `irString = alphaNote.string - 1`, and `irTuning =
 *     [...alphaTuning].reverse()`.
 *
 * Lossy mappings tracked in `IRTrack.events[*]` and `IRNote.*`:
 *   - bends, slides, hammer-ons / pull-offs, harmonics, vibrato, ghost / dead
 *     notes, palm-mute, let-ring, tuplets, dynamics, ties — all preserved in
 *     the IR. The mapper decides whether to write through, approximate, or
 *     drop with a warning.
 */

// Same narrow-subpath import as the worker entry (avoids pulling React /
// Tone.js / DOM-touching code into the worker context).
import type {
  ImportIR,
  ImportParser,
  IREvent,
  IRNote,
  IRTrack,
  KeySignatureEvent,
  ParserInput,
  SectionMarker,
} from '@fretwork/lib/import';
import type * as alpha from '@coderline/alphatab';

let cachedAlphaTab: typeof alpha | null = null;

async function loadAlphaTab(): Promise<typeof alpha> {
  if (cachedAlphaTab) return cachedAlphaTab;
  // Lazy import keeps the worker's startup cost low and lets the bundler
  // tree-shake out of the main page bundle. alphaTab's load-time IIFE
  // detects worker context via `'WorkerGlobalScope' in globalThis` and
  // routes through its own `initializeWorker()`, which doesn't touch any
  // DOM globals — so no shim is needed here as long as everything else
  // imported by this worker is also DOM-free.
  cachedAlphaTab = await import('@coderline/alphatab');
  return cachedAlphaTab;
}

export const guitarProParser: ImportParser = {
  id: 'guitar-pro',
  label: 'Guitar Pro',
  extensions: ['.gp', '.gp3', '.gp4', '.gp5', '.gpx', '.gp7'],
  parse,
};

async function parse(input: ParserInput): Promise<ImportIR> {
  const at = await loadAlphaTab();
  const bytes = new Uint8Array(input.bytes);
  const score = at.importer.ScoreLoader.loadScoreFromBytes(bytes);

  const ticksPerQuarter = 960; // alphaTab's MidiUtils.QuarterTime

  const tempos = extractTempos(score);
  const timeSignatures = extractTimeSignatures(score);
  const sections = extractSections(score);
  const keySignatures = extractKeySignatures(score);
  const totalTicks = computeTotalTicks(score);

  // TEMP DIAGNOSTIC: walk the score using alphaTab's own getters and tally
  // articulation occurrences before our extraction layer touches them. If
  // this reports zero bends but our extracted IR also reports zero, the file
  // truly lacks them; if this reports non-zero but the IR doesn't, the bug
  // is in `extractNote`. Result is also surfaced in the import preview.
  const parserDiagnostics = rawDiagnosticScan(score);

  const tracks = score.tracks.map((t, idx) => extractTrack(t, idx, at));

  const versionLabel = detectVersionLabel(input.fileName);

  return {
    meta: {
      // Title fallback chain: score's own title → subtitle → filename without
      // extension. GP files often don't carry a title (the score is identified
      // by filename in the user's mind), so falling back to the filename is
      // strictly more useful than displaying "Untitled".
      title: score.title || score.subTitle || filenameToTitle(input.fileName) || undefined,
      artist: score.artist || undefined,
      album: score.album || undefined,
      composer: score.music || undefined,
      sourceFormat: 'guitar-pro',
      sourceFormatVersion: versionLabel,
      parserDiagnostics,
    },
    ticksPerQuarter,
    totalTicks,
    tempos,
    timeSignatures,
    keySignatures,
    sections,
    tracks,
  };
}

// ─── Score-level extractors ────────────────────────────────────────────────

function extractTempos(score: alpha.model.Score): ImportIR['tempos'] {
  const out: ImportIR['tempos'] = [
    { atTick: 0, bpm: score.tempo, interpolation: 'step' },
  ];
  for (const mb of score.masterBars) {
    for (const auto of mb.tempoAutomations) {
      // Only consume Tempo automations here; alphaTab packs other automation
      // kinds (volume, balance) into the same list.
      if (auto.type !== 0 /* AutomationType.Tempo */) continue;
      const barDuration = mb.calculateDuration();
      const offset = Math.round(barDuration * (auto.ratioPosition ?? 0));
      out.push({
        atTick: mb.start + offset,
        bpm: auto.value,
        interpolation: auto.isLinear ? 'linear' : 'step',
      });
    }
  }
  // Sort + de-dupe — multiple bars may declare identical tempo automations.
  out.sort((a, b) => a.atTick - b.atTick);
  return dedupeAtTick(out);
}

function extractTimeSignatures(score: alpha.model.Score): ImportIR['timeSignatures'] {
  const out: ImportIR['timeSignatures'] = [];
  let lastN = -1;
  let lastD = -1;
  for (const mb of score.masterBars) {
    if (
      mb.timeSignatureNumerator !== lastN ||
      mb.timeSignatureDenominator !== lastD
    ) {
      out.push({
        atTick: mb.start,
        numerator: mb.timeSignatureNumerator,
        denominator: mb.timeSignatureDenominator,
      });
      lastN = mb.timeSignatureNumerator;
      lastD = mb.timeSignatureDenominator;
    }
  }
  return out;
}

function extractSections(score: alpha.model.Score): SectionMarker[] {
  const out: SectionMarker[] = [];
  for (const mb of score.masterBars) {
    if (mb.section) {
      const name = (mb.section.text || mb.section.marker || '').trim();
      out.push({ atTick: mb.start, name });
    }
  }
  return out;
}

function extractKeySignatures(score: alpha.model.Score): KeySignatureEvent[] {
  // Bar-level key signatures landed in alphaTab post-1.5; the deprecated
  // MasterBar.keySignature accessor still works for now. We only emit a key
  // sig change when the value actually changes — alphaTab reports the
  // current key on every bar.
  const out: KeySignatureEvent[] = [];
  let last = Number.NaN;
  for (const mb of score.masterBars) {
    const ks = mb.keySignature;
    if (ks !== last) {
      out.push({
        atTick: mb.start,
        key: keySignatureToName(ks),
        // alphaTab packs major/minor as a separate enum (KeySignatureType);
        // we treat 1 as minor, 0 as major.
        mode: mb.keySignatureType === 1 ? 'minor' : 'major',
      });
      last = ks;
    }
  }
  return out;
}

function computeTotalTicks(score: alpha.model.Score): number {
  let end = 0;
  for (const mb of score.masterBars) {
    const barEnd = mb.start + mb.calculateDuration();
    if (barEnd > end) end = barEnd;
  }
  return end;
}

// ─── Track / Beat / Note extractors ────────────────────────────────────────

function extractTrack(track: alpha.model.Track, idx: number, at: typeof alpha): IRTrack {
  const staff = track.staves[0];
  const events: IREvent[] = [];

  if (staff) {
    for (const bar of staff.bars) {
      for (const voice of bar.voices) {
        for (const beat of voice.beats) {
          if (beat.isEmpty || beat.notes.length === 0) continue;
          events.push(extractBeat(beat));
        }
      }
    }
  }

  // Sort by tick so the IR is canonical regardless of how voices nest in
  // the source.
  events.sort((a, b) => a.atTick - b.atTick);

  return {
    id: `track-${idx}`,
    name: track.name?.trim() || `Track ${idx + 1}`,
    instrumentHint: hintFromTrack(track),
    midiProgram: track.playbackInfo?.program,
    tuning: staff ? tuningStrings(staff, at) : undefined,
    capo: staff?.capo ?? undefined,
    events,
  };
}

function extractBeat(beat: alpha.model.Beat): IREvent {
  const notes: IRNote[] = beat.notes.map((n) => extractNote(n));
  const tuplet =
    beat.tupletNumerator !== 1 || beat.tupletDenominator !== 1
      ? { num: beat.tupletNumerator, den: beat.tupletDenominator }
      : undefined;

  // Beat-level effects map. Only set fields we can detect cleanly; the IR's
  // optional shape means missing fields don't roundtrip false-y values into
  // downstream layers.
  const effects: IREvent['effects'] = {};
  if (beat.isPalmMute) effects.palmMute = true;
  if (beat.isLetRing) {
    for (const n of notes) n.letRing = true;
  }

  return {
    atTick: beat.absolutePlaybackStart,
    durationTicks: beat.playbackDuration,
    notes,
    tuplet,
    effects: Object.keys(effects).length > 0 ? effects : undefined,
    dynamic: dynamicFromValue(beat.dynamics),
    tieToNext: notes.some((n) => n.tieToNext === true) || undefined,
  };
}

function extractNote(n: alpha.model.Note): IRNote {
  const out: IRNote = {
    // 1-based alphaTab → 0-based IR (see file header for ordering notes).
    string: Math.max(0, (n.string ?? 1) - 1),
    fret: n.fret,
  };
  if (n.isGhost) out.ghost = true;
  if (n.isDead) out.dead = true;
  if (n.isLetRing) out.letRing = true;
  if (n.isTieOrigin) out.tieToNext = true;

  // Hammer-on / pull-off: alphaTab marks the *origin* note with
  // `isHammerPullOrigin` and exposes `isHammerPullDestination` on the
  // receiver (plus a `hammerPullOrigin` back-reference so we don't have to
  // walk the beat list ourselves). Playback wants the flag on the
  // destination — that's the note that shouldn't be re-plucked. We
  // distinguish hammer vs pull by comparing frets: ascending (dest > origin)
  // is a hammer-on, descending is a pull-off.
  if (n.isHammerPullDestination && n.hammerPullOrigin) {
    if (n.fret < n.hammerPullOrigin.fret) {
      out.pullOff = true;
    } else {
      out.hammerOn = true;
    }
  }
  if (n.isLeftHandTapped) out.tap = true;

  // Bend — only when the note actually carries a bend.
  if (n.hasBend && n.bendType !== 0 /* None */) {
    const peak = n.maxBendPoint?.value ?? 0;
    const semitones = peak / 2; // alphaTab uses quarter-step units (2 = 1 semi)
    out.bend = {
      type: bendTypeToIR(n.bendType),
      semitones,
      points: (n.bendPoints ?? []).map((p) => ({
        at: p.offset / 60, // alphaTab BendPoint.offset is 0..60 within a note
        semitones: p.value / 2,
      })),
    };
  }

  // Slides — into and out of the note get collapsed to one IR slide; out wins
  // because it's the more common direction for the next-beat ramp.
  if (n.slideOutType !== 0 /* None */) {
    out.slide = {
      type: slideOutTypeToIR(n.slideOutType),
    };
  } else if (n.slideInType !== 0 /* None */) {
    out.slide = {
      type: slideInTypeToIR(n.slideInType),
    };
  }

  // Harmonic
  if (n.harmonicType !== 0 /* None */) {
    out.harmonic = {
      type: harmonicTypeToIR(n.harmonicType),
      fret: n.harmonicValue !== 0 ? n.harmonicValue : undefined,
    };
  }

  // Vibrato — alphaTab note.vibrato is 0=None, 1=Slight, 2=Wide.
  if (n.vibrato === 1) out.vibrato = 'slight';
  else if (n.vibrato === 2) out.vibrato = 'wide';

  return out;
}

// ─── Enum translators ─────────────────────────────────────────────────────

function bendTypeToIR(t: number): NonNullable<IRNote['bend']>['type'] {
  // alphaTab BendType enum: 0 None, 1 Custom, 2 Bend, 3 Release, 4 BendRelease,
  // 5 Hold, 6 Prebend, 7 PrebendBend, 8 PrebendRelease.
  switch (t) {
    case 3:
      return 'release';
    case 4:
      return 'bend-release';
    case 6:
    case 7:
    case 8:
      return 'pre-bend';
    default:
      return 'bend';
  }
}

function slideInTypeToIR(t: number): NonNullable<IRNote['slide']>['type'] {
  // 1 IntoFromBelow, 2 IntoFromAbove
  return t === 1 ? 'slide-in-below' : 'slide-in-above';
}

function slideOutTypeToIR(t: number): NonNullable<IRNote['slide']>['type'] {
  // 1 Shift, 2 Legato, 3 OutUp, 4 OutDown, 5 PickSlideDown, 6 PickSlideUp
  switch (t) {
    case 1:
      return 'shift';
    case 2:
      return 'legato';
    case 3:
      return 'slide-out-up';
    case 4:
      return 'slide-out-down';
    default:
      return 'slide-out-down';
  }
}

function harmonicTypeToIR(t: number): NonNullable<IRNote['harmonic']>['type'] {
  // 1 Natural, 2 Artificial, 3 Pinch, 4 Tap, 5 Semi, 6 Feedback (we fold
  // Feedback into 'artificial' since our IR doesn't have a separate value)
  switch (t) {
    case 1:
      return 'natural';
    case 3:
      return 'pinch';
    case 4:
      return 'tap';
    case 5:
      return 'semi';
    default:
      return 'artificial';
  }
}

function dynamicFromValue(d: number): IREvent['dynamic'] {
  // alphaTab DynamicValue: 0 PPP .. 8 FFF
  const table: IREvent['dynamic'][] = [
    'ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff',
  ];
  return d >= 0 && d < table.length ? table[d] : undefined;
}

function hintFromTrack(t: alpha.model.Track): IRTrack['instrumentHint'] {
  if (t.isPercussion) return 'drums';
  const prog = t.playbackInfo?.program ?? -1;
  // Standard MIDI program ranges (0-indexed General MIDI):
  //   0..31  → guitars / chromatic + bass (32..39 = bass)
  //   24..31 → guitars
  //   32..39 → bass
  //   40..55 → strings / ensemble (we hint 'other')
  if (prog >= 24 && prog <= 31) return 'guitar';
  if (prog >= 32 && prog <= 39) return 'bass';
  // No GM range for ukulele; track name often disambiguates.
  const nameLower = (t.name ?? '').toLowerCase();
  if (nameLower.includes('uku')) return 'ukulele';
  if (nameLower.includes('bass')) return 'bass';
  if (nameLower.includes('vocal') || nameLower.includes('voice')) return 'vocals';
  return 'other';
}

function tuningStrings(staff: alpha.model.Staff, at: typeof alpha): string[] {
  const tunings = staff.stringTuning?.tunings ?? [];
  // alphaTab's `tunings` is ordered top-of-tab-first (highest pitch first).
  // Our IR uses low-to-high physical order: reverse.
  return tunings
    .map((t) => at.model.Tuning.getTextForTuning(t, true))
    .reverse();
}

// ─── Diagnostic (temporary) ───────────────────────────────────────────────

/**
 * Walks the alphaTab Score using only alphaTab's public getters and counts
 * raw articulation occurrences. Logs the totals to the worker console.
 * Helps distinguish "file genuinely has no articulations" from
 * "extraction layer is dropping them."
 */
function rawDiagnosticScan(score: alpha.model.Score): string {
  interface TrackStats {
    name: string;
    beats: number;
    notes: number;
    voices: number;
    bars: number;
    bends: number;
    bendTypeHistogram: Record<number, number>;
    slidesIn: number;
    slidesOut: number;
    hammerOrPullOrigin: number;
    /** Count of destinations classified as hammer-on (dest.fret > origin.fret). */
    hammerOnDestinations: number;
    /** Count of destinations classified as pull-off (dest.fret < origin.fret). */
    pullOffDestinations: number;
    /** Origin→destination fret pairs for visual inspection. */
    hammerPullPairs: Array<{ from: number; to: number; kind: 'H' | 'P' | '=' }>;
    harmonics: number;
    vibratos: number;
    ties: number;
    palmMutes: number;
    letRingBeats: number;
    ghost: number;
    dead: number;
    tap: number;
    /** Spread of note `string` values seen (alphaTab is 1-based). */
    stringHistogram: Record<number, number>;
    /** Spread of `fret` values seen. */
    fretMin: number;
    fretMax: number;
  }

  const perTrack: TrackStats[] = score.tracks.map((track) => {
    const stats: TrackStats = {
      name: track.name?.trim() || `Track ${track.index + 1}`,
      beats: 0,
      notes: 0,
      voices: 0,
      bars: 0,
      bends: 0,
      bendTypeHistogram: {},
      slidesIn: 0,
      slidesOut: 0,
      hammerOrPullOrigin: 0,
      hammerOnDestinations: 0,
      pullOffDestinations: 0,
      hammerPullPairs: [],
      harmonics: 0,
      vibratos: 0,
      ties: 0,
      palmMutes: 0,
      letRingBeats: 0,
      ghost: 0,
      dead: 0,
      tap: 0,
      stringHistogram: {},
      fretMin: Number.POSITIVE_INFINITY,
      fretMax: Number.NEGATIVE_INFINITY,
    };
    for (const staff of track.staves) {
      for (const bar of staff.bars) {
        stats.bars++;
        for (const voice of bar.voices) {
          // Count voices uniquely per voice id — bars share voice indexes.
          if (voice.beats.length > 0) stats.voices++;
          for (const beat of voice.beats) {
            if (beat.isEmpty) continue;
            stats.beats++;
            if (beat.isPalmMute) stats.palmMutes++;
            if (beat.isLetRing) stats.letRingBeats++;
            for (const n of beat.notes) {
              stats.notes++;
              const bt = n.bendType ?? 0;
              if (bt !== 0) {
                stats.bends++;
                stats.bendTypeHistogram[bt] = (stats.bendTypeHistogram[bt] ?? 0) + 1;
              }
              if ((n.slideInType ?? 0) !== 0) stats.slidesIn++;
              if ((n.slideOutType ?? 0) !== 0) stats.slidesOut++;
              if (n.isHammerPullOrigin) stats.hammerOrPullOrigin++;
              if (n.isHammerPullDestination && n.hammerPullOrigin) {
                const fromFret = n.hammerPullOrigin.fret;
                const toFret = n.fret;
                const kind: 'H' | 'P' | '=' =
                  toFret > fromFret ? 'H' : toFret < fromFret ? 'P' : '=';
                if (kind === 'H') stats.hammerOnDestinations++;
                else if (kind === 'P') stats.pullOffDestinations++;
                stats.hammerPullPairs.push({ from: fromFret, to: toFret, kind });
              }
              if ((n.harmonicType ?? 0) !== 0) stats.harmonics++;
              if ((n.vibrato ?? 0) !== 0) stats.vibratos++;
              if (n.isTieOrigin) stats.ties++;
              if (n.isGhost) stats.ghost++;
              if (n.isDead) stats.dead++;
              if (n.isLeftHandTapped) stats.tap++;
              const s = n.string ?? 0;
              stats.stringHistogram[s] = (stats.stringHistogram[s] ?? 0) + 1;
              if (n.fret < stats.fretMin) stats.fretMin = n.fret;
              if (n.fret > stats.fretMax) stats.fretMax = n.fret;
            }
          }
        }
      }
    }
    if (!Number.isFinite(stats.fretMin)) stats.fretMin = 0;
    if (!Number.isFinite(stats.fretMax)) stats.fretMax = 0;
    return stats;
  });

  const summary = {
    title: score.title,
    perTrack,
  };
  const json = JSON.stringify(summary, null, 2);
  // eslint-disable-next-line no-console
  console.log('[gp-parser:raw-scan]\n' + json);
  return json;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function dedupeAtTick<T extends { atTick: number }>(list: T[]): T[] {
  const seen = new Map<number, T>();
  for (const item of list) {
    // Latest wins at the same tick — preserves user intent for "two
    // automations at the same beat" cases.
    seen.set(item.atTick, item);
  }
  return Array.from(seen.values()).sort((a, b) => a.atTick - b.atTick);
}

function keySignatureToName(ks: number): string {
  // alphaTab KeySignature enum: -7 (Cb) .. 0 (C) .. 7 (C#)
  const names = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
  const idx = ks + 7;
  return idx >= 0 && idx < names.length ? names[idx] : 'C';
}

function filenameToTitle(fileName: string): string {
  const base = fileName.split('/').pop() ?? fileName;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

function detectVersionLabel(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'gp3':
      return 'gp3';
    case 'gp4':
      return 'gp4';
    case 'gp5':
      return 'gp5';
    case 'gpx':
      return 'gpx';
    case 'gp':
      return 'gp7';
    default:
      return ext;
  }
}
