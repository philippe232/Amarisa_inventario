import Link from "next/link";

// Ported from reference/cereza/app/components/row.tsx — same box/line
// container convention, minus the testId prop (no screenshot harness in
// this project yet).
export const ROW_BOX_CLASSES =
  "flex items-start justify-between gap-3 rounded-[11px] border border-line bg-card px-3 py-2.5";
export const ROW_LINE_CLASSES = "flex items-start gap-2.5 border-b border-line py-2.5";

export default function Row({
  variant,
  href,
  onClick,
  className = "",
  children,
}: {
  variant: "box" | "line";
  href?: string;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const base = variant === "box" ? ROW_BOX_CLASSES : ROW_LINE_CLASSES;
  const classes = `${base} ${className}`.trim();

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`w-full text-left ${classes}`}>
        {children}
      </button>
    );
  }

  return <div className={classes}>{children}</div>;
}
