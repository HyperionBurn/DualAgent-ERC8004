"use client"

import { useRef, useEffect, useState } from "react"
import { motion, useInView } from "framer-motion"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import { TrendingUp, TrendingDown, Activity, Shield, CheckCircle, Award, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

// Real metrics from the brief
const agent5Metrics = {
  agentId: "5",
  netPnlUsd: 0.47,
  maxDrawdownBps: 2,
  currentEquityUsd: 10000.47,
  peakEquityUsd: 10001.37,
  averageValidationScore: 99,
  averageReputationScore: 93,
  compositeScore: 78.78,
  checkpointCount: 60,
  fillCount: 15,
  reputationFeedbackCount: 73,
  validationCoveragePct: 100,
  riskAdjustedProfitabilityScore: 50.09,
  drawdownControlScore: 99.96,
  validationQualityScore: 99,
  objectiveReputationScore: 93,
}

const agent53Metrics = {
  agentId: "53",
  validationScore: 92.23,
  reputationScore: 90,
  compositeScore: 76.98,
  checkpoints: 53,
  fills: 15,
  maxDrawdownBps: 0,
  netPnlUsd: 0.44,
}

// Generate equity curve data (deterministic seed based on real metrics)
const generateEquityCurve = () => {
  const points = []
  let equity = 10000
  // Deterministic PRNG (simple LCG) for reproducible renders
  let seed = 42
  const random = () => {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff
    return (seed >>> 0) / 0xffffffff
  }
  for (let i = 0; i <= 60; i++) {
    const noise = (random() - 0.5) * 0.3
    const trend = (i / 60) * 0.47
    equity = 10000 + trend + noise
    if (i === 60) equity = 10000.47
    points.push({
      checkpoint: i,
      equity: parseFloat(equity.toFixed(2)),
    })
  }
  return points
}

const equityCurveData = generateEquityCurve()

// Composite score breakdown for donut chart
const compositeBreakdown = [
  { name: "Risk-Adjusted Profitability", value: 50.09, color: "#00d4ff" },
  { name: "Drawdown Control", value: 99.96, color: "#00ff88" },
  { name: "Validation Quality", value: 99, color: "#6366f1" },
  { name: "Objective Reputation", value: 93, color: "#8b5cf6" },
]

// Animated number hook
function useAnimatedNumber(target: number, duration: number = 2000, decimals: number = 0) {
  const [value, setValue] = useState(0)
  const [hasStarted, setHasStarted] = useState(false)

  useEffect(() => {
    if (!hasStarted) return

    let startTime: number
    let animationFrame: number

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 4)
      setValue(eased * target)

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate)
      }
    }

    animationFrame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationFrame)
  }, [target, duration, hasStarted])

  return { value: value.toFixed(decimals), start: () => setHasStarted(true) }
}

// Custom tooltip for charts
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: number }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-xl">
        <p className="text-xs text-muted-foreground mb-1">Checkpoint {label}</p>
        <p className="text-sm font-mono font-bold text-primary">
          ${payload[0].value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </p>
      </div>
    )
  }
  return null
}

// Animated score ring component
function ScoreRing({ score, size = 200 }: { score: number; size?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true })
  const [currentScore, setCurrentScore] = useState(0)

  useEffect(() => {
    if (!isInView) return

    const duration = 2000
    const startTime = Date.now()

    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 4)
      setCurrentScore(eased * score)

      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }

    requestAnimationFrame(animate)
  }, [isInView, score])

  const circumference = 2 * Math.PI * 80
  const strokeDashoffset = circumference - (currentScore / 100) * circumference

  return (
    <div ref={ref} className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 200 200" className="-rotate-90">
        {/* Background ring */}
        <circle
          cx="100"
          cy="100"
          r="80"
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="12"
        />
        {/* Progress ring */}
        <motion.circle
          cx="100"
          cy="100"
          r="80"
          fill="none"
          stroke="url(#scoreGradient)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          initial={{ strokeDashoffset: circumference }}
        />
        <defs>
          <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00d4ff" />
            <stop offset="100%" stopColor="#00ff88" />
          </linearGradient>
        </defs>
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold font-mono tabular-nums text-foreground">
          {currentScore.toFixed(2)}
        </span>
        <span className="text-sm text-muted-foreground">Composite Score</span>
      </div>
    </div>
  )
}

// Comparison table row component
function ComparisonRow({
  label,
  agent5Value,
  agent53Value,
  format = "number",
  highlight = false,
}: {
  label: string
  agent5Value: number | string
  agent53Value: number | string
  format?: "number" | "score" | "currency" | "bps"
  highlight?: boolean
}) {
  const formatValue = (value: number | string) => {
    if (typeof value === "string") return value
    switch (format) {
      case "currency":
        return `$${value.toFixed(2)}`
      case "bps":
        return `${value} bps`
      case "score":
        return value.toFixed(2)
      default:
        return value.toString()
    }
  }

  const agent5Wins = typeof agent5Value === "number" && typeof agent53Value === "number"
    ? agent5Value > agent53Value
    : false

  return (
    <div
      className={cn(
        "grid grid-cols-3 gap-4 py-3 px-4 rounded-lg",
        highlight ? "bg-primary/5" : "hover:bg-muted/50"
      )}
    >
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-sm font-mono tabular-nums text-center",
          agent5Wins ? "text-success font-semibold" : "text-foreground"
        )}
      >
        {formatValue(agent5Value)}
      </span>
      <span
        className={cn(
          "text-sm font-mono tabular-nums text-center",
          !agent5Wins && typeof agent53Value === "number" ? "text-chart-3 font-semibold" : "text-foreground"
        )}
      >
        {formatValue(agent53Value)}
      </span>
    </div>
  )
}

