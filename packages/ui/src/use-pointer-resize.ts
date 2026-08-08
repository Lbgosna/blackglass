import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

export interface PointerResizeOptions {
  axis: "x" | "y";
  clamp: (value: number) => number;
  cursor: "col-resize" | "row-resize";
  direction?: 1 | -1;
  onChange: (value: number) => void;
  value: number;
}

interface ResizeSession {
  moved: boolean;
  pointerId: number;
  startCoordinate: number;
  startValue: number;
  target: HTMLElement;
}

export function usePointerResize({
  axis,
  clamp,
  cursor,
  direction = 1,
  onChange,
  value,
}: PointerResizeOptions) {
  const session = useRef<ResizeSession | null>(null);
  const pendingCoordinate = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const previousCursor = useRef("");
  const previousUserSelect = useRef("");
  const valueRef = useRef(value);
  const clampRef = useRef(clamp);
  const onChangeRef = useRef(onChange);
  valueRef.current = value;
  clampRef.current = clamp;
  onChangeRef.current = onChange;

  const coordinateFor = useCallback(
    (event: Pick<PointerEvent, "clientX" | "clientY">) =>
      axis === "x" ? event.clientX : event.clientY,
    [axis],
  );

  const restoreDocument = useCallback(() => {
    document.documentElement.classList.remove("shell-resizing");
    document.body.style.cursor = previousCursor.current;
    document.body.style.userSelect = previousUserSelect.current;
  }, []);

  const applyCoordinate = useCallback((coordinate: number) => {
    const active = session.current;
    if (!active) return;
    const delta = (coordinate - active.startCoordinate) * direction;
    onChangeRef.current(clampRef.current(active.startValue + delta));
  }, [direction]);

  const cancelFrame = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    pendingCoordinate.current = null;
  }, []);

  const finish = useCallback(
    (pointerId?: number) => {
      const active = session.current;
      if (!active || (pointerId !== undefined && pointerId !== active.pointerId)) return;
      if (pendingCoordinate.current !== null) applyCoordinate(pendingCoordinate.current);
      cancelFrame();
      suppressClick.current = active.moved;
      try {
        if (active.target.hasPointerCapture?.(active.pointerId)) {
          active.target.releasePointerCapture(active.pointerId);
        }
      } catch {
        // The browser may release capture before pointercancel reaches React.
      }
      session.current = null;
      restoreDocument();
    },
    [applyCoordinate, cancelFrame, restoreDocument],
  );

  useEffect(
    () => () => {
      const active = session.current;
      cancelFrame();
      if (active) {
        try {
          if (active.target.hasPointerCapture?.(active.pointerId)) {
            active.target.releasePointerCapture(active.pointerId);
          }
        } catch {
          // Cleanup must continue even if the capture was already lost.
        }
        restoreDocument();
      }
      session.current = null;
    },
    [cancelFrame, restoreDocument],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || event.isPrimary === false || session.current) return;
      const target = event.currentTarget;
      session.current = {
        moved: false,
        pointerId: event.pointerId,
        startCoordinate: coordinateFor(event),
        startValue: valueRef.current,
        target,
      };
      previousCursor.current = document.body.style.cursor;
      previousUserSelect.current = document.body.style.userSelect;
      document.documentElement.classList.add("shell-resizing");
      document.body.style.cursor = cursor;
      document.body.style.userSelect = "none";
      try {
        target.setPointerCapture?.(event.pointerId);
      } catch {
        session.current = null;
        restoreDocument();
        return;
      }
      event.preventDefault();
    },
    [coordinateFor, cursor, restoreDocument],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const active = session.current;
      if (!active || event.pointerId !== active.pointerId) return;
      const coordinate = coordinateFor(event);
      if (Math.abs(coordinate - active.startCoordinate) > 2) active.moved = true;
      pendingCoordinate.current = coordinate;
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        const nextCoordinate = pendingCoordinate.current;
        pendingCoordinate.current = null;
        if (nextCoordinate !== null) applyCoordinate(nextCoordinate);
      });
    },
    [applyCoordinate, coordinateFor],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => finish(event.pointerId),
    [finish],
  );
  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => finish(event.pointerId),
    [finish],
  );
  const onClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return { onClick, onPointerCancel, onPointerDown, onPointerMove, onPointerUp };
}
