/**
 * Audition deck — buttons that drive the active Voice with predetermined musical
 * material so the user can compare changes at a glance.
 *
 *   Single note:    plays the selected note once.
 *   Scale up & down: plays C major in two octaves, ascending then descending.
 *   Chord:           plays the open voicing of a major triad simultaneously.
 *
 * All audition routines schedule via Tone.now() with small offsets — they do not
 * use the metronome, so the lab is self-contained.
 */
import { Button, startAudio, audioNow, MasterBus, type Voice } from '@fretwork/lib';

const NOTE_OPTIONS = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4', 'A4', 'C4', 'E5'];

interface AuditionDeckProps {
  voice: Voice | null;
  testNote: string;
  setTestNote: (n: string) => void;
}

export function AuditionDeck({ voice, testNote, setTestNote }: AuditionDeckProps) {
  /** Ensure the AudioContext is unlocked AND the master bus (with reverb IR) is
   *  built. Both are idempotent — calling repeatedly is cheap. The 50ms pre-roll
   *  applied to scheduled times below avoids any "scheduled in the past" race
   *  immediately after the AudioContext resumes. */
  const PREROLL_SEC = 0.05;

  const ensureReady = async () => {
    await startAudio();
    await MasterBus.warmup();
  };

  const playSingle = async () => {
    await ensureReady();
    if (!voice) return;
    voice.play(testNote, '4n', audioNow() + PREROLL_SEC);
  };

  const playScale = async () => {
    await ensureReady();
    if (!voice) return;
    // C major two octaves up + back down. 8th notes at 120 BPM = 0.25s per note.
    const ascending = ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
    const descending = [...ascending].slice(0, -1).reverse();
    const sequence = [...ascending, ...descending];
    const stepSec = 0.25;
    const start = audioNow() + PREROLL_SEC;
    sequence.forEach((note, i) => {
      voice.play(note, '8n', start + i * stepSec);
    });
  };

  const playChord = async () => {
    await ensureReady();
    if (!voice) return;
    // C major triad — root, third, fifth, octave.
    const notes = ['C3', 'E3', 'G3', 'C4'];
    const now = audioNow() + PREROLL_SEC;
    notes.forEach((note, i) => {
      // Tiny stagger so the synth has time to retrigger between voices.
      voice.play(note, '2n', now + i * 0.005);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" variant="secondary" onClick={playSingle}>
        ▶ Single note ({testNote})
      </Button>
      <Button size="sm" variant="secondary" onClick={playScale}>
        ▶ Scale up &amp; down
      </Button>
      <Button size="sm" variant="secondary" onClick={playChord}>
        ▶ Chord (C maj)
      </Button>
      <label className="flex items-center gap-2 text-xs">
        <span className="font-mono uppercase tracking-wider text-muted-foreground">Test note</span>
        <select
          value={testNote}
          onChange={(e) => setTestNote(e.target.value)}
          className="h-8 px-2 rounded-md bg-card border border-input font-mono text-xs"
        >
          {NOTE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
