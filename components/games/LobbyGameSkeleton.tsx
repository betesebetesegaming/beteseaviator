export function LobbyGameSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-2.5 md:grid-cols-5 lg:grid-cols-6">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/6">
          <div className="aspect-[3/4] animate-pulse bg-white/10" />
        </div>
      ))}
    </div>
  );
}
