import Image from "next/image";

export function Logo({
  className = "",
  height = 36,
  showWordmark = true,
  priority = false,
}: {
  className?: string;
  height?: number;
  showWordmark?: boolean;
  /** Only set on above-the-fold logos (e.g. lobby header) to avoid unused preload warnings in game views. */
  priority?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Image
        src="/logo.png"
        alt="BETESE"
        width={Math.round(height * 2.4)}
        height={height}
        className="h-auto w-auto object-contain"
        priority={priority}
      />
      {showWordmark && (
        <span className="hidden font-bold tracking-tight sm:inline">
          <span className="text-white">BETESE </span>
          <span className="text-emerald-400">Aviator</span>
        </span>
      )}
    </span>
  );
}
