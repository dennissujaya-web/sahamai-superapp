export function Badge({
  children,
  tone = "zinc",
}: {
  children: React.ReactNode;
  tone?: "green" | "yellow" | "red" | "zinc";
}) {
  const cls =
    tone === "green"
      ? "bg-green-100 text-green-800"
      : tone === "yellow"
      ? "bg-yellow-100 text-yellow-800"
      : tone === "red"
      ? "bg-red-100 text-red-800"
      : "bg-zinc-100 text-zinc-800";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}
