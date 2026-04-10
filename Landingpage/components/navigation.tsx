"use client";

import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Navigation() {
  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="fixed top-0 left-0 right-0 z-50 px-6 py-4"
    >
      <div className="mx-auto max-w-7xl">
        <div className="flex items-center justify-between rounded-2xl border border-border bg-card/60 px-6 py-3 backdrop-blur-xl">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
              <Zap className="h-5 w-5 text-primary" />
              <div className="absolute inset-0 rounded-xl bg-primary/20 blur-lg" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-tight text-foreground">
                FluxAgent
              </span>
              <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                ERC-8004 Compliant
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center gap-8">
            {["Protocol", "Evidence", "Metrics", "Audit"].map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase()}`}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {item}
              </a>
            ))}
          </div>

          {/* CTA */}
          <Button
            asChild
            variant="outline"
            className="border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 hover:border-primary/50"
          >
            <a
              href="https://sepolia.etherscan.io/address/0x6e0A7C2c158fa535083FDeFA1839273fAc36C9BE"
              target="_blank"
              rel="noreferrer"
            >
              View on Etherscan
            </a>
          </Button>
        </div>
      </div>
    </motion.nav>
  );
}