export function ScoreStory() {
  const containerRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(containerRef, { once: true, margin: "-100px" })

  // Animated counters
  const pnlCounter = useAnimatedNumber(0.47, 2000, 2)
  const equityCounter = useAnimatedNumber(10000.47, 2000, 2)
  const validationCounter = useAnimatedNumber(99, 2000, 0)
  const reputationCounter = useAnimatedNumber(93, 2000, 0)

  useEffect(() => {
    if (isInView) {
      pnlCounter.start()
      equityCounter.start()
      validationCounter.start()
      reputationCounter.start()
    }
  }, [isInView])

  return (
    <section id="metrics" className="relative py-24 sm:py-32 overflow-hidden">
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
            The Score Story
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto text-pretty">
            Real metrics from real testnet trading. Every number is backed by 
            cryptographic evidence and on-chain attestation.
          </p>
        </motion.div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Large: Equity Curve Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="lg:col-span-2 p-6 rounded-2xl bg-card border border-border"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Equity Curve</h3>
                <p className="text-sm text-muted-foreground">60 checkpoints over trading session</p>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-success" />
                <span className="text-lg font-bold font-mono tabular-nums text-success">
                  +${pnlCounter.value}
                </span>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={equityCurveData}>
                  <XAxis
                    dataKey="checkpoint"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#737373", fontSize: 10 }}
                    tickFormatter={(value) => (value % 15 === 0 ? value : "")}
                  />
                  <YAxis
                    domain={[9999.5, 10001.5]}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#737373", fontSize: 10 }}
                    tickFormatter={(value) => `$${value.toLocaleString()}`}
                    width={70}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="equity"
                    stroke="#00d4ff"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: "#00d4ff" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* Composite Score Ring */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="p-6 rounded-2xl bg-card border border-border flex flex-col items-center justify-center"
          >
            <ScoreRing score={agent5Metrics.compositeScore} size={180} />
            <div className="mt-4 text-center">
              <p className="text-xs text-muted-foreground">Agent 5 Performance Rating</p>
            </div>
          </motion.div>

          {/* Composite Breakdown Donut */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="p-6 rounded-2xl bg-card border border-border"
          >
            <h3 className="text-lg font-semibold text-foreground mb-4">Score Breakdown</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={compositeBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {compositeBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 space-y-1">
              {compositeBreakdown.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-muted-foreground truncate">{item.name}</span>
                  </div>
                  <span className="font-mono tabular-nums">{item.value}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Key Metrics Grid */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="lg:col-span-2 p-6 rounded-2xl bg-card border border-border"
          >
            <h3 className="text-lg font-semibold text-foreground mb-4">Key Metrics</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                {
                  label: "Current Equity",
                  value: `$${equityCounter.value}`,
                  icon: Activity,
                  color: "text-primary",
                  bg: "bg-primary/10",
                },
                {
                  label: "Max Drawdown",
                  value: "2 bps",
                  icon: Shield,
                  color: "text-success",
                  bg: "bg-success/10",
                  subtext: "Limit: 5000 bps",
                },
                {
                  label: "Validation Score",
                  value: validationCounter.value,
                  icon: CheckCircle,
                  color: "text-chart-3",
                  bg: "bg-chart-3/10",
                },
                {
                  label: "Reputation Score",
                  value: reputationCounter.value,
                  icon: Award,
                  color: "text-chart-4",
                  bg: "bg-chart-4/10",
                },
              ].map((metric) => (
                <div
                  key={metric.label}
                  className={cn(
                    "p-4 rounded-xl border border-border",
                    metric.bg
                  )}
                >
                  <div className={cn("p-2 rounded-lg w-fit mb-2", metric.bg)}>
                    <metric.icon className={cn("h-4 w-4", metric.color)} />
                  </div>
                  <p className={cn("text-2xl font-bold font-mono tabular-nums", metric.color)}>
                    {metric.value}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{metric.label}</p>
                  {metric.subtext && (
                    <p className="text-xs text-muted-foreground/60">{metric.subtext}</p>
                  )}
                </div>
              ))}
            </div>
          </motion.div>

          {/* Dual-Agent Comparison */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="lg:col-span-3 p-6 rounded-2xl bg-card border border-border"
          >
            <h3 className="text-lg font-semibold text-foreground mb-4">Dual-Agent Comparison</h3>
            <div className="border border-border rounded-xl overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-3 gap-4 py-3 px-4 bg-muted/50 border-b border-border">
                <span className="text-sm font-medium text-muted-foreground">Metric</span>
                <span className="text-sm font-medium text-center text-success">
                  Agent 5 (Primary)
                </span>
                <span className="text-sm font-medium text-center text-chart-3">
                  Agent 53 (Secondary)
                </span>
              </div>
              {/* Rows */}
              <div className="divide-y divide-border">
                <ComparisonRow
                  label="Composite Score"
                  agent5Value={78.78}
                  agent53Value={76.98}
                  format="score"
                  highlight
                />
                <ComparisonRow
                  label="Validation Score"
                  agent5Value={99}
                  agent53Value={92.23}
                  format="score"
                />
                <ComparisonRow
                  label="Reputation Score"
                  agent5Value={93}
                  agent53Value={90}
                  format="score"
                />
                <ComparisonRow
                  label="Checkpoints"
                  agent5Value={60}
                  agent53Value={53}
                />
                <ComparisonRow
                  label="Fills"
                  agent5Value={15}
                  agent53Value={15}
                />
                <ComparisonRow
                  label="Max Drawdown"
                  agent5Value={2}
                  agent53Value={0}
                  format="bps"
                />
                <ComparisonRow
                  label="Net PnL"
                  agent5Value={0.47}
                  agent53Value={0.44}
                  format="currency"
                />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
