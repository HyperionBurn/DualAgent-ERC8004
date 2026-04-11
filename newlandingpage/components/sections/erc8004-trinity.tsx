"use client"

import { useState, useRef } from "react"
import { motion, useInView, AnimatePresence } from "framer-motion"
import { Fingerprint, Trophy, CheckCircle, ExternalLink, Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const registries = [
  {
    id: "identity",
    icon: Fingerprint,
    title: "AgentRegistry",
    subtitle: "Identity Layer",
    description:
      "Every agent receives an ERC-721 NFT passport that binds its cryptographic identity to on-chain state. The operator, model hash, and deployment timestamp are immutably recorded.",
    address: "0x97b07dDc405B0c28B17559aFFE63BdB3632d0ca3",
    etherscanUrl: "https://sepolia.etherscan.io/address/0x97b07dDc405B0c28B17559aFFE63BdB3632d0ca3",
    features: [
      "ERC-721 NFT identity token",
      "Cryptographic model binding",
      "Operator accountability",
      "Deployment attestation",
    ],
    code: `struct AgentPassport {
  address operator;
  bytes32 modelHash;
  uint256 deployedAt;
  bool isActive;
}

function registerAgent(
  bytes32 _modelHash
) external returns (uint256 agentId) {
  agentId = _nextAgentId++;
  passports[agentId] = AgentPassport({
    operator: msg.sender,
    modelHash: _modelHash,
    deployedAt: block.timestamp,
    isActive: true
  });
  _mint(msg.sender, agentId);
}`,
    color: "primary",
  },
  {
    id: "reputation",
    icon: Trophy,
    title: "ReputationRegistry",
    subtitle: "Performance Layer",
    description:
      "Tracks objective performance metrics across the agent's lifetime. Success rates, cumulative PnL, and trade counts form a portable reputation that travels across protocols.",
    address: "0x423a9904e39537a9997fbaF0f220d79D7d545763",
    etherscanUrl: "https://sepolia.etherscan.io/address/0x423a9904e39537a9997fbaF0f220d79D7d545763",
    features: [
      "Objective performance tracking",
      "Cross-protocol portability",
      "Immutable trade history",
      "Reputation score computation",
    ],
    code: `mapping(uint256 => ReputationScore) scores;

struct ReputationScore {
  uint256 successRate;
  uint256 totalTrades;
  int256 cumulativePnL;
  uint256 lastUpdate;
}

function updateReputation(
  uint256 agentId,
  bool success,
  int256 pnl
) external onlyAuthorized {
  ReputationScore storage score = scores[agentId];
  score.totalTrades++;
  score.cumulativePnL += pnl;
  score.lastUpdate = block.timestamp;
}`,
    color: "success",
  },
  {
    id: "validation",
    icon: CheckCircle,
    title: "ValidationRegistry",
    subtitle: "Verification Layer",
    description:
      "EIP-712 typed data signatures bind every trading decision to its cryptographic proof. The reasoning hash, token, amount, and deadline form an unforgeable intent record.",
    address: "0x6e0A7C2c158fa535083FDeFA1839273fAc36C9BE",
    etherscanUrl: "https://sepolia.etherscan.io/address/0x6e0A7C2c158fa535083FDeFA1839273fAc36C9BE",
    features: [
      "EIP-712 typed signatures",
      "Reasoning hash attestation",
      "Intent verification",
      "Nonce-based replay protection",
    ],
    code: `bytes32 constant TRADE_TYPEHASH = keccak256(
  "TradeIntent(bytes32 reasoningHash,"
  "address token,uint256 amount,"
  "uint256 deadline,uint256 nonce)"
);

function validateIntent(
  TradeIntent calldata intent,
  bytes calldata signature
) external returns (bool) {
  bytes32 digest = _hashTypedDataV4(
    keccak256(abi.encode(
      TRADE_TYPEHASH,
      intent.reasoningHash,
      intent.token,
      intent.amount,
      intent.deadline,
      intent.nonce
    ))
  );
  return _verify(digest, signature);
}`,
    color: "chart-3",
  },
]

const colorMap: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  primary: {
    bg: "bg-primary/10",
    border: "border-primary/30",
    text: "text-primary",
    glow: "shadow-primary/20",
  },
  success: {
    bg: "bg-success/10",
    border: "border-success/30",
    text: "text-success",
    glow: "shadow-success/20",
  },
  "chart-3": {
    bg: "bg-chart-3/10",
    border: "border-chart-3/30",
    text: "text-chart-3",
    glow: "shadow-chart-3/20",
  },
}

