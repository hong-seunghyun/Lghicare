import {
  ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import s from "./renewal.module.css";
export function Accordion({
  title,
  children,
  open = false,
}: {
  title: ReactNode;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className={s.accordion} open={open}>
      <summary>
        <span>{title}</span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" strokeWidth="1.6" />
        </svg>
      </summary>
      <div>{children}</div>
    </details>
  );
}
export function CategoryRail({
  label,
  children,
  className = "",
  arrows = true,
  draggable = false,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  arrows?: boolean;
  draggable?: boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null),
    track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    id: number;
    x: number;
    left: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const measure = useCallback(() => {
    const node = viewport.current;
    if (!node) return;
    const left = node.scrollLeft > 2,
      right = node.scrollLeft + node.clientWidth < node.scrollWidth - 2;
    setEdges((old) =>
      old.left === left && old.right === right ? old : { left, right },
    );
  }, []);
  useEffect(() => {
    const observer = new ResizeObserver(measure);
    if (viewport.current) observer.observe(viewport.current);
    if (track.current) observer.observe(track.current);
    measure();
    return () => observer.disconnect();
  }, [measure]);
  const slide = (direction: number) => {
    const node = viewport.current;
    node?.scrollBy({
      left: direction * node.clientWidth * 0.75,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };
  return (
    <div
      className={`${s.categoryRail} ${!arrows ? s.railWithoutArrows : ""} ${draggable ? s.draggableRail : ""} ${dragging ? s.railDragging : ""} ${className}`}
      role="group"
      aria-label={label}
    >
      {arrows && (
        <button
          className={s.railArrow}
          aria-label={`${label} 이전`}
          disabled={!edges.left}
          onClick={() => slide(-1)}
        >
          ‹
        </button>
      )}
      <div
        className={s.railViewport}
        ref={viewport}
        onScroll={measure}
        tabIndex={draggable ? 0 : undefined}
        role={draggable ? "region" : undefined}
        aria-label={draggable ? `${label} 목록` : undefined}
        onDragStart={draggable ? (event) => event.preventDefault() : undefined}
        onPointerDown={(event) => {
          if (!draggable || event.pointerType !== "mouse" || event.button !== 0)
            return;
          suppressClick.current = false;
          drag.current = {
            id: event.pointerId,
            x: event.clientX,
            left: event.currentTarget.scrollLeft,
            moved: false,
          };
        }}
        onPointerMove={(event) => {
          const state = drag.current;
          if (!state || state.id !== event.pointerId) return;
          const distance = event.clientX - state.x;
          if (!state.moved && Math.abs(distance) < 6) return;
          if (!state.moved) {
            state.moved = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging(true);
          }
          event.preventDefault();
          event.currentTarget.scrollLeft = state.left - distance;
        }}
        onPointerUp={(event) => {
          const state = drag.current;
          if (!state || state.id !== event.pointerId) return;
          suppressClick.current = state.moved;
          drag.current = null;
          setDragging(false);
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = null;
          suppressClick.current = false;
          setDragging(false);
        }}
        onPointerLeave={() => {
          if (!drag.current?.moved) drag.current = null;
        }}
        onClickCapture={(event) => {
          if (!suppressClick.current || event.detail === 0) return;
          event.preventDefault();
          event.stopPropagation();
          suppressClick.current = false;
        }}
        onKeyDown={(event) => {
          if (!draggable || event.target !== event.currentTarget) return;
          const node = event.currentTarget;
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            slide(event.key === "ArrowRight" ? 1 : -1);
          } else if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            node.scrollLeft = event.key === "Home" ? 0 : node.scrollWidth;
          }
        }}
      >
        <div className={s.railTrack} ref={track}>
          {children}
        </div>
      </div>
      {arrows && (
        <button
          className={s.railArrow}
          aria-label={`${label} 다음`}
          disabled={!edges.right}
          onClick={() => slide(1)}
        >
          ›
        </button>
      )}
    </div>
  );
}
export function SelectField({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label className={s.field} htmlFor={id}>
      <span className={s.controlLabel}>{label}</span>
      <span className={s.selectWrap}>
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label || "없음"}
            </option>
          ))}
        </select>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path d="m5 9 7 7 7-7" strokeWidth="1.7" />
        </svg>
      </span>
    </label>
  );
}
export function RadioField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend>{label}</legend>
      <div className={s.choiceRow}>
        {options.map((o) => (
          <label
            className={value === o.value ? s.choiceSelected : ""}
            key={o.value}
          >
            <input
              type="radio"
              name={name}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            {o.label || "없음"}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
