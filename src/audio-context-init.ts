/**
 * Force Tone.js's AudioContext to run at 48000 Hz regardless of the OS audio
 * device's reported sample rate. This module MUST be imported as the very
 * first import in `main.tsx` so it executes before any other module triggers
 * Tone's lazy default-context creation.
 *
 * Why this matters: some systems (especially Windows with "studio quality"
 * output drivers, certain USB audio interfaces, etc.) report sample rates as
 * high as 192000 Hz. Web Audio inherits that. Every audio operation —
 * sample interpolation, FFT pitch shifting, reverb convolution, gain
 * multiplication — does 4x more work per second at 192kHz vs 48kHz. The
 * audio thread can keep up (drift stays at 0) but at the cost of constant
 * load and edge-case artifacts in dense passages.
 *
 * Forcing 48kHz makes the entire audio graph run at 1/4 the per-sample
 * workload of a 192kHz context. The browser resamples once at the very end
 * to whatever the device wants — cheap, single-stage.
 *
 * 48000 Hz is the industry-standard rate for music production and is
 * universally supported by Web Audio implementations.
 */

import { forceSampleRate } from '@fretwork/lib';

forceSampleRate(48000);
