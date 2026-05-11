import { useCallback, useEffect, useRef } from 'react';

interface UseDraggableArgs {
  position: { x: number; y: number };
  onPositionChange: (next: { x: number; y: number }) => void;
  /** Element size for viewport clamping. */
  width: number;
  height: number;
}

/**
 * Returns an `onPointerDown` handler to attach to the panel's drag handle. Uses Pointer
 * Events so it works for mouse, touch, and pen with one code path. The handle element
 * should also set `touch-action: none` so touch sequences become pointer events instead
 * of being swallowed by the browser as page-scroll gestures.
 */
export function useDraggable({ position, onPositionChange, width, height }: UseDraggableArgs) {
  const positionRef = useRef(position);
  positionRef.current = position;
  const sizeRef = useRef({ width, height });
  sizeRef.current = { width, height };

  const dragOffset = useRef<{ dx: number; dy: number; pointerId: number } | null>(null);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragOffset.current || e.pointerId !== dragOffset.current.pointerId) return;
      const { dx, dy } = dragOffset.current;
      const { width: w, height: h } = sizeRef.current;
      const maxX = window.innerWidth - w;
      const maxY = window.innerHeight - h;
      const x = Math.max(0, Math.min(maxX, e.clientX - dx));
      const y = Math.max(0, Math.min(maxY, e.clientY - dy));
      onPositionChange({ x, y });
    },
    [onPositionChange],
  );

  const onPointerUp = useCallback(
    (e: PointerEvent) => {
      if (dragOffset.current && e.pointerId !== dragOffset.current.pointerId) return;
      dragOffset.current = null;
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
      document.body.style.userSelect = '';
    },
    [onPointerMove],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only start a drag for primary pointer (left mouse / single touch / pen tip).
      if (!e.isPrimary) return;
      e.preventDefault();
      const { x, y } = positionRef.current;
      dragOffset.current = { dx: e.clientX - x, dy: e.clientY - y, pointerId: e.pointerId };
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
      document.addEventListener('pointercancel', onPointerUp);
      document.body.style.userSelect = 'none';
    },
    [onPointerMove, onPointerUp],
  );

  // Cleanup any in-flight listeners if the component unmounts mid-drag.
  useEffect(() => {
    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
      document.body.style.userSelect = '';
    };
  }, [onPointerMove, onPointerUp]);

  return { onPointerDown };
}
