import { describe, it, expect } from 'vitest';
import { mapImportToLibrary } from '../src/import/mapper';
import type { ImportIR } from '../src/import/types';

function baseIR(overrides: Partial<ImportIR> = {}): ImportIR {
  return {
    meta: { sourceFormat: 'guitar-pro', title: 'Test Song', artist: 'Tester' },
    ticksPerQuarter: 960,
    totalTicks: 3840 * 2, // two bars at 960 ppq, 4/4 = 3840 ticks/bar
    tempos: [{ atTick: 0, bpm: 120, interpolation: 'step' }],
    timeSignatures: [{ atTick: 0, numerator: 4, denominator: 4 }],
    keySignatures: [],
    sections: [],
    tracks: [
      {
        id: 't0',
        name: 'Lead',
        instrumentHint: 'guitar',
        tuning: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
        capo: 0,
        events: [
          { atTick: 0, durationTicks: 960, notes: [{ string: 0, fret: 3 }] },
          { atTick: 960, durationTicks: 960, notes: [{ string: 1, fret: 5 }] },
          { atTick: 1920, durationTicks: 960, notes: [{ string: 2, fret: 7 }] },
        ],
      },
    ],
    ...overrides,
  };
}

describe('mapImportToLibrary — single-pattern mode', () => {
  it('produces a single pattern with rescaled ticks (960 → 480)', () => {
    const result = mapImportToLibrary({ ir: baseIR(), selectedTrackId: 't0' });
    expect(result.topology).toBe('single-pattern');
    expect(result.patterns).toHaveLength(1);
    expect(result.composition).toBeNull();
    const pat = result.patterns[0];
    // 960 IR ticks → 480 project ticks
    expect(pat.events[0].startTick).toBe(0);
    expect(pat.events[1].startTick).toBe(480);
    expect(pat.events[2].startTick).toBe(960);
    expect(pat.events[0].durationTicks).toBe(480);
  });

  it('writes initial tempo + TS to legacy fields and to automation tracks', () => {
    const result = mapImportToLibrary({ ir: baseIR(), selectedTrackId: 't0' });
    const pat = result.patterns[0];
    expect(pat.suggestedBpm).toBe(120);
    expect(pat.timeSignature).toEqual({ numerator: 4, denominator: 4 });
    expect(pat.tempoTrack).toHaveLength(1);
    expect(pat.tempoTrack[0]).toMatchObject({ atTick: 0, bpm: 120 });
    expect(pat.timeSignatureTrack[0]).toMatchObject({ numerator: 4, denominator: 4 });
  });

  it('preserves the full IR on sourceIR', () => {
    const ir = baseIR();
    const result = mapImportToLibrary({ ir, selectedTrackId: 't0' });
    expect(result.patterns[0].sourceIR).toBe(ir);
  });

  it('drops notes outside the playable string range', () => {
    const ir = baseIR();
    ir.tracks[0].events.push({
      atTick: 2880,
      durationTicks: 960,
      notes: [{ string: 99, fret: 0 }],
    });
    const result = mapImportToLibrary({ ir, selectedTrackId: 't0' });
    expect(result.warnings.some((w) => w.includes('Dropped 1 notes'))).toBe(true);
  });

  it('warns about unsupported articulations the IR carries', () => {
    const ir = baseIR();
    ir.tracks[0].events[0].notes[0].bend = { type: 'bend', semitones: 1 };
    ir.tracks[0].events[1].notes[0].slide = { type: 'shift' };
    ir.tracks[0].events[2].notes[0].hammerOn = true;
    const result = mapImportToLibrary({ ir, selectedTrackId: 't0' });
    expect(result.warnings.some((w) => w.includes('1 bends'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('1 slides'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('1 hammer-ons'))).toBe(true);
  });

  it('falls back from composition mode to single-pattern when sections are empty', () => {
    const result = mapImportToLibrary({
      ir: baseIR(),
      selectedTrackId: 't0',
      topology: 'composition',
    });
    expect(result.topology).toBe('single-pattern');
  });

  it('names skipped tracks in the warnings list', () => {
    const ir = baseIR();
    ir.tracks.push({ id: 't1', name: 'Bass', instrumentHint: 'bass', events: [] });
    ir.tracks.push({ id: 't2', name: 'Drums', instrumentHint: 'drums', events: [] });
    const result = mapImportToLibrary({ ir, selectedTrackId: 't0' });
    expect(result.warnings.some((w) => w.includes('Bass'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('Drums'))).toBe(true);
  });
});

describe('mapImportToLibrary — composition mode', () => {
  it('splits events into per-section patterns + composition', () => {
    const ir = baseIR({
      sections: [
        { atTick: 0, name: 'Verse' },
        { atTick: 1920, name: 'Chorus' },
      ],
    });
    const result = mapImportToLibrary({ ir, selectedTrackId: 't0', topology: 'composition' });
    expect(result.topology).toBe('composition');
    expect(result.patterns).toHaveLength(2);
    expect(result.patterns[0].name).toBe('Verse');
    expect(result.patterns[1].name).toBe('Chorus');
    expect(result.composition).not.toBeNull();
    expect(result.composition?.placements).toHaveLength(2);
  });

  it('per-section pattern events are offset so each section starts at tick 0', () => {
    const ir = baseIR({
      sections: [
        { atTick: 0, name: 'Verse' },
        { atTick: 1920, name: 'Chorus' },
      ],
    });
    const result = mapImportToLibrary({ ir, selectedTrackId: 't0', topology: 'composition' });
    // The Chorus pattern's first event was at IR-tick 1920 → 960 project-tick
    // before offset → 0 after offset.
    const chorus = result.patterns[1];
    expect(chorus.events[0].startTick).toBe(0);
  });

  it('synthesizes a leading Intro section for content before the first marker', () => {
    const ir = baseIR({ sections: [{ atTick: 1920, name: 'Verse' }] });
    const result = mapImportToLibrary({ ir, selectedTrackId: 't0', topology: 'composition' });
    expect(result.patterns[0].name).toBe('Intro');
    expect(result.patterns[1].name).toBe('Verse');
  });

  it('preserves the full IR on the composition (not the per-section patterns)', () => {
    const ir = baseIR({
      sections: [
        { atTick: 0, name: 'A' },
        { atTick: 1920, name: 'B' },
      ],
    });
    const result = mapImportToLibrary({ ir, selectedTrackId: 't0', topology: 'composition' });
    expect(result.composition?.sourceIR).toBe(ir);
    expect(result.patterns[0].sourceIR).toBeNull();
  });

  it('places sections at correct composition ticks', () => {
    const ir = baseIR({
      sections: [
        { atTick: 0, name: 'A' },
        { atTick: 1920, name: 'B' },
      ],
    });
    const result = mapImportToLibrary({ ir, selectedTrackId: 't0', topology: 'composition' });
    // 1920 IR ticks → 960 project ticks
    expect(result.composition?.placements[0].startTick).toBe(0);
    expect(result.composition?.placements[1].startTick).toBe(960);
  });

  it('warns about tempo and TS automation when more than one event exists', () => {
    const ir = baseIR({
      sections: [{ atTick: 0, name: 'A' }],
      tempos: [
        { atTick: 0, bpm: 120, interpolation: 'step' },
        { atTick: 1920, bpm: 90, interpolation: 'step' },
      ],
      timeSignatures: [
        { atTick: 0, numerator: 4, denominator: 4 },
        { atTick: 1920, numerator: 3, denominator: 4 },
      ],
    });
    const result = mapImportToLibrary({ ir, selectedTrackId: 't0', topology: 'composition' });
    expect(result.warnings.some((w) => w.includes('Tempo automation preserved'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('Time signature automation preserved'))).toBe(true);
  });
});

describe('mapImportToLibrary — articulations', () => {
  it('writes hammerOn/pullOff through to PatternEvent', () => {
    const ir = baseIR();
    ir.tracks[0].events = [
      { atTick: 0, durationTicks: 480, notes: [{ string: 0, fret: 5 }] },
      { atTick: 480, durationTicks: 480, notes: [{ string: 0, fret: 7, hammerOn: true }] },
      { atTick: 960, durationTicks: 480, notes: [{ string: 0, fret: 5, pullOff: true }] },
    ];
    const result = mapImportToLibrary({ ir, selectedTrackId: 't0' });
    const events = result.patterns[0].events;
    expect(events[0].hammerOn).toBeUndefined();
    expect(events[0].pullOff).toBeUndefined();
    expect(events[1].hammerOn).toBe(true);
    expect(events[2].pullOff).toBe(true);
  });

  it('writes tieToNext through to PatternEvent', () => {
    const ir = baseIR();
    ir.tracks[0].events = [
      { atTick: 0, durationTicks: 480, notes: [{ string: 0, fret: 5, tieToNext: true }] },
      { atTick: 480, durationTicks: 480, notes: [{ string: 0, fret: 5 }] },
    ];
    const result = mapImportToLibrary({ ir, selectedTrackId: 't0' });
    const events = result.patterns[0].events;
    expect(events[0].tieToNext).toBe(true);
    expect(events[1].tieToNext).toBeUndefined();
  });

  it('translates dynamic markings to per-event velocity', () => {
    const ir = baseIR();
    ir.tracks[0].events = [
      { atTick: 0, durationTicks: 480, notes: [{ string: 0, fret: 5 }], dynamic: 'pp' },
      { atTick: 480, durationTicks: 480, notes: [{ string: 0, fret: 7 }], dynamic: 'f' },
      { atTick: 960, durationTicks: 480, notes: [{ string: 0, fret: 5 }] /* no dynamic */ },
    ];
    const result = mapImportToLibrary({ ir, selectedTrackId: 't0' });
    const events = result.patterns[0].events;
    // Soft → low velocity, loud → high velocity, undefined → no velocity (default 1.0 at playback).
    expect(events[0].velocity).toBeLessThan(0.3);
    expect(events[1].velocity).toBeGreaterThan(0.7);
    expect(events[2].velocity).toBeUndefined();
  });
});

describe('mapImportToLibrary — capo handling', () => {
  it('bakes capo into absolute fret positions', () => {
    const ir = baseIR();
    ir.tracks[0].capo = 2;
    ir.tracks[0].events = [
      { atTick: 0, durationTicks: 960, notes: [{ string: 0, fret: 3 }] },
    ];
    const result = mapImportToLibrary({ ir, selectedTrackId: 't0' });
    // capo 2 + fret 3 = absolute fret 5
    expect(result.patterns[0].events[0].fret).toBe(5);
  });
});

describe('mapImportToLibrary — failure modes', () => {
  it('returns an error in warnings when the selected track is missing', () => {
    const result = mapImportToLibrary({ ir: baseIR(), selectedTrackId: 'nope' });
    expect(result.warnings.some((w) => w.includes('not found'))).toBe(true);
    expect(result.patterns).toHaveLength(0);
  });
});
