"use client";

import { motion } from "framer-motion";
import { Shield, Github, Twitter, ExternalLink } from "lucide-react";

const githubRepoUrl = "https://github.com/HyperionBurn/DualAgent-ERC8004";

const protocolLinks = [
  { label: "ERC-8004 Spec", href: "https://eips.ethereum.org/EIPS/eip-8004", external: true },
  { label: "Documentation", href: "#evidence" },
  { label: "GitHub Repository", href: githubRepoUrl, external: true },
  { label: "Audit Reports", href: "#audit" },
];

const resourceLinks = [
  { label: "Hackathon Submission", href: "#audit" },
  { label: "Evidence Bundle", href: "#evidence" },
  { label: "Smart Contracts", href: "#protocol" },
  { label: "Risk Parameters", href: "#metrics" },
];

export function Footer() {
  return (
    <footer className="relative border-t border-border bg-card/30 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
                <Shield className="h-5 w-5 text-primary" />
                <div className="absolute inset-0 rounded-xl bg-primary/20 blur-lg" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold tracking-tight text-foreground">
                  FluxAgent
                </span>
                <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                  Verifiable Decision Engine
                </span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
              The first ERC-8004 compliant autonomous trading agent with signature-level 
              traceability and on-chain risk enforcement. Built for institutional trust.
            </p>
          </div>

          {/* Links */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4">Protocol</h3>
            <ul className="space-y-3">
              {protocolLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target={link.external ? "_blank" : undefined}
                    rel={link.external ? "noreferrer" : undefined}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                  >
                    {link.label}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4">Resources</h3>
            <ul className="space-y-3">
              {resourceLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                  >
                    {link.label}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-16 pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            Built for the Ethereum Foundation Hackathon. ERC-8004 Trustless Agents Standard.
          </p>
          <div className="flex items-center gap-4">
            <a
              href={githubRepoUrl}
              target="_blank"
              rel="noreferrer"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card/50 text-muted-foreground hover:text-foreground hover:border-muted-foreground/30 transition-colors"
            >
              <Github className="h-4 w-4" />
            </a>
            <a
              href="https://eips.ethereum.org/EIPS/eip-8004"
              target="_blank"
              rel="noreferrer"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card/50 text-muted-foreground hover:text-foreground hover:border-muted-foreground/30 transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
