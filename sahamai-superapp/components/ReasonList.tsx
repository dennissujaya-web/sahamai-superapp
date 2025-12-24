export function ReasonList({ items }: { items: string[] }) {
  if (!items?.length) return null;
  return (
    <ul className="mt-2 space-y-1 text-sm text-zinc-700">
      {items.map((x, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-zinc-400" />
          <span>{x}</span>
        </li>
      ))}
    </ul>
  );
}
