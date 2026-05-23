/**
 * Sample packs — pre-authored note → URL maps that can be loaded into a
 * Sampler-kind voice source. Adding a new pack here surfaces it as a one-click
 * option in the Sound Lab's SamplerControls. Users can also bring their own
 * pack via the "Custom JSON…" editor.
 *
 * Hosting recipe:
 *   1. Drop .mp3 (or .ogg) sample files into `example/public/samples/<pack-id>/`.
 *      Filenames should be note names like `A2.mp3`, `Cs3.mp3` (use lowercase
 *      `s` for sharp in filenames to avoid `#` URL issues).
 *   2. Add an entry below mapping note names (e.g. `A2`, `C#3`) to the served
 *      URL paths (`/samples/<pack-id>/A2.mp3`).
 *   3. Three notes per octave (every 3 semitones) is enough; Tone.Sampler
 *      pitch-shifts between them with minimal artifacts.
 *
 * For production, sample assets can move to Vercel Blob or any CDN — replace
 * the URLs here with the public Blob URLs and you're done.
 *
 * ── Free sample-pack sources for self-hosting ────────────────────────────────
 *
 * Public CDN-hosted (works immediately, piano only):
 *   - Tone.js Salamander Piano  https://tonejs.github.io/audio/salamander/
 *   - Tone.js Casio Piano       https://tonejs.github.io/audio/casio/
 *
 * Download-and-host (the realistic path for guitar):
 *   - Karoryfer Samples         https://www.karoryfer.com/karoryfer-samples
 *     (Salinas acoustic, several electrics, basses — CC-BY-SA)
 *   - FreePats Classical Guitar https://freepats.zenvoid.org/Guitar/
 *     (CC0 / GPL)
 *   - Philharmonia Orchestra    https://philharmonia.co.uk/resources/sound-samples/
 *     (Single notes, non-commercial CC)
 *   - University of Iowa MIS    https://theremin.music.uiowa.edu/MISguitar.html
 *     (Academic recordings, educational use)
 *
 * Conversion: `ffmpeg -i NOTE.wav -codec:a libmp3lame -b:a 128k NOTE.mp3` per file,
 * keep ~14 samples spanning E2 → E6 (every 3 semitones).
 */
export interface SamplePack {
  /** Stable id (used to key the UI). */
  readonly id: string;
  /** Human-readable label for the picker. */
  readonly label: string;
  /** Short description shown under the picker — what the pack sounds like. */
  readonly description: string;
  /** note → URL map fed straight into `Tone.Sampler`. */
  readonly samples: Readonly<Record<string, string>>;
}

/** Tone.js's public demo set — Salamander piano. Hosted by the Tone.js team at
 *  https://tonejs.github.io/audio/salamander/ and used in every Tone example.
 *  Note: this is PIANO, not guitar — the pipeline plays cleanly but the sound
 *  is piano. Useful for proving the sampler path end-to-end before authoring a
 *  real guitar sample pack. */
const CASIO_PIANO_DEMO: Readonly<Record<string, string>> = {
  A1: 'https://tonejs.github.io/audio/casio/A1.mp3',
  A2: 'https://tonejs.github.io/audio/casio/A2.mp3',
  'A#1': 'https://tonejs.github.io/audio/casio/As1.mp3',
  B1: 'https://tonejs.github.io/audio/casio/B1.mp3',
  C2: 'https://tonejs.github.io/audio/casio/C2.mp3',
  'C#2': 'https://tonejs.github.io/audio/casio/Cs2.mp3',
  D2: 'https://tonejs.github.io/audio/casio/D2.mp3',
  'D#2': 'https://tonejs.github.io/audio/casio/Ds2.mp3',
  E2: 'https://tonejs.github.io/audio/casio/E2.mp3',
  F2: 'https://tonejs.github.io/audio/casio/F2.mp3',
  'F#2': 'https://tonejs.github.io/audio/casio/Fs2.mp3',
  G2: 'https://tonejs.github.io/audio/casio/G2.mp3',
  'G#2': 'https://tonejs.github.io/audio/casio/Gs2.mp3',
};

/** Philharmonia Orchestra classical guitar samples (CC-BY-NC), hosted on
 *  Supabase Storage. Full chromatic E2 → C6 means Tone.Sampler hits an exact
 *  match for every note in the guitar range — zero pitch-shift artifacts.
 *  Files renamed from Philharmonia's `guitar_<note>_very-long_forte_normal.mp3`
 *  to short `<note>.mp3` at upload time. Sharps use `s` in filenames (As2 = A♯2)
 *  to avoid `#` URL encoding. */
