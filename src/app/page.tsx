import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";
import { Split, Image as ImageIcon, Shield, Zap, Star, LayoutGrid } from "lucide-react";

export default function Home() {
  const tools = [
    {
      title: "Split PDF",
      description: "Separate PDF pages into individual files instantly.",
      icon: Split,
      href: "/split",
      color: "text-blue-600",
    },
    {
      title: "Extract Images",
      description: "Get high-quality images from your PDF documents.",
      icon: ImageIcon,
      href: "/extract",
      color: "text-purple-600",
    },
    {
      title: "PDF Imposition",
      description: "Arrange multiple PDF pages onto a single sheet (N-Up).",
      icon: LayoutGrid,
      href: "/imposition",
      color: "text-pink-600",
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 container mx-auto overflow-y-auto">
      <div className="text-center mb-16 space-y-6 max-w-2xl">
        <h1 className="text-6xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-600 dark:from-slate-100 dark:to-slate-400">
          Liquid PDF
        </h1>
        <p className="text-xl text-slate-600 dark:text-slate-300 leading-relaxed">
          Professional PDF tools in a beautiful, privacy-focused interface. 
          Process files directly in your browser.
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 w-full max-w-6xl">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link key={tool.title} href={tool.href} className="block group">
              <GlassCard className="h-full hover:scale-105 transition-transform duration-300">
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-2xl bg-white/50 dark:bg-white/10 ${tool.color} dark:text-blue-400`}>
                    <Icon size={32} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">{tool.title}</h3>
                    <p className="text-slate-600 dark:text-slate-300">{tool.description}</p>
                  </div>
                </div>
              </GlassCard>
            </Link>
          );
        })}
      </div>

      <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8 text-center max-w-5xl">
        <div className="space-y-2">
            <div className="flex justify-center text-blue-600 dark:text-blue-400 mb-2"><Shield size={24} /></div>
            <h3 className="font-bold text-slate-800 dark:text-white">100% Secure</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Files never leave your device. All processing happens in your browser.</p>
        </div>
        <div className="space-y-2">
            <div className="flex justify-center text-purple-600 dark:text-purple-400 mb-2"><Zap size={24} /></div>
            <h3 className="font-bold text-slate-800 dark:text-white">Blazing Fast</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Powered by WebAssembly for native-like performance.</p>
        </div>
        <div className="space-y-2">
            <div className="flex justify-center text-pink-600 dark:text-pink-400 mb-2">
                <Star size={24} />
            </div>
            <h3 className="font-bold text-slate-800 dark:text-white">Premium Ready</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Advanced features coming soon for professional users.</p>
        </div>
      </div>
    </div>
  );
}
