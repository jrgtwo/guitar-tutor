import { useCallback, useEffect, useRef } from 'react';

interface UseDraggableArgs {
  position: { x: number; y: number };
  onPositionChange: (next: { x: number; y: number }) => void;
  /** Element size for viewport clamping. */
  width: number;
  height: number;
}

/**
 * Returns an `onMouseDown` handler to attach to the panel's drag handle. While dragging,
 * mousemove on the document updates position; mouseup releases. Position is clamped so
 * the panel can't disappear off-screen.
 */
export function useDraggable({ position, onPositionChange, width, height }: UseDraggableArgs) {
  // Refs so the document-level handlers always read the latest values without re-binding.
  const positionRef = useRef(position);
  positionRef.current = position;
  const sizeRef = useRef({ width, height });
  sizeRef.current = { width, height };

  const dragOffset = useRef<{ dx: number; dy: number } | null>(null);

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragOffset.current) return;
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

  const onMouseUp = useCallback(() => {
    dragOffset.current = null;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.style.userSelect = '';
  }, [onMouseMove]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const { x, y } = positionRef.current;
      dragOffset.current = { dx: e.clientX - x, dy: e.clientY - y };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = 'none';
    },
    [onMouseMove, onMouseUp],
  );

  // Cleanup any in-flight listeners if the component unmounts mid-drag.
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = '';
    };
  }, [onMouseMove, onMouseUp]);

  return { onMouseDown };
}
