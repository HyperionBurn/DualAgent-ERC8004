"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { Fingerprint, Users, FileCheck, ChevronRight, ExternalLink } from "lucide-react";

const registries = [
  {
    id: "identity",
    icon: Fingerprint,
    title: "Identity Registry",
    subtitle: "The Immutable Passport",
    description:
      "Every FluxAgent instance mints an ERC-721 Agent Passport upon deployment. This non-transferable token binds the operator address, model hash, and deployment timestamp into a single, verifiable identity.",
    features: [
      "ERC-721 compliant NFT passport",
      "Operator address binding",
      "Immutable model hash commitment",
      "On-chain deployment attestation",
    ],
    code: `struct AgentPassport {
  address operator;
  bytes32 modelHash;
  uint256 deployedAt;
  bool isActive;
}`,
    color: "primary",
  },
  {
    id: "reputation",
    icon: Users,
    title: "Reputation Registry",
    subtitle: "Portable Trust Graph",
    description:
      "A cross-agent peer review system that accumulates verifiable reputation scores. FluxAgent carries its track record across protocols, enabling risk-adjusted capital allocation based on historical performance.",
    features: [
      "Cross-protocol reputation portability",
      "Peer-reviewed trust scores",
      "Historical performance metrics",
      "Risk-adjusted credentialing",
    ],
    code: `mapping(uint256 => ReputationScore) scores;

struct ReputationScore {
  uint256 successRate;
  uint256 totalTrades;
  int256 cumulativePnL;
  uint256 lastUpdate;
}`,
    color: "chart-2",
  },
  {
    id: "validation",
    icon: FileCheck,
    title: "Validation Registry",
    subtitle: "Cryptographic Proof of Logic",
    description:
      "Every trade decision generates an EIP-712 signed checkpoint linking the LLM reasoning to on-chain execution. The validation registry stores these cryptographic commitments for complete auditability.",
    features: [
      "EIP-712 typed data signatures",
      "LLM reasoning hash commitment",
      "Execution checkpoint verification",
      "Complete decision audit trail",
    ],
    code: `bytes32 constant TRADE_TYPEHASH = keccak256(
  "TradeIntent(bytes32 reasoningHash,"
  "address token,uint256 amount,"
  "uint256 deadline,uint256 nonce)"
);`,
    color: "chart-3",
  },
];

export function ERC8004Trinity() {
  const [activeRegistry, setActiveRegistry] = useState("identity");

  const activeData = registries.find((r) => r.id === activeRegistry)!;

  return (
    <section id="protocol" className="relative py-32 px-6">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 right-0 w-[600px] h-[600px] rounded-full bg-primary/3 blur-[150px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block text-xs font-semibold tracking-wider text-primary uppercase mb-4">
            The ERC-8004 Trinity
          </span>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-foreground mb-4 text-balance">
            Three Registries. One Verifiable Agent.
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto text-pretty">
            The ERC-8004 standard establishes a trinity of on-chain registries that together 
            solve the agent trust gap with cryptographic guarantees.
          </p>
        </motion.div>

        {/* Registry Tabs */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
          {registries.map((registry, index) => (
            <motion.button
              key={registry.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              onClick={() => setActiveRegistry(registry.id)}
              className={`group relative flex items-center gap-4 rounded-2xl border p-5 text-left transition-all ${
                activeRegistry === registry.id
                  ? "border-primary/40 bg-primary/5"
                  : "border-border bg-card/30 hover:border-border hover:bg-card/50"
              }`}
            >
              <div
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                  activeRegistry === registry.id
                    ? "bg-primary/20 border-primary/30"
                    : "bg-muted border-border group-hover:bg-muted/80"
                }`}
              >
                <registry.icon
                  className={`h-6 w-6 transition-colors ${
                    activeRegistry === registry.id
                      ? "text-primary"
                      : "text-muted-foreground group-hover:text-foreground"
                  }`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground truncate">{registry.title}</h3>
                <p className="text-sm text-muted-foreground truncate">{registry.subtitle}</p>
              </div>
              <ChevronRight
                className={`h-5 w-5 shrink-0 transition-all ${
                  activeRegistry === registry.id
                    ? "text-primary rotate-90"
                    : "text-muted-foreground group-hover:text-foreground"
                }`}
              />
            </motion.button>
          ))}
        </div>

        {/* Active Registry Details */}
        <motion.div
          key={activeRegistry}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-8"
        >
          {/* Description Card */}
          <div className="rounded-3xl border border-border bg-card/30 backdrop-blur-sm p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
                <activeData.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-foreground">{activeData.title}</h3>
                <p className="text-sm text-muted-foreground">{activeData.subtitle}</p>
              </div>
            </div>

            <p className="text-muted-foreground leading-relaxed mb-8">
              {activeData.description}
            </p>

            <div className="space-y-3">
              {activeData.features.map((feature, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  </div>
                  <span className="text-sm text-foreground">{feature}</span>
                </div>
              ))}
            </div>

            <a
              href="https://eips.ethereum.org/EIPS/eip-8004"
              target="_blank"
              rel="noreferrer"
              className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              View ERC-8004 Specification
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>

          {/* Code Preview Card */}
          <div className="rounded-3xl border border-border bg-card/30 backdrop-blur-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-destructive/60" />
                <div className="h-3 w-3 rounded-full bg-chart-4/60" />
                <div className="h-3 w-3 rounded-full bg-[#00ff88]/60" />
              </div>
              <span className="text-xs font-medium text-muted-foreground font-mono">
                {activeData.id}Registry.sol
              </span>
            </div>
            <div className="p-6">
              <pre className="text-sm font-mono text-muted-foreground leading-relaxed overflow-x-auto">
                <code>{activeData.code}</code>
              </pre>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
