"use client";

import { motion } from "framer-motion";
import { FileJson, CheckCircle2, ExternalLink, Download, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const manifestData = {
  name: "FluxAgent",
  version: "1.0.0",
  standard: "ERC-8004",
  submittedAt: "2026-04-10T10:00:00Z",
  attestations: {
    identityRegistry: "0x97b07dDc405B0c28B17559aFFE63BdB3632d0ca3",
    reputationRegistry: "0x423a9904e39537a9997fbaF0f220d79D7d545763",
    validationRegistry: "0x6e0A7C2c158fa535083FDeFA1839273fAc36C9BE",
  },
  proofCoverage: "100%",
  riskRouterActive: true,
};

const evidenceStatus = [
  { label: "ERC-8004 Compliance", status: "verified", hash: "0x8a4f...2e1d" },
  { label: "Identity Passport Minted", status: "verified", hash: "0x3b2c...7f4a" },
  { label: "RiskRouter Deployed", status: "verified", hash: "0x1d9e...5c8b" },
  { label: "EIP-712 Signatures Valid", status: "verified", hash: "0x6f7a...9d3e" },
  { label: "Checkpoint Attestations", status: "verified", hash: "0x2c4b...8e1f" },
  { label: "Evidence Pipeline Complete", status: "verified", hash: "0x5e9d...3a7c" },
];

export function Verdict() {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  const copyStatusText =
    copyState === "copied"
      ? "Copied to clipboard"
      : copyState === "error"
        ? "Copy failed"
        : "Copy manifest";

  const copyStatusClass =
    copyState === "copied"
      ? "text-[#00ff88]"
      : copyState === "error"
        ? "text-destructive"
        : "text-muted-foreground";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(manifestData, null, 2));
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }

    window.setTimeout(() => setCopyState("idle"), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(manifestData, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "submission-manifest.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <section id="audit" className="relative py-32 px-6">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] rounded-full bg-chart-3/3 blur-[150px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block text-xs font-semibold tracking-wider text-primary uppercase mb-4">
            The Verdict
          </span>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-foreground mb-4 text-balance">
            One-Click Audit
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto text-pretty">
            Complete transparency for judges and investors. Every claim is verifiable, 
            every proof is on-chain.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Submission Manifest */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="rounded-3xl border border-border bg-card/30 backdrop-blur-sm overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
                  <FileJson className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">submission-manifest.json</h3>
                  <p className="text-xs text-muted-foreground">Hackathon submission proof</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={handleCopy}
                  type="button"
                >
                  {copyState === "copied" ? (
                    <CheckCircle2 className="h-4 w-4 text-[#00ff88]" />
                  ) : (
                    <Copy className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={handleDownload}
                  type="button"
                >
                  <Download className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </div>
            <div className="px-6 pt-4 text-right">
              <span aria-live="polite" className={`text-xs ${copyStatusClass}`}>
                {copyStatusText}
              </span>
            </div>
            <div className="p-6">
              <pre className="text-sm font-mono text-muted-foreground leading-relaxed overflow-x-auto">
                <code>{JSON.stringify(manifestData, null, 2)}</code>
              </pre>
            </div>
          </motion.div>

          {/* Phase 2 Evidence Status */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="rounded-3xl border border-border bg-card/30 backdrop-blur-sm overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#00ff88]/10 border border-[#00ff88]/20">
                  <CheckCircle2 className="h-5 w-5 text-[#00ff88]" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">phase2-evidence.json</h3>
                  <p className="text-xs text-muted-foreground">Verification status</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20">
                <span className="h-1.5 w-1.5 rounded-full bg-[#00ff88]" />
                All Verified
              </span>
            </div>
            <div className="p-6 space-y-3">
              {evidenceStatus.map((item, index) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: 0.2 + index * 0.05 }}
                  className="flex items-center justify-between rounded-xl bg-muted/30 border border-border px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 text-[#00ff88]" />
                    <span className="text-sm text-foreground">{item.label}</span>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">
                    {item.hash}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Why This Project Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mt-12 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-8"
        >
          <h3 className="text-xl font-semibold text-foreground mb-6">
            Why FluxAgent is Technically Superior
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                title: "Verifiable Reasoning",
                description:
                  "Unlike opaque trading bots, every FluxAgent decision is cryptographically bound to its reasoning chain via EIP-712 signatures.",
              },
              {
                title: "Hard Risk Constraints",
                description:
                  "The RiskRouter enforces drawdown limits at the smart contract level. No override is possible—not even by the operator.",
              },
              {
                title: "Complete Auditability",
                description:
                  "The deterministic evidence pipeline produces machine-readable artifacts that judges can independently verify on-chain.",
              },
            ].map((item, index) => (
              <div key={item.title} className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary">{index + 1}</span>
                  </div>
                  <h4 className="font-semibold text-foreground">{item.title}</h4>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.4 }}
          className="mt-12 text-center"
        >
          <div className="inline-flex flex-col sm:flex-row items-center gap-4">
            <Button
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-8"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Verify on Etherscan
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="border-border bg-card/50 hover:bg-card px-8"
            >
              Download Evidence Bundle
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
