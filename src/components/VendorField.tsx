import { useEffect, useMemo, useRef, useState } from 'react';

/** 較 text-sm 放大 30%（0.875rem → 1.1375rem） */
const VENDOR_FIELD_TEXT = 'text-[1.1375rem] leading-snug';

type VendorFieldProps = {
  value: string;
  onChange: (value: string) => void;
  suggestions: readonly string[];
  placeholder?: string;
};

export default function VendorField({ value, onChange, suggestions, placeholder }: VendorFieldProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = q ? suggestions.filter((s) => s.toLowerCase().includes(q)) : [...suggestions];
    return list.slice(0, 12);
  }, [value, suggestions]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={`w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 ${VENDOR_FIELD_TEXT}`}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {filtered.map((name) => (
            <li key={name}>
              <button
                type="button"
                className={`w-full px-3 py-2.5 text-left hover:bg-amber-50 ${VENDOR_FIELD_TEXT}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(name);
                  setOpen(false);
                }}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