function TerminalCodeBlock({ code, color }: { code: string; color: string }) {
  const [copied, setCopied] = useState(false)
  const colors = colorMap[color]

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative rounded-xl overflow-hidden bg-[#0a0a0a] border border-border">
      {/* Terminal header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#0f0f0f] border-b border-border">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-destructive/60" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
            <div className="w-3 h-3 rounded-full bg-success/60" />
          </div>
          <span className="text-xs text-muted-foreground font-mono ml-2">contract.sol</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-7 px-2 text-muted-foreground hover:text-foreground"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-success" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {/* Code content */}
      <div className="relative p-4 overflow-x-auto">
        {/* Scan line effect */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div
            className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent"
            style={{
              animation: "scan-line 4s linear infinite",
            }}
          />
        </div>

        <pre className="text-sm font-mono leading-relaxed">
          <code>
            {code.split("\n").map((line, i) => (
              <div key={i} className="flex">
                <span className="select-none w-8 text-right pr-4 text-muted-foreground/40">
                  {i + 1}
                </span>
                <span className={colors.text}>{line}</span>
              </div>
            ))}
          </code>
        </pre>
      </div>
    </div>
  )
}

function ArchitectureDiagram({ activeRegistry }: { activeRegistry: string }) {
  const getColor = (id: string) => {
    if (id === activeRegistry) {
      return colorMap[registries.find((r) => r.id === id)?.color || "primary"]
    }
    return { bg: "bg-muted/50", border: "border-border", text: "text-muted-foreground", glow: "" }
  }

  return (
    <div className="relative h-48 flex items-center justify-center">
      {/* Center Agent Node */}
      <motion.div
        className="absolute w-16 h-16 rounded-full bg-card border-2 border-primary flex items-center justify-center z-10"
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <span className="text-xs font-mono text-primary font-bold">Agent 5</span>
      </motion.div>

      {/* Registry Nodes */}
      {registries.map((registry, index) => {
        const angle = (index * 120 - 90) * (Math.PI / 180)
        const radius = 70
        const x = Math.cos(angle) * radius
        const y = Math.sin(angle) * radius
        const colors = getColor(registry.id)
        const isActive = registry.id === activeRegistry

        return (
          <motion.div
            key={registry.id}
            className={cn(
              "absolute w-12 h-12 rounded-lg flex items-center justify-center transition-all duration-300",
              colors.bg,
              colors.border,
              "border",
              isActive && `shadow-lg ${colors.glow}`
            )}
            style={{ transform: `translate(${x}px, ${y}px)` }}
            animate={isActive ? { scale: [1, 1.1, 1] } : {}}
            transition={{ duration: 1, repeat: Infinity }}
          >
            <registry.icon className={cn("h-5 w-5", colors.text)} />
          </motion.div>
        )
      })}

      {/* Connection Lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {registries.map((registry, index) => {
          const angle = (index * 120 - 90) * (Math.PI / 180)
          const radius = 70
          const x = Math.cos(angle) * radius + 96
          const y = Math.sin(angle) * radius + 96
          const isActive = registry.id === activeRegistry

          return (
            <motion.line
              key={registry.id}
              x1="96"
              y1="96"
              x2={x}
              y2={y}
              stroke={isActive ? "rgba(0, 212, 255, 0.6)" : "rgba(255, 255, 255, 0.1)"}
              strokeWidth={isActive ? 2 : 1}
              strokeDasharray={isActive ? "none" : "4 4"}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5 }}
            />
          )
        })}
      </svg>

      {/* Animated data flow particle */}
      {registries.map((registry) => {
        if (registry.id !== activeRegistry) return null
        const angle = (registries.findIndex((r) => r.id === registry.id) * 120 - 90) * (Math.PI / 180)

        return (
          <motion.div
            key={`particle-${registry.id}`}
            className="absolute w-2 h-2 rounded-full bg-primary"
            animate={{
              x: [0, Math.cos(angle) * 70],
              y: [0, Math.sin(angle) * 70],
              opacity: [1, 0],
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              ease: "easeOut",
            }}
            style={{ left: "calc(50% - 4px)", top: "calc(50% - 4px)" }}
          />
        )
      })}
    </div>
  )
}

export function ERC8004Trinity() {
  const [activeRegistry, setActiveRegistry] = useState("identity")
  const containerRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(containerRef, { once: true, margin: "-100px" })

  const activeData = registries.find((r) => r.id === activeRegistry)!
  const colors = colorMap[activeData.color]

  return (
    <section className="relative py-24 sm:py-32 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/30 to-background" />
      <div className="absolute inset-0 grid-pattern opacity-20" />

      <div ref={containerRef} className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
            The ERC-8004 Trinity
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto text-pretty">
            Three on-chain registries working in concert to create the most transparent 
            autonomous agent standard ever deployed.
          </p>
        </motion.div>

        {/* Registry Selector Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="flex flex-wrap justify-center gap-3 mb-12"
        >
          {registries.map((registry) => {
            const regColors = colorMap[registry.color]
            const isActive = registry.id === activeRegistry

            return (
              <button
                key={registry.id}
                onClick={() => setActiveRegistry(registry.id)}
                className={cn(
                  "flex items-center gap-2 px-5 py-3 rounded-xl font-medium transition-all duration-300",
                  isActive
                    ? `${regColors.bg} ${regColors.border} border ${regColors.text} shadow-lg ${regColors.glow}`
                    : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground"
                )}
              >
                <registry.icon className="h-4 w-4" />
                <span>{registry.title}</span>
              </button>
            )
          })}
        </motion.div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Description + Architecture */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="space-y-6"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={activeRegistry}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className={cn(
                  "p-6 rounded-2xl border",
                  colors.bg,
                  colors.border,
                  "glass-border"
                )}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className={cn("p-2 rounded-lg", colors.bg)}>
                    <activeData.icon className={cn("h-6 w-6", colors.text)} />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-foreground">
                      {activeData.title}
                    </h3>
                    <span className={cn("text-sm", colors.text)}>{activeData.subtitle}</span>
                  </div>
                </div>

                <p className="text-muted-foreground leading-relaxed mb-6">
                  {activeData.description}
                </p>

                {/* Contract Address */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border mb-6">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                    <span className="text-xs text-muted-foreground">Verified on Sepolia</span>
                  </div>
                  <code className="text-xs font-mono text-foreground break-all">
                    {activeData.address}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 ml-auto shrink-0"
                    asChild
                  >
                    <a
                      href={activeData.etherscanUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                </div>

                {/* Features List */}
                <ul className="space-y-2">
                  {activeData.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm">
                      <CheckCircle className={cn("h-4 w-4", colors.text)} />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            </AnimatePresence>

            {/* Architecture Diagram */}
            <div className="p-6 rounded-2xl bg-card border border-border">
              <h4 className="text-sm font-medium text-muted-foreground mb-4 text-center">
                Registry Architecture
              </h4>
              <ArchitectureDiagram activeRegistry={activeRegistry} />
            </div>
          </motion.div>

          {/* Right: Code Preview */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={activeRegistry}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                <TerminalCodeBlock code={activeData.code} color={activeData.color} />
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
