"use client";

import { motion } from "framer-motion";
import { Brain, PenTool, Shield, Link, ArrowDown } from "lucide-react";

const pipelineSteps = [
  {
    id: 1,
    icon: Brain,
    title: "Groq LLM Reasoning",
    subtitle: "Decision Generation",
    description:
      "The FluxAgent processes market data through Groq-accelerated inference, generating structured TradeIntent decisions with full reasoning chains.",
    technical: "Groq API → JSON reasoning output → SHA-256 hash commitment",
    status: "Processing",
    color: "chart-3",
  },
  {
    id: 2,
    icon: PenTool,
    title: "EIP-712 Signing",
    subtitle: "Cryptographic Binding",
    description:
      "Each TradeIntent is wrapped in an EIP-712 typed data structure and signed by the agent operator, creating an immutable link between reasoning and intent.",
    technical: "EIP-712 domain separator → typed struct hashing → ECDSA signature",
    status: "Signing",
    color: "primary",
  },
  {
    id: 3,
    icon: Shield,
    title: "RiskRouter Validation",
    subtitle: "Hard Limit Enforcement",
    description:
      "The RiskRouter smart contract validates every trade against hard-coded drawdown limits. No trade can bypass these on-chain constraints.",
    technical: "Max drawdown check → position limit validation → execution gate",
    status: "Validating",
    color: "chart-4",
  },
  {
    id: 4,
    icon: Link,
    title: "On-Chain Attestation",
    subtitle: "Immutable Record",
    description:
      "Validated trades are executed with checkpoint attestations stored on-chain, creating a permanent, auditable record of every decision.",
    technical: "Checkpoint emission → event logging → block confirmation",
    status: "Attested",
    color: "chart-2",
  },
];

export function EvidencePipeline() {
  return (
    <section id="evidence" className="relative py-32 px-6 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/3 w-[500px] h-[500px] rounded-full bg-chart-3/3 blur-[150px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-primary/3 blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <span className="inline-block text-xs font-semibold tracking-wider text-primary uppercase mb-4">
            The Evidence Pipeline
          </span>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-foreground mb-4 text-balance">
            From Reasoning to Attestation
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto text-pretty">
            A deterministic pipeline that transforms LLM reasoning into cryptographically 
            verifiable on-chain evidence. Every step is auditable.
          </p>
        </motion.div>

        {/* Pipeline Steps */}
        <div className="relative">
          {/* Connection Line */}
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-border to-transparent hidden lg:block" />

          <div className="space-y-8 lg:space-y-0">
            {pipelineSteps.map((step, index) => (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.5, delay: index * 0.15 }}
                className={`relative lg:grid lg:grid-cols-2 lg:gap-16 lg:items-center ${
                  index % 2 === 1 ? "lg:direction-rtl" : ""
                }`}
              >
                {/* Step Number - Center */}
                <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-4 hidden lg:flex flex-col items-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-card border border-border shadow-2xl shadow-primary/5">
                    <span className="text-lg font-bold text-primary">{step.id}</span>
                  </div>
                  {index < pipelineSteps.length - 1 && (
                    <div className="mt-4">
                      <ArrowDown className="h-5 w-5 text-muted-foreground animate-pulse" />
                    </div>
                  )}
                </div>

                {/* Content Card */}
                <div
                  className={`${
                    index % 2 === 1 ? "lg:col-start-2" : "lg:col-start-1"
                  }`}
                >
                  <div className="group rounded-3xl border border-border bg-card/30 backdrop-blur-sm p-8 transition-all hover:border-primary/20 hover:bg-card/50">
                    {/* Header */}
                    <div className="flex items-start gap-4 mb-6">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
                        <step.icon className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="text-xl font-semibold text-foreground">
                            {step.title}
                          </h3>
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                            {step.status}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{step.subtitle}</p>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-muted-foreground leading-relaxed mb-6">
                      {step.description}
                    </p>

                    {/* Technical Detail */}
                    <div className="rounded-xl bg-muted/30 border border-border p-4">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Technical Flow
                      </span>
                      <p className="mt-2 text-sm font-mono text-foreground">
                        {step.technical}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Mobile Step Indicator */}
                <div className="flex items-center gap-4 mb-4 lg:hidden">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
                    <span className="text-sm font-bold text-primary">{step.id}</span>
                  </div>
                  <div className="flex-1 h-px bg-border" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Evidence Output */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-20"
        >
          <div className="rounded-3xl border border-primary/20 bg-primary/5 p-8">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/20 border border-primary/30">
                <span className="text-2xl font-bold text-primary">✓</span>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  Deterministic Evidence Output
                </h3>
                <p className="text-muted-foreground">
                  Every execution produces <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-sm">metrics.json</code> and{" "}
                  <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-sm">phase2-evidence.json</code>{" "}
                  artifacts for complete judge and investor auditability.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
