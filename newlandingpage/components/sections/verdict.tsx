"use client"

import { useRef, useEffect, useState } from "react"
import { motion, useInView, AnimatePresence } from "framer-motion"
import {
  CheckCircle,
  Copy,
  Check,
  Download,
  ExternalLink,
  Github,
  Shield,
  PartyPopper,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// All 12 verification gates
const verificationGates = [
  {
    id: 1,
    name: "strictSepoliaProofIntegrity",
    description: "Shared Sepolia contracts snapshotted with live bytecode checks",
  },
  {
    id: 2,
    name: "capitalClaimProof",
    description: "Capital claim proof includes Sepolia tx hash",
  },
  {
    id: 3,
    name: "registrationProofCompleteness",
    description: "Registration proof includes matching Sepolia identity",
  },
  {
    id: 4,
    name: "artifactIdentityIntegrity",
    description: "All runtime artifacts belong to configured agent",
  },
  {
    id: 5,
    name: "submissionAssetManifesting",
    description: "Submission manifest includes all required links/evidence",
  },
  {
    id: 6,
    name: "validationEvidenceCoverage",
    description: "Checkpoints backed by validation evidence >= 70% coverage",
  },
  {
    id: 7,
    name: "compositeScoreOutput",
    description: "metrics.json contains coherent score story",
  },
  {
    id: 8,
    name: "reputationEvidence",
    description: "Objective reputation present >= 90 score, >= 6 feedback, >= 3 raters",
  },
  {
    id: 9,
    name: "evidenceDepth",
    description: "Checkpoint/fill depth within target ranges (30-60 / 5-15)",
  },
  {
    id: 10,
    name: "runQuality",
    description: "Run quality satisfied (PnL > 0.01, drawdown <= 500bps)",
  },
  {
    id: 11,
    name: "routerEnforcement",
    description: "Shared router enforcement proof with nonce/trade records",
  },
  {
    id: 12,
    name: "drawdownEvidence",
    description: "Local equity and drawdown evidence present and fresh",
  },
]

// Contract addresses with Etherscan links
const contracts = [
  {
    name: "AgentRegistry",
    address: "0x97b07dDc405B0c28B17559aFFE63BdB3632d0ca3",
    url: "https://sepolia.etherscan.io/address/0x97b07dDc405B0c28B17559aFFE63BdB3632d0ca3",
  },
  {
    name: "HackathonVault",
    address: "0x0E7CD8ef9743FEcf94f9103033a044caBD45fC90",
    url: "https://sepolia.etherscan.io/address/0x0E7CD8ef9743FEcf94f9103033a044caBD45fC90",
  },
  {
    name: "RiskRouter",
    address: "0xd6A6952545FF6E6E6681c2d15C59f9EB8F40FdBC",
    url: "https://sepolia.etherscan.io/address/0xd6A6952545FF6E6E6681c2d15C59f9EB8F40FdBC",
  },
  {
    name: "ReputationRegistry",
    address: "0x423a9904e39537a9997fbaF0f220d79D7d545763",
    url: "https://sepolia.etherscan.io/address/0x423a9904e39537a9997fbaF0f220d79D7d545763",
  },
  {
    name: "ValidationRegistry",
    address: "0x6e0A7C2c158fa535083FDeFA1839273fAc36C9BE",
    url: "https://sepolia.etherscan.io/address/0x6e0A7C2c158fa535083FDeFA1839273fAc36C9BE",
  },
]

// Submission manifest JSON
const submissionManifest = {
  links: {
    githubRepository: "https://github.com/HyperionBurn/DualAgent-ERC8004",
    demoUrl: "https://github.com/HyperionBurn/DualAgent-ERC8004/blob/main/index.html",
    videoUrl: "https://github.com/HyperionBurn/DualAgent-ERC8004/blob/main/ai-trading-agent-template/tutorial/01-erc8004-intro.md",
    slidesUrl: "https://github.com/HyperionBurn/DualAgent-ERC8004/blob/main/ai-trading-agent-template/docs/ARCHITECTURE.md",
  },
  evidence: {
    sharedContracts: "shared-contracts.json",
    capitalProof: "capital-proof.json",
    registrationProof: "registration-proof.json",
    metrics: "metrics.json",
    equityReport: "equity-report.json",
    reputationFeedback: "reputation-feedback.jsonl",
    phase2Evidence: "phase2-evidence.json",
  },
  readiness: {
    hasAllRequiredLinks: true,
    hasAllRequiredEvidence: true,
    missingFields: [],
    strictMode: true,
  },
}

// Confetti particle component
function ConfettiParticle({ delay, x }: { delay: number; x: number }) {
  const colors = ["#00d4ff", "#00ff88", "#6366f1", "#8b5cf6", "#ec4899"]
  const color = colors[Math.floor(Math.random() * colors.length)]

  return (
    <motion.div
      className="absolute w-2 h-2 rounded-full"
      style={{ backgroundColor: color, left: `${x}%` }}
      initial={{ y: -20, opacity: 1, scale: 1 }}
      animate={{
        y: 400,
        opacity: [1, 1, 0],
        scale: [1, 0.8, 0.5],
        rotate: Math.random() * 720 - 360,
      }}
      transition={{
        duration: 2 + Math.random(),
        delay: delay,
        ease: "easeOut",
      }}
    />
  )
}

function Confetti({ active }: { active: boolean }) {
  if (!active) return null

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: 50 }).map((_, i) => (
        <ConfettiParticle key={i} delay={i * 0.02} x={Math.random() * 100} />
      ))}
    </div>
  )
}

