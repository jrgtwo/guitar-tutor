/**
 * Audition deck — buttons that drive the active Voice with predetermined musical
 * material so the user can compare changes at a glance.
 *
 *   Single note:    plays the selected note once.
 *   Scale up & down: plays C major in two octaves, ascending then descending.
 *   Chord:           plays the open voicing of a major triad simultaneously.
 *   Loop:            toggles whether the last-clicked routine repeats. With
 *                    Loop on, each routine schedules a setTimeout to re-fire
 *                    itself after its duration completes. Toggling Loop off
 *                    cancels the pending timer; in-flight notes that were
 *                    already voice.play()'d complete naturally.
 *
 * All audition routines schedule via Tone.now() with small offsets — they do not
 * use the metronome, so the lab is self-contained.
 */
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { startAudio, audioNow, MasterBus, type Voice } from '@fretwork/lib';

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

  // Loop state + refs that survive Voice rebuilds. The audition closures read
  // from these refs (not their captured props) so that a re-fire triggered by
  // setTimeout uses the current Voice / testNote even if the user changed
  // either while the loop was running.
  const [loopEnabled, setLoopEnabled] = useState(false);
  const loopEnabledRef = useRef(false);
  const loopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceRef = useRef(voice);
  const testNoteRef = useRef(testNote);

  useEffect(() => {
    loopEnabledRef.current = loopEnabled;
  }, [loopEnabled]);
  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);
  useEffect(() => {
    testNoteRef.current = testNote;
  }, [testNote]);

  const cancelLoopTimer = () => {
    if (loopTimerRef.current) {
      clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
  };

  // When the user toggles Loop off mid-loop, cancel any pending re-fire.
  // Also cancel on unmount so we don't fire into a dead component.
  useEffect(() => {
    if (!loopEnabled) cancelLoopTimer();
  }, [loopEnabled]);
  useEffect(() => cancelLoopTimer, []);

  const scheduleRefire = (fn: () => void, durationMs: number) => {
    if (loopEnabledRef.current) {
      loopTimerRef.current = setTimeout(fn, durationMs);
    }
  };

  const ensureReady = async () => {
    await startAudio();
    await MasterBus.warmup();
  };

  const playSingle = async () => {
    cancelLoopTimer();
    await ensureReady();
    const v = voiceRef.current;
    if (!v) return;
    v.play(testNoteRef.current, '4n', audioNow() + PREROLL_SEC);
    // 4n at 120 BPM ≈ 500 ms; pad to 700 ms so loops don't feel glued.
    scheduleRefire(playSingle, 700);
  };

  const playScale = async () => {
    cancelLoopTimer();
    await ensureReady();
    const v = voiceRef.current;
    if (!v) return;
    // C major two octaves up + back down. 8th notes at 120 BPM = 0.25s per note.
    const ascending = ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
    const descending = [...ascending].slice(0, -1).reverse();
    const sequence = [...ascending, ...descending];
    const stepSec = 0.25;
    const start = audioNow() + PREROLL_SEC;
    sequence.forEach((note, i) => {
      v.play(note, '8n', start + i * stepSec);
    });
    // sequence.length * stepSec + 300ms gap before the next cycle.
    scheduleRefire(playScale, (sequence.length * stepSec + 0.3) * 1000);
  };

  const playChord = async () => {
    cancelLoopTimer();
    await ensureReady();
    const v = voiceRef.current;
    if (!v) return;
    // C major triad — root, third, fifth, octave.
    const notes = ['C3', 'E3', 'G3', 'C4'];
    const now = audioNow() + PREROLL_SEC;
    notes.forEach((note, i) => {
      // Tiny stagger so the synth has time to retrigger between voices.
      v.play(note, '2n', now + i * 0.005);
    });
    // 2n at 120 BPM ≈ 1000 ms; pad to 1400 ms.
    scheduleRefire(playChord, 1400);
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
      <Button
        size="sm"
        variant={loopEnabled ? 'default' : 'outline'}
        onClick={() => setLoopEnabled((v) => !v)}
        title={
          loopEnabled
            ? 'Loop on — click to stop (in-flight notes finish)'
            : 'Loop off — click to enable'
        }
      >
        ↻ Loop
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
