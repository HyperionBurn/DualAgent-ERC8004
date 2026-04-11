"use client"

import { useRef, useEffect, useState } from "react"
import { motion, useInView, AnimatePresence } from "framer-motion"
import { Brain, FileSignature, Shield, Link, CheckCircle, XCircle, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

const pipelineSteps = [
  {
    number: "01",
    icon: Brain,
    title: "LLM Reasoning",
    status: "Active",
    description:
      "Dual-LLM consensus generates a structured trading decision with confidence scores, market analysis, and risk assessment. The reasoning is hashed for attestation.",
    artifact: {
      file: "checkpoints.jsonl",
      preview: '{ "action": "HOLD", "confidence": 0.95, "reasoning_hash": "0x7a3f..." }',
    },
    color: "primary",
    particles: "generate",
  },
  {
    number: "02",
    icon: FileSignature,
    title: "EIP-712 Signing",
    status: "Verified",
    description:
      "Every trading intent is cryptographically signed using EIP-712 typed data. The signature binds the agent's identity to its decision, creating unforgeable proof.",
    artifact: {
      file: "signatures.jsonl",
      preview: '{ "signer": "0x97b0...", "signature": "0x4d2e...", "nonce": 47 }',
    },
    color: "success",
    particles: "transform",
  },
  {
    number: "03",
    icon: Shield,
    title: "RiskRouter Validation",
    status: "Enforced",
    description:
      "Smart contract guardrails evaluate position limits, drawdown thresholds, and trade frequency. Non-compliant decisions are rejected at the protocol level.",
    artifact: {
      file: "validations.jsonl",
      preview: '{ "check": "drawdown", "limit": 5000, "current": 2, "status": "PASS" }',
    },
    color: "chart-3",
    particles: "filter",
  },
  {
    number: "04",
    icon: Link,
    title: "On-Chain Attestation",
    status: "Permanent",
    description:
      "Surviving decisions are recorded on Ethereum Sepolia. The transaction hash, block number, and timestamp form an immutable audit trail.",
    artifact: {
      file: "fills.jsonl",
      preview: '{ "pair": "XBTUSD", "amount": 25.00, "tx": "0x8b4c...", "block": 7234891 }',
    },
    color: "chart-4",
    particles: "store",
  },
]

const colorMap: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  primary: {
    bg: "bg-primary/10",
    border: "border-primary/30",
    text: "text-primary",
    dot: "bg-primary",
  },
  success: {
    bg: "bg-success/10",
    border: "border-success/30",
    text: "text-success",
    dot: "bg-success",
  },
  "chart-3": {
    bg: "bg-chart-3/10",
    border: "border-chart-3/30",
    text: "text-chart-3",
    dot: "bg-chart-3",
  },
  "chart-4": {
    bg: "bg-chart-4/10",
    border: "border-chart-4/30",
    text: "text-chart-4",
    dot: "bg-chart-4",
  },
}

// Animated particle that flows through the pipeline
function DataParticle({ isActive, stepIndex }: { isActive: boolean; stepIndex: number }) {
  if (!isActive) return null

  return (
    <motion.div
      className="absolute left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-primary z-20"
      initial={{ top: 0, opacity: 0, scale: 0 }}
      animate={{
        top: ["0%", "100%"],
        opacity: [0, 1, 1, 0],
        scale: [0.5, 1, 1, 0.5],
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        repeatDelay: 1,
        ease: "easeInOut",
      }}
      style={{
        boxShadow: "0 0 10px rgba(0, 212, 255, 0.8), 0 0 20px rgba(0, 212, 255, 0.4)",
      }}
    />
  )
}

// Pipeline counters component
function PipelineCounters() {
  const [counts, setCounts] = useState({ checkpoints: 0, fills: 0, rejections: 0 })
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true })

  useEffect(() => {
    if (!isInView) return

    const duration = 2000
    const startTime = Date.now()

    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 4)

      setCounts({
        checkpoints: Math.floor(eased * 60),
        fills: Math.floor(eased * 15),
        rejections: 0,
      })

      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }

    requestAnimationFrame(animate)
  }, [isInView])

  return (
    <div
      ref={ref}
      className="flex flex-wrap items-center justify-center gap-4 p-4 rounded-xl bg-muted/50 border border-border"
    >
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold font-mono tabular-nums text-primary">
          {counts.checkpoints}/60
        </span>
        <span className="text-sm text-muted-foreground">checkpoints processed</span>
      </div>
      <div className="w-px h-6 bg-border hidden sm:block" />
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold font-mono tabular-nums text-success">
          {counts.fills}/15
        </span>
        <span className="text-sm text-muted-foreground">fills executed</span>
      </div>
      <div className="w-px h-6 bg-border hidden sm:block" />
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold font-mono tabular-nums text-destructive">
          {counts.rejections}
        </span>
        <span className="text-sm text-muted-foreground">rejections</span>
      </div>
    </div>
  )
}

