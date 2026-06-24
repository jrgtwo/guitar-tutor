/**
 * Force Tone.js's AudioContext to run at 48000 Hz regardless of the OS audio
 * device's reported sample rate. This module MUST be imported as the very first
 * import in `main.tsx` so it executes before any other module triggers Tone's
 * lazy default-context creation.
 *
 * Mirrors the example app's init (see lib `forceSampleRate`): some systems
 * report 192kHz and make the whole audio graph do 4x the per-sample work. The
 * browser resamples once at output. 48kHz is the industry standard and is
 * universally supported by Web Audio.
 */
import { forceSampleRate } from '@fretwork/lib';

forceSampleRate(48000);
