import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowUpDown } from 'lucide-react';

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  className?: string;
  align?: 'left' | 'right' | 'center';
  gradient?: boolean;
}

const COLORS = [
  '#ffffff', '#d1d4dc', '#b2b5be', '#787b86', '#434651', '#18181b', '#000000',
  '#f23645', '#ff9800', '#ffeb3b', '#4caf50', '#089981', '#9ca3af', '#4b5563',
  '#9c27b0', '#e91e63', '#9575cd', '#7986cb', '#64b5f6', '#4dd0e1', '#4db6ac',
  '#81c784', '#aed581', '#dce775', '#fff176', '#ffd54f', '#ffb74d', '#ff8a65',
];

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

type GradientPair = { top: RGBA; bottom: RGBA };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function parseColor(input: string): RGBA | null {
  const str = (input || '').trim().toLowerCase();
  if (str === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  let m = str.match(/^#([0-9a-f]{3})$/);
  if (m) {
    const v = m[1];
    return {
      r: parseInt(v[0] + v[0], 16),
      g: parseInt(v[1] + v[1], 16),
      b: parseInt(v[2] + v[2], 16),
      a: 1,
    };
  }

  m = str.match(/^#([0-9a-f]{6})$/);
  if (m) {
    const v = m[1];
    return {
      r: parseInt(v.slice(0, 2), 16),
      g: parseInt(v.slice(2, 4), 16),
      b: parseInt(v.slice(4, 6), 16),
      a: 1,
    };
  }

  m = str.match(/^rgba?\(([^)]*)\)$/);
  if (m) {
    const parts = m[1].split(',').map((p) => p.trim()).filter((p) => p.length > 0);
    if (parts.length >= 3) {
      const r = clamp(parseFloat(parts[0]) || 0, 0, 255);
      const g = clamp(parseFloat(parts[1]) || 0, 0, 255);
      const b = clamp(parseFloat(parts[2]) || 0, 0, 255);
      let a = 1;
      if (parts[3] !== undefined && parts[3] !== '') {
        const raw = parts[3].replace('%', '');
        const parsed = parseFloat(raw);
        a = clamp(parts[3].includes('%') ? parsed / 100 : parsed, 0, 1);
      }
      return { r, g, b, a };
    }
  }
  return null;
}

function toHex({ r, g, b }: RGBA): string {
  const to2 = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

function toCss({ r, g, b, a }: RGBA): string {
  const rn = clamp(Math.round(r), 0, 255);
  const gn = clamp(Math.round(g), 0, 255);
  const bn = clamp(Math.round(b), 0, 255);
  if (a >= 1) return `#${[rn, gn, bn].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
  const alpha = Math.round(a * 100) / 100;
  return `rgba(${rn}, ${gn}, ${bn}, ${alpha})`;
}

function rgbToHsv({ r, g, b }: RGBA): { h: number; s: number; v: number } {
  const rn = clamp(r, 0, 255) / 255;
  const gn = clamp(g, 0, 255) / 255;
  const bn = clamp(b, 0, 255) / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const hn = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs((hn / 60) % 2 - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hn < 60) { rp = c; gp = x; }
  else if (hn < 120) { rp = x; gp = c; }
  else if (hn < 180) { gp = c; bp = x; }
  else if (hn < 240) { gp = x; bp = c; }
  else if (hn < 300) { rp = x; bp = c; }
  else { rp = c; bp = x; }
  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

function parseGradient(input: string): GradientPair | null {
  const m = (input || '').trim().match(/^linear-gradient\(\s*180deg\s*,\s*(.*?)\s*,\s*(.*?)\s*\)$/i);
  if (!m) return null;
  const top = parseColor(m[1]);
  const bottom = parseColor(m[2]);
  if (!top || !bottom) return null;
  return { top, bottom };
}

function gradientCss(stops: [RGBA, RGBA]): string {
  return `linear-gradient(180deg, ${toCss(stops[0])}, ${toCss(stops[1])})`;
}

/**
 * Capability probe: decide whether the in-app (HTML/CSS + PointerEvent)
 * color picker can be used. On very old/restricted environments that lack
 * PointerEvent or CSS gradient support we fall back to the native
 * <input type="color"> dialog instead.
 */
function supportsCustomPicker(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    if (typeof window.PointerEvent === 'undefined') return false;
    if (typeof window.CSS === 'undefined' || typeof window.CSS.supports !== 'function') return false;
    if (!window.CSS.supports('background', 'linear-gradient(0deg, #000, #fff)')) return false;
    return true;
  } catch {
    return false;
  }
}

const CHECKERBOARD = 'repeating-conic-gradient(rgba(127,127,127,0.28) 0% 25%, transparent 0% 50%) 0 0 / 6px 6px';
const POPOVER_WIDTH = 256;

export function ColorPicker({ color, onChange, className = '', align = 'left', gradient = false }: ColorPickerProps) {
  const [canUseCustom] = useState<boolean>(() => supportsCustomPicker());
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<string>(color);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const svBoxRef = useRef<HTMLDivElement>(null);
  const hueBarRef = useRef<HTMLDivElement>(null);
  const alphaBarRef = useRef<HTMLDivElement>(null);

  const gradInfo = parseGradient(color);
  const parsedSolid = parseColor(color) ?? { r: 0, g: 0, b: 0, a: 1 };
  const parsed = gradInfo ? gradInfo.top : parsedSolid;
  const hsv = rgbToHsv(parsed);

  const [mode, setMode] = useState<'solid' | 'gradient'>(() => (gradient && parseGradient(color) ? 'gradient' : 'solid'));
  const [stops, setStops] = useState<[RGBA, RGBA]>([parsed, parsed]);
  const [activeStop, setActiveStop] = useState<0 | 1>(0);

  // Keep mode/stops in sync when the value changes externally (e.g. reset colors).
  useEffect(() => {
    if (!gradient) return;
    const g = parseGradient(color);
    if (g) {
      setStops([g.top, g.bottom]);
      setMode('gradient');
    } else {
      setMode('solid');
    }
  }, [color, gradient]);

  useEffect(() => {
    setDraft(color);
  }, [color]);

  const computePos = useCallback(
    (btnRect: DOMRect, w: number, h: number) => {
      const gap = 6;
      const pad = 8;
      let left = align === 'right'
        ? btnRect.right - w
        : align === 'center'
          ? btnRect.left + btnRect.width / 2 - w / 2
          : btnRect.left;
      left = clamp(left, pad, Math.max(pad, window.innerWidth - w - pad));
      const below = btnRect.bottom + gap + h <= window.innerHeight - pad;
      const top = below ? btnRect.bottom + gap : Math.max(pad, btnRect.top - h - gap);
      return { top, left };
    },
    [align]
  );

  const measureAndReposition = useCallback(() => {
    const btn = triggerRef.current;
    const el = popoverRef.current;
    if (!btn || !el) return;
    setPopoverPos(computePos(btn.getBoundingClientRect(), el.offsetWidth, el.offsetHeight));
  }, [computePos]);

  useEffect(() => {
    if (!isOpen) return;
    measureAndReposition();
    window.addEventListener('resize', measureAndReposition);
    window.addEventListener('scroll', measureAndReposition, true);
    return () => {
      window.removeEventListener('resize', measureAndReposition);
      window.removeEventListener('scroll', measureAndReposition, true);
    };
  }, [isOpen, measureAndReposition, mode]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  const openPopover = () => {
    const btn = triggerRef.current;
    if (!btn) return;
    setPopoverPos(computePos(btn.getBoundingClientRect(), POPOVER_WIDTH, 430));
    setIsOpen(true);
  };

  const emit = (next: RGBA) => {
    const css = toCss(next);
    setDraft(css);
    onChange(css);
  };

  const emitGradient = (nextStops: [RGBA, RGBA]) => {
    setStops(nextStops);
    const css = gradientCss(nextStops);
    setDraft(css);
    onChange(css);
  };

  const activeRGBA = mode === 'gradient' ? stops[activeStop] : parsed;
  const activeHsv = mode === 'gradient' ? rgbToHsv(activeRGBA) : hsv;

  const svToColor = (clientX: number, clientY: number) => {
    const el = svBoxRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const s = clamp((clientX - rect.left) / rect.width, 0, 1);
    const v = clamp(1 - (clientY - rect.top) / rect.height, 0, 1);
    const { r, g, b } = hsvToRgb(activeHsv.h, s, v);
    const next: RGBA = { r, g, b, a: activeRGBA.a };
    if (mode === 'gradient') {
      const nextStops: [RGBA, RGBA] = activeStop === 0 ? [next, stops[1]] : [stops[0], next];
      emitGradient(nextStops);
    } else {
      emit(next);
    }
  };

  const hueToColor = (clientX: number) => {
    const el = hueBarRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const h = clamp(((clientX - rect.left) / rect.width) * 360, 0, 360);
    const { r, g, b } = hsvToRgb(h, activeHsv.s, activeHsv.v);
    const next: RGBA = { r, g, b, a: activeRGBA.a };
    if (mode === 'gradient') {
      const nextStops: [RGBA, RGBA] = activeStop === 0 ? [next, stops[1]] : [stops[0], next];
      emitGradient(nextStops);
    } else {
      emit(next);
    }
  };

  const alphaToColor = (clientX: number) => {
    const el = alphaBarRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const a = clamp((clientX - rect.left) / rect.width, 0, 1);
    const next: RGBA = { r: activeRGBA.r, g: activeRGBA.g, b: activeRGBA.b, a };
    if (mode === 'gradient') {
      const nextStops: [RGBA, RGBA] = activeStop === 0 ? [next, stops[1]] : [stops[0], next];
      emitGradient(nextStops);
    } else {
      emit(next);
    }
  };

  const dragProps = (update: (x: number, y: number) => void) => ({
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      update(e.clientX, e.clientY);
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        update(e.clientX, e.clientY);
      }
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    },
  });

  const commitDraft = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed.toLowerCase() === 'transparent') {
      setDraft('transparent');
      onChange('transparent');
      return;
    }
    const g = parseGradient(trimmed);
    if (g) {
      setStops([g.top, g.bottom]);
      setMode('gradient');
      setDraft(trimmed);
      onChange(trimmed);
      return;
    }
    const next = parseColor(trimmed);
    if (!next) {
      setDraft(color);
      return;
    }
    const css = toCss(next);
    setDraft(css);
    setMode('solid');
    onChange(css);
  };

  const switchMode = (next: 'solid' | 'gradient') => {
    if (next === mode) return;
    if (next === 'gradient') {
      setMode('gradient');
      const cur = parseGradient(color) ?? { top: parsedSolid, bottom: parsedSolid };
      setStops([cur.top, cur.bottom]);
      emitGradient([cur.top, cur.bottom]);
    } else {
      setMode('solid');
      const cur = parseGradient(color)?.top ?? parsedSolid;
      emit(cur);
    }
  };

  // Fallback: custom picker not supported on this platform/browser → keep the
  // native <input type="color"> behavior (same as before).
  if (!canUseCustom) {
    const hexValue = toHex(parsed);
    return (
      <div className={`relative ${className}`}>
        <div
          className="relative h-7 w-7 shrink-0 overflow-hidden rounded-lg border border-[var(--border-soft)] shadow-sm"
          style={{ background: color }}
          title="Pick a color"
        >
          <input
            type="color"
            value={hexValue}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>
      </div>
    );
  }

  const solidHandle = toHex({ ...activeRGBA, a: 1 });
  const solidActive = mode === 'solid';

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={openPopover}
        title="Pick a color"
        aria-label="Pick a color"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className="relative h-7 w-7 shrink-0 overflow-hidden rounded-lg border border-[var(--border-soft)] shadow-sm transition-colors hover:border-[var(--border-strong)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-1)]"
      >
        <span className="absolute inset-0" style={{ background: CHECKERBOARD }} />
        <span className="absolute inset-0" style={{ backgroundColor: color }} />
      </button>

      {createPortal(
        <AnimatePresence>
          {isOpen && popoverPos && (
            <motion.div
              ref={popoverRef}
              initial={{ opacity: 0, y: 4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.96 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              role="dialog"
              aria-label="Custom color picker"
              className="aura-color-picker-popover w-64 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-1)] p-3 shadow-md"
              style={{ position: 'fixed', top: popoverPos.top, left: popoverPos.left, zIndex: 9999 }}
            >
              {gradient && (
                <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-2)] p-0.5">
                  {(['solid', 'gradient'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => switchMode(m)}
                      className={`rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                        mode === m
                          ? 'bg-[var(--accent-1)]/15 text-[var(--accent-1)]'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {m === 'solid' ? 'Solid' : 'Gradient'}
                    </button>
                  ))}
                </div>
              )}

              {/* Presets */}
              <div className="grid grid-cols-7 gap-1.5">
                {COLORS.map((c) => {
                  const cRgba = parseColor(c) ?? { r: 0, g: 0, b: 0, a: 1 };
                  const isSelected = mode === 'solid' && toCss(parsed).toLowerCase() === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        if (mode === 'gradient') {
                          const nextStops: [RGBA, RGBA] = activeStop === 0 ? [cRgba, stops[1]] : [stops[0], cRgba];
                          emitGradient(nextStops);
                        } else {
                          emit(cRgba);
                        }
                      }}
                      className={`h-6 w-6 rounded-md transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-[var(--accent-1)] focus:ring-offset-1 focus:ring-offset-[var(--surface-1)] ${
                        isSelected ? 'ring-2 ring-white ring-offset-1 ring-offset-[var(--surface-1)]' : ''
                      }`}
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  );
                })}
              </div>

              {/* Saturation / Value box */}
              <div
                ref={svBoxRef}
                {...dragProps(svToColor)}
                className="relative mt-3 h-36 w-full cursor-crosshair touch-none rounded-lg border border-[var(--border-soft)] select-none"
                style={{
                  background: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, hsl(${activeHsv.h}, 100%, 50%))`,
                }}
              >
                <div
                  className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                  style={{ left: `${activeHsv.s * 100}%`, top: `${(1 - activeHsv.v) * 100}%`, backgroundColor: solidHandle }}
                />
              </div>

              {/* Hue */}
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  <span>Hue</span>
                  <span className="font-mono normal-case">{Math.round(activeHsv.h)}°</span>
                </div>
                <div
                  ref={hueBarRef}
                  {...dragProps(hueToColor)}
                  className="relative h-3 w-full cursor-pointer touch-none select-none rounded-full"
                  style={{
                    background: 'linear-gradient(to right, #f00 0%, #ff0 16.66%, #0f0 33.33%, #0ff 50%, #00f 66.66%, #f0f 83.33%, #f00 100%)',
                  }}
                >
                  <div
                    className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                    style={{ left: `${(activeHsv.h / 360) * 100}%`, backgroundColor: solidHandle }}
                  />
                </div>
              </div>

              {/* Opacity / Alpha */}
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  <span>Opacity</span>
                  <span className="font-mono normal-case">{Math.round(activeRGBA.a * 100)}%</span>
                </div>
                <div
                  ref={alphaBarRef}
                  {...dragProps(alphaToColor)}
                  className="relative h-3 w-full cursor-pointer touch-none select-none rounded-full"
                  style={{
                    background: `linear-gradient(to right, rgba(${activeRGBA.r}, ${activeRGBA.g}, ${activeRGBA.b}, 0), rgba(${activeRGBA.r}, ${activeRGBA.g}, ${activeRGBA.b}, 1))`,
                  }}
                >
                  <div
                    className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                    style={{ left: `${activeRGBA.a * 100}%`, backgroundColor: 'var(--text-primary)' }}
                  />
                </div>
              </div>

              {/* Gradient stops */}
              {mode === 'gradient' && (
                <div className="mt-3 border-t border-[var(--border-soft)] pt-3">
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Top</span>
                      <button
                        type="button"
                        onClick={() => setActiveStop(0)}
                        aria-label="Gradient top stop"
                        className={`relative h-6 w-6 overflow-hidden rounded-md border transition-all ${
                          activeStop === 0 ? 'border-[var(--accent-1)] ring-1 ring-[var(--accent-1)]' : 'border-[var(--border-soft)] hover:border-[var(--border-strong)]'
                        }`}
                        style={{ background: CHECKERBOARD }}
                      >
                        <span className="absolute inset-0" style={{ backgroundColor: toCss(stops[0]) }} />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => emitGradient([stops[1], stops[0]])}
                      className="mt-4 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
                      title="Swap gradient stops"
                      aria-label="Swap gradient stops"
                    >
                      <ArrowUpDown size={12} />
                    </button>

                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Bottom</span>
                      <button
                        type="button"
                        onClick={() => setActiveStop(1)}
                        aria-label="Gradient bottom stop"
                        className={`relative h-6 w-6 overflow-hidden rounded-md border transition-all ${
                          activeStop === 1 ? 'border-[var(--accent-1)] ring-1 ring-[var(--accent-1)]' : 'border-[var(--border-soft)] hover:border-[var(--border-strong)]'
                        }`}
                        style={{ background: CHECKERBOARD }}
                      >
                        <span className="absolute inset-0" style={{ backgroundColor: toCss(stops[1]) }} />
                      </button>
                    </div>

                    <div className="min-w-0 flex-1">
                      <span className="block text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Preview</span>
                      <div
                        className="relative mt-1 h-6 w-full overflow-hidden rounded-md border border-[var(--border-soft)]"
                        style={{ background: CHECKERBOARD }}
                      >
                        <span className="absolute inset-0" style={{ background: gradientCss(stops) }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Value + transparent */}
              <div className="mt-3 flex items-center gap-2 border-t border-[var(--border-soft)] pt-3">
                <div
                  className="relative h-6 w-6 shrink-0 overflow-hidden rounded-md border border-[var(--border-soft)]"
                  style={{ background: CHECKERBOARD }}
                >
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundColor: mode === 'gradient' ? 'transparent' : toCss(parsed),
                      backgroundImage: mode === 'gradient' ? gradientCss(stops) : undefined,
                    }}
                  />
                </div>
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commitDraft(draft)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      commitDraft(draft);
                      e.currentTarget.blur();
                    }
                  }}
                  spellCheck={false}
                  aria-label="Color value"
                  className="min-w-0 flex-1 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-1)] px-2 py-1.5 font-mono text-[11px] text-[var(--text-secondary)] uppercase outline-none transition-colors focus:border-[var(--accent-1)] focus:ring-1 focus:ring-[var(--accent-1)]/20"
                />
                <button
                  type="button"
                  onClick={() => {
                    setDraft('transparent');
                    onChange('transparent');
                  }}
                  className="shrink-0 rounded-lg border border-[var(--border-soft)] px-2 py-1.5 text-[10px] font-semibold text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                  title="Fully transparent (no fill / background)"
                >
                  None
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
