"use client";

import { motion } from "framer-motion";

export default function LiquidBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-gray-50 dark:bg-gray-900">
      <motion.div
        animate={{
          x: [-100, 100, -100],
          y: [-100, 100, -100],
          scale: [1, 1.2, 1],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute -top-40 -left-40 w-96 h-96 bg-purple-300 dark:bg-purple-900 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-3xl opacity-70"
      />
      <motion.div
        animate={{
          x: [100, -100, 100],
          y: [100, -100, 100],
          scale: [1.2, 1, 1.2],
        }}
        transition={{
          duration: 25,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute top-0 right-0 w-96 h-96 bg-blue-300 dark:bg-blue-900 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-3xl opacity-70"
      />
      <motion.div
        animate={{
          x: [-50, 50, -50],
          y: [50, -50, 50],
          scale: [0.8, 1, 0.8],
        }}
        transition={{
          duration: 30,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute -bottom-40 left-20 w-96 h-96 bg-pink-300 dark:bg-pink-900 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-3xl opacity-70"
      />
    </div>
  );
}