// Gate verification item
function GateItem({
  gate,
  index,
  isRevealed,
}: {
  gate: (typeof verificationGates)[0]
  index: number
  isRevealed: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={isRevealed ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.3, delay: index * 0.08 }}
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg transition-colors",
        isRevealed ? "bg-success/5" : "bg-muted/30"
      )}
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={isRevealed ? { scale: 1 } : {}}
        transition={{ duration: 0.2, delay: index * 0.08 + 0.2, type: "spring" }}
      >
        <CheckCircle className="h-5 w-5 text-success shrink-0 mt-0.5" />
      </motion.div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground">Gate {gate.id}</span>
          <span className="text-xs font-mono text-success">PASS</span>
        </div>
        <p className="text-sm font-medium text-foreground truncate">{gate.name}</p>
        <p className="text-xs text-muted-foreground">{gate.description}</p>
      </div>
    </motion.div>
  )
}

// JSON code block component
function JsonCodeBlock({ data, filename }: { data: object; filename: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-xl overflow-hidden bg-[#0a0a0a] border border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#0f0f0f] border-b border-border">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-destructive/60" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
            <div className="w-3 h-3 rounded-full bg-success/60" />
          </div>
          <span className="text-xs text-muted-foreground font-mono ml-2">{filename}</span>
        </div>
        <div className="flex items-center gap-2">
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
      </div>

      {/* Code content */}
      <div className="p-4 overflow-x-auto max-h-80">
        <pre className="text-xs font-mono text-primary leading-relaxed">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  )
}

export function Verdict() {
  const containerRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(containerRef, { once: true, margin: "-100px" })
  const [revealedGates, setRevealedGates] = useState(0)
  const [showConfetti, setShowConfetti] = useState(false)

  // Reveal gates one by one
  useEffect(() => {
    if (!isInView) return

    const interval = setInterval(() => {
      setRevealedGates((prev) => {
        if (prev >= verificationGates.length) {
          clearInterval(interval)
          setShowConfetti(true)
          return prev
        }
        return prev + 1
      })
    }, 100)

    return () => clearInterval(interval)
  }, [isInView])

  const allGatesPassed = revealedGates >= verificationGates.length

  return (
    <section id="audit" className="relative py-24 sm:py-32 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/30 to-background" />
      <div className="absolute inset-0 grid-pattern opacity-20" />

      <div ref={containerRef} className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Confetti */}
        <Confetti active={showConfetti} />

        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
            The Verdict
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto text-pretty">
            Twelve verification gates. Zero failures. Complete evidence integrity 
            for hackathon submission.
          </p>
        </motion.div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Verification Gates */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="p-6 rounded-2xl bg-card border border-border"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Phase-2 Verification Gates</h3>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono tabular-nums text-success">
                  {Math.min(revealedGates, 12)}/12
                </span>
                <span className="text-sm text-muted-foreground">passed</span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-2 bg-muted rounded-full mb-6 overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-primary to-success rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${(revealedGates / 12) * 100}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>

            {/* Gates list */}
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
              {verificationGates.map((gate, index) => (
                <GateItem
                  key={gate.id}
                  gate={gate}
                  index={index}
                  isRevealed={index < revealedGates}
                />
              ))}
            </div>

            {/* Result banner */}
            <AnimatePresence>
              {allGatesPassed && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5, type: "spring" }}
                  className="mt-6 p-4 rounded-xl bg-gradient-to-r from-success/20 via-primary/20 to-success/20 border border-success/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-success/20">
                      <PartyPopper className="h-6 w-6 text-success" />
                    </div>
                    <div>
                      <p className="font-semibold text-success">12/12 PASSED</p>
                      <p className="text-sm text-muted-foreground">
                        All verification gates passed. Zero fail reasons.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Right: Submission Manifest */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="space-y-6"
          >
            <JsonCodeBlock data={submissionManifest} filename="submission-manifest.json" />

            {/* Contract Addresses */}
            <div className="p-4 rounded-xl bg-card border border-border">
              <h4 className="text-sm font-medium text-foreground mb-3">Verified Contracts (Sepolia)</h4>
              <div className="space-y-2">
                {contracts.map((contract) => (
                  <div
                    key={contract.name}
                    className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors group"
                  >
                    <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                    <span className="text-xs font-medium text-muted-foreground w-32 shrink-0">
                      {contract.name}
                    </span>
                    <code className="text-xs font-mono text-foreground truncate flex-1">
                      {contract.address}
                    </code>
                    <a
                      href={contract.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        {/* Final CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView && allGatesPassed ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 1.5 }}
          className="mt-16 p-8 rounded-2xl bg-gradient-to-r from-primary/10 via-card to-success/10 border border-primary/20 text-center"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <Shield className="h-8 w-8 text-success" />
            <h3 className="text-2xl font-bold text-foreground">READY FOR SUBMISSION</h3>
          </div>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            All 12 verification gates passed. Every decision cryptographically signed. 
            Every trade verifiable on-chain. Identity is the new alpha.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90 glow-cyan gap-2"
              asChild
            >
              <a
                href="https://github.com/HyperionBurn/DualAgent-ERC8004"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="h-4 w-4" />
                <span>View on GitHub</span>
              </a>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-border hover:bg-muted gap-2"
              asChild
            >
              <a
                href="https://sepolia.etherscan.io/address/0x982E92b3ef679e00EF933148E27Cca62BBe7C1eF"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4" />
                <span>Verify on Etherscan</span>
              </a>
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
