import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TopNav } from "@/components/layout/top-nav";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("TopNav", () => {
  it("renders clickable Home, Lab, and Music links", () => {
    const html = renderToStaticMarkup(<TopNav />);

    expect(html).toContain('href="/"');
    expect(html).toContain('href="/lab"');
    expect(html).toContain('href="/music"');
    expect(html).toContain(">Home<");
    expect(html).toContain(">Lab<");
    expect(html).toContain(">Music<");
  });
});
