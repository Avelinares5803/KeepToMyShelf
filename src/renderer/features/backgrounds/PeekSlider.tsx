import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Keys that change a slider's value. */
const SLIDER_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

interface PeekSliderProps {
  label: string;
  value: number;
  max: number;
  /** The value as read, e.g. "8 px". */
  valueText: string;
  /** Names the "Apply to all profiles" button for screen readers. */
  applyToAllLabel: string;
  /** The slider moves: the background shows the new value without saving it. */
  onPreview: (value: number) => void;
  /** The slider is released: the value is saved. */
  onCommit: (value: number) => void;
  /** True while the slider is held, so the settings dialog fades and the app shows. */
  onPeekChange: (peeking: boolean) => void;
  onApplyToAll: () => void;
}

/**
 * A setting of the background with a slider. While it is held (with the mouse or the keys),
 * only its row stays in the settings dialog, so the app behind shows the change; the value is
 * saved once, when it is released.
 */
export function PeekSlider({
  label,
  value,
  max,
  valueText,
  applyToAllLabel,
  onPreview,
  onCommit,
  onPeekChange,
  onApplyToAll,
}: PeekSliderProps) {
  const { t } = useTranslation();
  const id = useId();
  const slider = useRef<HTMLInputElement>(null);
  const [peeking, setPeeking] = useState(false);

  function peek(active: boolean) {
    setPeeking(active);
    onPeekChange(active);
  }

  /** The slider is let go: the dialog shows again and the value is saved once. */
  function release() {
    peek(false);
    if (slider.current) onCommit(slider.current.valueAsNumber);
  }

  return (
    <div className={`setting-row setting-row--slider${peeking ? ' setting-row--peeking' : ''}`}>
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <div className="range-field">
          <input
            ref={slider}
            id={id}
            type="range"
            min={0}
            max={max}
            step={1}
            value={value}
            aria-valuetext={valueText}
            onChange={(event) => onPreview(event.target.valueAsNumber)}
            onPointerDown={() => {
              peek(true);
              // Released anywhere, even outside the slider.
              window.addEventListener('pointerup', release, { once: true });
            }}
            onKeyDown={(event) => {
              if (SLIDER_KEYS.has(event.key) && !peeking) peek(true);
            }}
            onKeyUp={(event) => {
              if (SLIDER_KEYS.has(event.key)) release();
            }}
          />
          {/* Not an <output>: its "status" role would announce every step; the slider's
              aria-valuetext already says the value. */}
          <span className="range-field__value" aria-hidden="true">
            {valueText}
          </span>
        </div>
      </div>
      <button
        type="button"
        className="button button--ghost"
        aria-label={applyToAllLabel}
        onClick={onApplyToAll}
      >
        {t('settings.applyToAll')}
      </button>
    </div>
  );
}
