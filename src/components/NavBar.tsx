"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Home, Split, Image as ImageIcon, LayoutGrid, Merge, Stamp, Eraser, Bookmark } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

export default function NavBar() {
  const pathname = usePathname();

  const navItems = [
    { name: "Home", href: "/", icon: Home },
    { name: "Split", href: "/split", icon: Split },
    { name: "Merge", href: "/merge", icon: Merge },
    { name: "Extract", href: "/extract", icon: ImageIcon },
    { name: "Watermark", href: "/watermark", icon: Stamp },
    { name: "Remove", href: "/remove-watermark", icon: Eraser },
    { name: "Bookmarks", href: "/bookmarks", icon: Bookmark },
    { name: "Imposition", href: "/imposition", icon: LayoutGrid },
  ];

  return (
    <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
      <div className="glass-panel rounded-full px-6 py-3 flex items-center gap-6">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 text-sm font-medium transition-colors duration-200",
                isActive 
                  ? "text-blue-600 dark:text-blue-400" 
                  : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <Icon size={18} />
              <span className="hidden sm:inline">{item.name}</span>
            </Link>
          );
        })}
        <div className="w-px h-6 bg-slate-200 dark:bg-white/20 mx-2" />
        <ThemeToggle />
      </div>
    </nav>
  );
}
