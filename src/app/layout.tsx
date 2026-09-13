import type { Metadata } from "next";
import Link from "next/link";
import { ListChecks, Settings } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = { title: "Trace Eval", description: "Agent 轨迹评测工作台" };

const NAV = [
  { href: "/", label: "轨迹", icon: ListChecks },
  { href: "/settings", label: "设置", icon: Settings },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="flex min-h-screen">
          <aside className="sticky top-0 flex h-screen w-52 shrink-0 flex-col border-r border-border bg-surface px-3 py-5">
            <div className="px-3 pb-6 text-[15px] font-semibold tracking-tight">
              Trace Eval
            </div>
            <nav className="flex flex-col gap-0.5">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="nav-item">
                  <item.icon size={15} />
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="mt-auto px-3 text-[11px] text-fg-tertiary">本地评测 · v0.1</div>
          </aside>
          <main className="min-w-0 flex-1 px-8 py-7">{children}</main>
        </div>
      </body>
    </html>
  );
}