export function EvidencePipeline() {
  const containerRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(containerRef, { once: true, margin: "-100px" })
  const [activeStep, setActiveStep] = useState(0)

  // Auto-cycle through steps
  useEffect(() => {
    if (!isInView) return

    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % pipelineSteps.length)
    }, 3000)

    return () => clearInterval(interval)
  }, [isInView])

  return (
    <section id="evidence" className="relative py-24 sm:py-32 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/20 to-background" />
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
            Evidence Pipeline
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto text-pretty">
            From LLM reasoning to on-chain attestation, every decision passes through 
            four verification gates. Zero shortcuts, complete transparency.
          </p>
        </motion.div>

        {/* Pipeline Counters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-12"
        >
          <PipelineCounters />
        </motion.div>

        {/* Pipeline Steps */}
        <div className="relative">
          {/* Vertical line on desktop */}
          <div className="hidden lg:block absolute left-1/2 top-0 bottom-0 w-px bg-border -translate-x-1/2">
            <DataParticle isActive={isInView} stepIndex={activeStep} />
          </div>

          <div className="space-y-8 lg:space-y-0">
            {pipelineSteps.map((step, index) => {
              const colors = colorMap[step.color]
              const isActive = activeStep === index
              const isLeft = index % 2 === 0

              return (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.1 + index * 0.1 }}
                  className={cn(
                    "relative lg:grid lg:grid-cols-2 lg:gap-8 lg:items-center",
                    !isLeft && "lg:flex-row-reverse"
                  )}
                >
                  {/* Step Number Circle (center on desktop) */}
                  <div
                    className={cn(
                      "hidden lg:flex absolute left-1/2 -translate-x-1/2 w-12 h-12 rounded-full items-center justify-center z-10 transition-all duration-300",
                      isActive
                        ? `${colors.bg} ${colors.border} border-2 shadow-lg`
                        : "bg-card border border-border"
                    )}
                  >
                    <span
                      className={cn(
                        "text-sm font-bold font-mono",
                        isActive ? colors.text : "text-muted-foreground"
                      )}
                    >
                      {step.number}
                    </span>
                  </div>

                  {/* Content Card */}
                  <div
                    className={cn(
                      "relative",
                      isLeft ? "lg:pr-16 lg:text-right" : "lg:pl-16 lg:col-start-2"
                    )}
                  >
                    <motion.div
                      whileHover={{ y: -4 }}
                      className={cn(
                        "p-6 rounded-2xl border transition-all duration-300",
                        isActive
                          ? `${colors.bg} ${colors.border} shadow-lg`
                          : "bg-card border-border hover:border-muted-foreground"
                      )}
                    >
                      {/* Mobile step number */}
                      <div className="flex lg:hidden items-center gap-3 mb-4">
                        <div
                          className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center",
                            colors.bg,
                            colors.border,
                            "border"
                          )}
                        >
                          <span className={cn("text-sm font-bold font-mono", colors.text)}>
                            {step.number}
                          </span>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>

                      <div
                        className={cn(
                          "flex items-start gap-4",
                          isLeft && "lg:flex-row-reverse"
                        )}
                      >
                        {/* Icon */}
                        <div className={cn("p-3 rounded-xl shrink-0", colors.bg)}>
                          <step.icon className={cn("h-6 w-6", colors.text)} />
                        </div>

                        <div className={cn("flex-1", isLeft && "lg:text-right")}>
                          {/* Header */}
                          <div
                            className={cn(
                              "flex items-center gap-2 mb-2",
                              isLeft && "lg:justify-end"
                            )}
                          >
                            <h3 className="text-lg font-semibold text-foreground">
                              {step.title}
                            </h3>
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded-full text-xs font-medium",
                                colors.bg,
                                colors.text
                              )}
                            >
                              {step.status}
                            </span>
                          </div>

                          {/* Description */}
                          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                            {step.description}
                          </p>

                          {/* Artifact Preview */}
                          <div
                            className={cn(
                              "p-3 rounded-lg bg-black/50 border border-border",
                              isLeft && "lg:ml-auto lg:text-left"
                            )}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                              <span className="text-xs font-mono text-muted-foreground">
                                {step.artifact.file}
                              </span>
                            </div>
                            <code className="text-xs font-mono text-foreground break-all">
                              {step.artifact.preview}
                            </code>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </div>

                  {/* Empty space for alternating layout on desktop */}
                  <div className={cn("hidden lg:block", isLeft && "lg:col-start-2")} />
                </motion.div>
              )
            })}
          </div>
        </div>

        {/* Evidence Output Callout */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="mt-16 p-6 rounded-2xl bg-gradient-to-r from-primary/10 via-success/10 to-chart-4/10 border border-primary/20"
        >
          <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
            <div className="p-3 rounded-xl bg-primary/20">
              <CheckCircle className="h-8 w-8 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-foreground mb-1">
                Deterministic Evidence Output
              </h3>
              <p className="text-muted-foreground">
                Every pipeline run produces identical, reproducible artifacts. The same 
                inputs always yield the same cryptographic outputs—no randomness, no 
                surprises, complete auditability.
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm font-mono">
              <span className="text-success">100%</span>
              <span className="text-muted-foreground">coverage</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
