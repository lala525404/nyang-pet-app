import { useEffect, useRef } from 'react';
import type { CSSProperties, RefObject } from 'react';
import '../styles/ui.css';

// 세그먼트: 회색 트랙 안에 선택된 것만 흰 알약
export function Segmented<T extends string | number>({ value, options, onChange, label }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="ui-seg" role="group" aria-label={label}>
      {options.map(o => (
        <button key={String(o.value)} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean;
}) {
  return (
    <button type="button" className="ui-switch" role="switch" aria-checked={checked} aria-label={label}
      disabled={disabled} onClick={() => onChange(!checked)} />
  );
}

export function RangeInput({ value, min, max, step, onChange, label, id }: {
  value: number; min: number; max: number; step: number; onChange: (v: number) => void; label?: string; id?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input id={id} className="ui-range" type="range" min={min} max={max} step={step} value={value}
      aria-label={label} style={{ '--p': `${pct}%` } as CSSProperties}
      onChange={e => onChange(Number(e.target.value))} />
  );
}

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';

// 모달 접근성: 열릴 때 포커스 이동, 닫힐 때 복원, Esc 닫기, Tab 순환. suspended면(위에 다른 모달) 키 처리를 건너뛴다.
export function useDialog(ref: RefObject<HTMLElement>, onClose: () => void, suspended = false) {
  const onCloseRef = useRef(onClose);
  const suspendedRef = useRef(suspended);
  useEffect(() => { onCloseRef.current = onClose; suspendedRef.current = suspended; });

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (suspendedRef.current || !ref.current) return;
      if (e.key === 'Escape') { onCloseRef.current(); return; }
      if (e.key !== 'Tab') return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === ref.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (prev && document.contains(prev)) prev.focus();
    };
  }, [ref]);
}
