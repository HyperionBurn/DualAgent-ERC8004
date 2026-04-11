"use client"

import { motion } from "framer-motion"
import { Zap, Github, ExternalLink, FileText, Code, Blocks } from "lucide-react"

const githubRepoUrl = "https://github.com/HyperionBurn/DualAgent-ERC8004"
const erc8004SpecUrl = "https://eips.ethereum.org/EIPS/eip-8004"
const architectureDocsUrl = "https://github.com/HyperionBurn/DualAgent-ERC8004/blob/main/ai-trading-agent-template/docs/ARCHITECTURE.md"
const walkthroughGuideUrl = "https://github.com/HyperionBurn/DualAgent-ERC8004/blob/main/ai-trading-agent-template/tutorial/01-erc8004-intro.md"

const contracts = [
  { name: "AgentRegistry", address: "0x97b0...0ca3" },
  { name: "HackathonVault", address: "0x0E7C...Fc90" },
  { name: "RiskRouter", address: "0xd6A6...FdBC" },
  { name: "ReputationRegistry", address: "0x423a...5763" },
  { name: "ValidationRegistry", address: "0x6e0A...C9BE" },
]

const protocolLinks = [
  { label: "ERC-8004 Spec", href: erc8004SpecUrl, external: true },
  { label: "Evidence Pipeline", href: "#evidence" },
  { label: "Metrics Dashboard", href: "#metrics" },
  { label: "Verification Audit", href: "#audit" },
]

const resourceLinks = [
  {
    label: "GitHub Repository",
    href: githubRepoUrl,
    external: true,
  },
  {
    label: "Architecture Docs",
    href: architectureDocsUrl,
    external: true,
  },
  {
    label: "Walkthrough Guide",
    href: walkthroughGuideUrl,
    external: true,
  },
  {
    label: "Etherscan Wallet",
    href: "https://sepolia.etherscan.io/address/0x982E92b3ef679e00EF933148E27Cca62BBe7C1eF",
    external: true,
  },
]

const techStack = [
  { name: "Ethereum", icon: "⟠" },
  { name: "Next.js", icon: "▲" },
  { name: "Hardhat", icon: "⛑️" },
  { name: "TypeScript", icon: "TS" },
]

export function Footer() {
  return (
    <footer className="relative border-t border-border bg-card/50">
      {/* Animated chain link visualization */}
      <div className="absolute top-0 left-0 right-0 h-px overflow-hidden">
        <motion.div
          className="h-full w-32 bg-gradient-to-r from-transparent via-primary to-transparent"
          animate={{ x: ["-100%", "400%"] }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        />
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Brand Column */}
          <div className="lg:col-span-1">
            <a href="#" className="flex items-center gap-2 mb-4 group">
              <div className="relative">
                <Zap className="h-6 w-6 text-primary transition-all group-hover:drop-shadow-[0_0_8px_rgba(0,212,255,0.8)]" />
              </div>
              <span className="font-semibold text-lg tracking-tight text-foreground">
                FluxAgent
              </span>
            </a>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              The first ERC-8004 compliant autonomous trading agent with 
              signature-level traceability and on-chain risk enforcement.
            </p>
            {/* Tech Stack */}
            <div className="flex flex-wrap gap-2">
              {techStack.map((tech) => (
                <div
                  key={tech.name}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 border border-border text-xs"
                >
                  <span>{tech.icon}</span>
                  <span className="text-muted-foreground">{tech.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Protocol Links */}
          <div>
            <h4 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Blocks className="h-4 w-4 text-primary" />
              Protocol
            </h4>
            <ul className="space-y-3">
              {protocolLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target={link.external ? "_blank" : undefined}
                    rel={link.external ? "noopener noreferrer" : undefined}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    {link.label}
                    {link.external && <ExternalLink className="h-3 w-3" />}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Resources
            </h4>
            <ul className="space-y-3">
              {resourceLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target={link.external ? "_blank" : undefined}
                    rel={link.external ? "noopener noreferrer" : undefined}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
                  >
                    {link.label}
                    {link.external && <ExternalLink className="h-3 w-3" />}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contracts */}
          <div>
            <h4 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Code className="h-4 w-4 text-primary" />
              Contracts (Sepolia)
            </h4>
            <ul className="space-y-2">
              {contracts.map((contract) => (
                <li
                  key={contract.name}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-muted-foreground">{contract.name}</span>
                  <code className="font-mono text-foreground/70">{contract.address}</code>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-border">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Copyright */}
            <p className="text-sm text-muted-foreground">
              © 2026 FluxAgent. Built for Ethereum Foundation Hackathon.
            </p>

            {/* Hackathon Badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
              </span>
              <span className="text-xs font-medium text-primary">
                ETH Foundation Hackathon 2026
              </span>
            </div>

            {/* Links */}
            <div className="flex items-center gap-4">
              <a
                href={githubRepoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                <Github className="h-5 w-5" />
                <span className="sr-only">GitHub</span>
              </a>
              <a
                href="https://sepolia.etherscan.io/address/0x982E92b3ef679e00EF933148E27Cca62BBe7C1eF"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                <ExternalLink className="h-5 w-5" />
                <span className="sr-only">Etherscan</span>
              </a>
            </div>
          </div>

          {/* Tagline */}
          <div className="mt-8 text-center">
            <p className="text-lg font-semibold text-gradient-cyan">
              Identity is the New Alpha.
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
