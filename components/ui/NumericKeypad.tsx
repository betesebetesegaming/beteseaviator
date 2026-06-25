"use client";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onDone?: () => void;
  className?: string;
};

/** Mobile-style floating numeric keypad for amount entry. */
export function NumericKeypad({ value, onChange, onDone, className = "" }: Props) {
  const press = (key: string) => {
    if (key === "back") {
      onChange(value.slice(0, -1));
      return;
    }
    if (key === "done") {
      onDone?.();
      return;
    }
    if (key === "." && value.includes(".")) return;
    if (key === "." && !value) {
      onChange("0.");
      return;
    }
    onChange(`${value}${key}`);
  };

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"] as const;

  return (
    <div
      className={`border-t border-white/10 bg-[#1c1c1e] px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 ${className}`}
      role="group"
      aria-label="Numeric keypad"
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs font-semibold text-slate-400">Enter amount (GMD)</span>
        <button
          type="button"
          onClick={() => onDone?.()}
          className="rounded-lg bg-emerald-500 px-3 py-1 text-xs font-bold text-white"
        >
          Done
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {keys.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            className="flex h-12 items-center justify-center rounded-xl bg-[#2c2c2e] text-lg font-bold text-white active:bg-[#3a3a3c]"
          >
            {key === "back" ? "⌫" : key}
          </button>
        ))}
      </div>
    </div>
  );
}