const PHILHARMONIA_BASE = 'https://ssszubkbregwjgkrpqop.supabase.co/storage/v1/object/public/samples/philharmonia';
function philharmoniaUrl(noteFile: string): string {
  return `${PHILHARMONIA_BASE}/${noteFile}.mp3`;
}
export const PHILHARMONIA_CLASSICAL: Readonly<Record<string, string>> = {
  E2: philharmoniaUrl('E2'),
  F2: philharmoniaUrl('F2'),
  'F#2': philharmoniaUrl('Fs2'),
  G2: philharmoniaUrl('G2'),
  'G#2': philharmoniaUrl('Gs2'),
  A2: philharmoniaUrl('A2'),
  'A#2': philharmoniaUrl('As2'),
  B2: philharmoniaUrl('B2'),
  C3: philharmoniaUrl('C3'),
  'C#3': philharmoniaUrl('Cs3'),
  D3: philharmoniaUrl('D3'),
  'D#3': philharmoniaUrl('Ds3'),
  E3: philharmoniaUrl('E3'),
  F3: philharmoniaUrl('F3'),
  'F#3': philharmoniaUrl('Fs3'),
  G3: philharmoniaUrl('G3'),
  'G#3': philharmoniaUrl('Gs3'),
  A3: philharmoniaUrl('A3'),
  'A#3': philharmoniaUrl('As3'),
  B3: philharmoniaUrl('B3'),
  C4: philharmoniaUrl('C4'),
  'C#4': philharmoniaUrl('Cs4'),
  D4: philharmoniaUrl('D4'),
  'D#4': philharmoniaUrl('Ds4'),
  E4: philharmoniaUrl('E4'),
  F4: philharmoniaUrl('F4'),
  'F#4': philharmoniaUrl('Fs4'),
  G4: philharmoniaUrl('G4'),
  'G#4': philharmoniaUrl('Gs4'),
  A4: philharmoniaUrl('A4'),
  'A#4': philharmoniaUrl('As4'),
  B4: philharmoniaUrl('B4'),
  // C5, C#5, F5, F#5, A5, A#5, B5, C6 not uploaded — Tone.Sampler pitch-shifts
  // from the nearest available sample (G#5) for anything above. Add entries
  // back here if those files are uploaded later.
  D5: philharmoniaUrl('D5'),
  'D#5': philharmoniaUrl('Ds5'),
  E5: philharmoniaUrl('E5'),
  G5: philharmoniaUrl('G5'),
  'G#5': philharmoniaUrl('Gs5'),
};

const SALAMANDER_PIANO_DEMO: Readonly<Record<string, string>> = {
  A1: 'https://tonejs.github.io/audio/salamander/A1.mp3',
  A2: 'https://tonejs.github.io/audio/salamander/A2.mp3',
  A3: 'https://tonejs.github.io/audio/salamander/A3.mp3',
  A4: 'https://tonejs.github.io/audio/salamander/A4.mp3',
  A5: 'https://tonejs.github.io/audio/salamander/A5.mp3',
  C2: 'https://tonejs.github.io/audio/salamander/C2.mp3',
  C3: 'https://tonejs.github.io/audio/salamander/C3.mp3',
  C4: 'https://tonejs.github.io/audio/salamander/C4.mp3',
  C5: 'https://tonejs.github.io/audio/salamander/C5.mp3',
  'D#2': 'https://tonejs.github.io/audio/salamander/Ds2.mp3',
  'D#3': 'https://tonejs.github.io/audio/salamander/Ds3.mp3',
  'D#4': 'https://tonejs.github.io/audio/salamander/Ds4.mp3',
  'F#2': 'https://tonejs.github.io/audio/salamander/Fs2.mp3',
  'F#3': 'https://tonejs.github.io/audio/salamander/Fs3.mp3',
  'F#4': 'https://tonejs.github.io/audio/salamander/Fs4.mp3',
};

export const SAMPLE_PACKS: readonly SamplePack[] = [
  {
    id: 'empty',
    label: 'Empty (falls back to PluckSynth)',
    description:
      'No samples loaded — Sampler-kind voice plays as a neutral PluckSynth until a pack is attached.',
    samples: {},
  },
  {
    id: 'salamander-piano-demo',
    label: 'Salamander Piano (demo)',
    description:
      'Tone.js example samples — piano, not guitar. Proves the Sampler pipeline end-to-end. Replace with a real guitar pack hosted at /samples/<pack-id>/ for production.',
    samples: SALAMANDER_PIANO_DEMO,
  },
  {
    id: 'casio-piano-demo',
    label: 'Casio Piano (demo)',
    description:
      'Tone.js example samples — Casio CT-X3000 piano. Sparser than Salamander but more characterful. CC-BY hosted at tonejs.github.io.',
    samples: CASIO_PIANO_DEMO,
  },
  {
    id: 'philharmonia-classical',
    label: 'Philharmonia Classical Guitar',
    description:
      'Nylon-string classical guitar samples from the Philharmonia Orchestra (CC-BY-NC). Self-hosted on Supabase. Full chromatic E2 → C6 — no pitch-shifting needed for any note in the guitar range.',
    samples: PHILHARMONIA_CLASSICAL,
  },
];

/** Look up a pack by id. Returns undefined if not registered. */
export function getSamplePack(id: string): SamplePack | undefined {
  return SAMPLE_PACKS.find((p) => p.id === id);
}

/** Find which pre-registered pack (if any) matches a given sample map by deep
 *  shape. Used by the Lab UI to highlight the active pack in the picker after
 *  the preset hydrates from storage. Returns `null` if no match. */
export function detectSamplePack(samples: Readonly<Record<string, string>>): SamplePack | null {
  const keys = Object.keys(samples);
  for (const pack of SAMPLE_PACKS) {
    const packKeys = Object.keys(pack.samples);
    if (packKeys.length !== keys.length) continue;
    const allMatch = packKeys.every((k) => pack.samples[k] === samples[k]);
    if (allMatch) return pack;
  }
  return null;
}
