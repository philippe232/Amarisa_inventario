// Full-radius pill, the compact selector control used for filter
// options. Ported from reference/cereza/app/components/pill.tsx.
export default function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[48px] shrink-0 rounded-full border px-4 text-sm font-medium ${
        active ? "border-ink bg-ink text-white" : "border-line-strong bg-card text-ink"
      }`}
    >
      {children}
    </button>
  );
}
