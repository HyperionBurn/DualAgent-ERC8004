"use client";

import { motion, animate } from "framer-motion";
import { useEffect, useState } from "react";
import { TrendingUp, Shield, Activity, Lock, Fingerprint } from "lucide-react";

function AnimatedNumber({ value, prefix = "", suffix = "" }: { value: number; prefix?: string; suffix?: string }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const controls = animate(0, value, {
      duration: 2,
      ease: "easeOut",
      onUpdate: (v) => setDisplayValue(v),
    });
    return controls.stop;
  }, [value]);

  return (
    <span>
      {prefix}
      {value < 1 ? displayValue.toFixed(2) : displayValue.toFixed(value % 1 === 0 ? 0 : 2)}
      {suffix}
    </span>
  );
}

const metrics = {
  pnl: {
    value: 0.43,
    change: 0.0,
    label: "Live Net PnL",
    isPositive: true,
  },
  maxDrawdown: {
    value: -0.0,
    limit: -15, // Safe default threshold
    label: "Max Drawdown",
    limitLabel: "RiskRouter Limit",
  },
  proofCoverage: {
    value: 100,
    label: "Proof Coverage",
  },
  trades: {
    value: 10,
    label: "Verified Checkpoints",
  },
  successRate: {
    value: 91.4,
    label: "Validation Score",
  },
  avgReturn: {
    value: 89.0,
    label: "Reputation Score",
  },
};

const secondaryMetrics = [
  {
    ...metrics.trades,
    icon: Activity,
    iconClasses: "bg-chart-2/10 border-chart-2/20 text-chart-2",
  },
  {
    ...metrics.successRate,
    icon: Shield,
    iconClasses: "bg-[#00ff88]/10 border-[#00ff88]/20 text-[#00ff88]",
  },
  {
    ...metrics.avgReturn,
    icon: TrendingUp,
    iconClasses: "bg-primary/10 border-primary/20 text-primary",
  },
];

export function ScoreStory() {
  return (
    <section id="metrics" className="relative py-32 px-6">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-0 w-[500px] h-[500px] rounded-full bg-[#00ff88]/3 blur-[150px]" />
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
            Live Performance
          </span>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-foreground mb-4 text-balance">
            The Score Story
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto text-pretty">
            Real-time metrics with on-chain verification. Every number is cryptographically 
            attested and auditable.
          </p>
        </motion.div>

        {/* Metrics Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* PnL Card - Large */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="md:col-span-2 rounded-3xl border border-border bg-card/30 backdrop-blur-sm p-8"
          >
            <div className="flex items-start justify-between mb-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#00ff88]/10 border border-[#00ff88]/20">
                <TrendingUp className="h-5 w-5 text-[#00ff88]" />
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00ff88]/10 border border-[#00ff88]/20">
                <span className="h-2 w-2 rounded-full bg-[#00ff88] animate-pulse" />
                <span className="text-xs font-medium text-[#00ff88]">Live</span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">{metrics.pnl.label}</p>
              <div className="flex items-baseline gap-4">
                <span className="text-5xl font-semibold text-[#00ff88] tabular-nums">
                  <AnimatedNumber value={metrics.pnl.value} prefix="$" />
                </span>
                <span className="flex items-center gap-1 text-sm font-medium text-[#00ff88]">
                  <TrendingUp className="h-4 w-4" />
                  +{metrics.pnl.change}%
                </span>
              </div>
            </div>

            {/* Mini Chart Visual */}
            <div className="mt-8 h-20 flex items-end gap-1">
              {[35, 42, 38, 55, 48, 62, 58, 75, 68, 82, 78, 92, 85, 100].map((height, i) => (
                <motion.div
                  key={i}
                  initial={{ height: 0 }}
                  whileInView={{ height: `${height}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                  className="flex-1 rounded-t bg-gradient-to-t from-[#00ff88]/20 to-[#00ff88]/60"
                />
              ))}
            </div>
          </motion.div>

          {/* Max Drawdown Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="rounded-3xl border border-border bg-card/30 backdrop-blur-sm p-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-chart-4/10 border border-chart-4/20">
                <Shield className="h-5 w-5 text-chart-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">{metrics.maxDrawdown.label}</p>
              </div>
            </div>

            <div className="space-y-4">
              <span className="text-3xl font-semibold text-foreground tabular-nums">
                <AnimatedNumber value={Math.abs(metrics.maxDrawdown.value)} prefix="-" suffix="%" />
              </span>

              {/* Drawdown Gauge */}
              <div className="space-y-2">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: `${(Math.abs(metrics.maxDrawdown.value) / Math.abs(metrics.maxDrawdown.limit)) * 100}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 1, delay: 0.3 }}
                    className="h-full bg-gradient-to-r from-[#00ff88] to-chart-4 rounded-full"
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Current</span>
                  <span className="flex items-center gap-1 text-destructive">
                    <Lock className="h-3 w-3" />
                    {metrics.maxDrawdown.limit}% Limit
                  </span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Proof Coverage Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="rounded-3xl border border-primary/30 bg-primary/5 p-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 border border-primary/30">
                <Fingerprint className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">{metrics.proofCoverage.label}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-semibold text-primary tabular-nums">
                  <AnimatedNumber value={metrics.proofCoverage.value} />
                </span>
                <span className="text-xl font-medium text-primary">%</span>
              </div>

              <p className="text-xs text-muted-foreground">
                Every trade cryptographically attested with EIP-712 signatures
              </p>
            </div>
          </motion.div>

          {/* Secondary Metrics */}
          {secondaryMetrics.map((metric, index) => (
            <motion.div
              key={metric.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.3 + index * 0.1 }}
              className="rounded-3xl border border-border bg-card/30 backdrop-blur-sm p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${metric.iconClasses}`}>
                  <metric.icon className="h-5 w-5" />
                </div>
              </div>
              <p className="text-xs font-medium text-muted-foreground mb-1">{metric.label}</p>
              <span className="text-2xl font-semibold text-foreground tabular-nums">
                <AnimatedNumber 
                  value={metric.value} 
                  prefix={"prefix" in metric ? metric.prefix || "" : ""} 
                  suffix={"suffix" in metric ? metric.suffix || "" : ""} 
                />
              </span>
            </motion.div>
          ))}

          {/* RiskRouter Status Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.6 }}
            className="rounded-3xl border border-[#00ff88]/30 bg-[#00ff88]/5 p-6"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#00ff88]/20 border border-[#00ff88]/30">
                <Shield className="h-5 w-5 text-[#00ff88]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">RiskRouter</p>
                <p className="text-xs text-[#00ff88]">Active & Enforcing</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
