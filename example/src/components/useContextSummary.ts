import {
  useFretworkStore,
  useMetronomeStore,
  getScale,
  getArpeggio,
  getInstrument,
  getTuning,
  getTimeSignature,
} from '@fretwork/lib';

export function useContextSummary(): string {
  const key = useFretworkStore((s) => s.key);
  const mode = useFretworkStore((s) => s.mode);
  const type = useFretworkStore((s) => s.type);
  const shapeId = useFretworkStore((s) => s.shapeId);
  const instrumentId = useFretworkStore((s) => s.instrumentId);
  const tuningId = useFretworkStore((s) => s.tuning);
  const bpm = useMetronomeStore((s) => s.bpm);
  const timeSignatureId = useMetronomeStore((s) => s.timeSignatureId);

  const typeLabel = (() => {
    if (mode === 'scales') return getScale(type)?.name ?? type;
    if (mode === 'arpeggios') return getArpeggio(type)?.name ?? type;
    return type;
  })();

  const instrumentLabel = getInstrument(instrumentId)?.name ?? instrumentId;
  const tuningLabel = getTuning(tuningId)?.name ?? tuningId;
  const timeSignatureLabel = getTimeSignature(timeSignatureId)?.id ?? timeSignatureId;

  const parts: string[] = [
    `${key} ${typeLabel}`,
    instrumentLabel,
    tuningLabel,
  ];
  if (shapeId) parts.push(shapeId.replace('caged-', '').toUpperCase() + ' shape');
  parts.push(`♩ = ${bpm}`); // quarter note · BPM
  parts.push(timeSignatureLabel);
  return parts.join(' · ');
}
