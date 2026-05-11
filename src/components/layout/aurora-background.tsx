import { cn } from "@/lib/utils/cn";

export function AuroraBackground({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_15%_20%,rgba(6,182,212,0.14),transparent_35%),radial-gradient(circle_at_85%_15%,rgba(251,191,36,0.10),transparent_28%),radial-gradient(circle_at_50%_100%,rgba(59,130,246,0.12),transparent_30%),#09090b] text-zinc-100",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-[1400px] px-5 py-8 md:px-8">{children}</div>
    </div>
  );
}

