"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body className="flex min-h-screen items-center justify-center bg-[#09090b] px-6 text-zinc-100">
        <main className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">Global Error</p>
          <h1 className="mt-3 text-2xl font-semibold text-white">频道暂时掉线了</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            {error.message || "应用遇到了未预期错误。你可以重试一次，或者刷新页面重新接入频道。"}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="mt-6 rounded-full bg-white px-5 py-3 text-sm font-semibold text-zinc-950"
          >
            重新接入
          </button>
        </main>
      </body>
    </html>
  );
}
