export function ScoreBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full rounded-full bg-zinc-100 overflow-hidden">
      <div className="h-2 rounded-full bg-zinc-900" style={{ width: `${v}%` }} />
    </div>
  );
}
