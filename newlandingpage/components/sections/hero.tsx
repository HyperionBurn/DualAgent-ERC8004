"use client"

import { useEffect, useRef, useState } from "react"
import { motion, useScroll, useTransform } from "framer-motion"
import { Badge, ChevronDown, ExternalLink, Github, Shield, FileSignature, Fingerprint, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { Button } from "@/components/ui/button"

// Animated counter hook
function useAnimatedCounter(end: number, duration: number = 2000, decimals: number = 0) {
  const [count, setCount] = useState(0)
  const [hasStarted, setHasStarted] = useState(false)

  useEffect(() => {
    if (!hasStarted) return

    let startTime: number
    let animationFrame: number

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / duration, 1)
      
      // Easing function
      const easeOutQuart = 1 - Math.pow(1 - progress, 4)
      setCount(easeOutQuart * end)

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate)
      }
    }

    animationFrame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationFrame)
  }, [end, duration, hasStarted])

  return { count: count.toFixed(decimals), start: () => setHasStarted(true) }
}

// Particle background component
function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animationFrame: number
    let particles: Array<{
      x: number
      y: number
      vx: number
      vy: number
      size: number
      alpha: number
    }> = []

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    const createParticles = () => {
      particles = []
      const numParticles = Math.floor((canvas.width * canvas.height) / 15000)
      
      for (let i = 0; i < numParticles; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          size: Math.random() * 2 + 0.5,
          alpha: Math.random() * 0.5 + 0.1,
        })
      }
    }

    const drawParticles = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance < 120) {
            ctx.beginPath()
            ctx.strokeStyle = `rgba(0, 212, 255, ${0.1 * (1 - distance / 120)})`
            ctx.lineWidth = 0.5
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.stroke()
          }
        }
      }

      // Draw particles
      particles.forEach((particle) => {
        ctx.beginPath()
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(0, 212, 255, ${particle.alpha})`
        ctx.fill()

        // Update position
        particle.x += particle.vx
        particle.y += particle.vy

        // Wrap around edges
        if (particle.x < 0) particle.x = canvas.width
        if (particle.x > canvas.width) particle.x = 0
        if (particle.y < 0) particle.y = canvas.height
        if (particle.y > canvas.height) particle.y = 0
      })

      animationFrame = requestAnimationFrame(drawParticles)
    }

    resize()
    createParticles()
    drawParticles()

    window.addEventListener("resize", () => {
      resize()
      createParticles()
    })

    return () => {
      cancelAnimationFrame(animationFrame)
      window.removeEventListener("resize", resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none opacity-60"
    />
  )
}

const trustIndicators = [
  {
    icon: Fingerprint,
    label: "ERC-8004 Compliant",
    value: "60",
    suffix: "Checkpoints",
    color: "text-primary",
    bgColor: "bg-primary/10",
    borderColor: "border-primary/20",
  },
  {
    icon: Shield,
    label: "RiskRouter Enforced",
    value: "15",
    suffix: "Trades",
    color: "text-success",
    bgColor: "bg-success/10",
    borderColor: "border-success/20",
  },
  {
    icon: FileSignature,
    label: "EIP-712 Signed",
    value: "78.78",
    suffix: "Score",
    color: "text-chart-4",
    bgColor: "bg-chart-4/10",
    borderColor: "border-chart-4/20",
  },
]

const heroStats = [
  { label: "Equity", value: "$10,000.47", trend: "up" },
  { label: "PnL", value: "+$0.47", trend: "up" },
  { label: "Max DD", value: "2 bps", trend: "neutral" },
  { label: "Validation", value: "100/100", trend: "up" },
  { label: "Reputation", value: "99/100", trend: "up" },
]

export function Hero() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  })

  const y = useTransform(scrollYProgress, [0, 1], [0, 200])
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0])

  const checkpointCounter = useAnimatedCounter(60, 2000, 0)
  const tradeCounter = useAnimatedCounter(15, 2000, 0)
  const scoreCounter = useAnimatedCounter(78.78, 2000, 2)

  useEffect(() => {
    const timer = setTimeout(() => {
      checkpointCounter.start()
      tradeCounter.start()
      scoreCounter.start()
    }, 500)
    return () => clearTimeout(timer)
  }, [])

  const counters = [checkpointCounter, tradeCounter, scoreCounter]

  return (
    <section
      ref={containerRef}
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
    >
      {/* Background layers */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-muted" />
      <ParticleField />
      <div className="absolute inset-0 grid-pattern opacity-50" />
      
      {/* Gradient orbs */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-primary/20 rounded-full blur-[128px] animate-pulse" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-success/10 rounded-full blur-[128px] animate-pulse" style={{ animationDelay: "1s" }} />

      {/* Content */}
      <motion.div
        style={{ y, opacity }}
        className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-20"
      >
        <div className="text-center">
          {/* Hackathon Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-success/10 border border-success/20 mb-8"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
            <span className="text-sm font-medium text-success">
              Ethereum Foundation Hackathon Submission
            </span>
          </motion.div>

          {/* Headline with staggered animation */}
          <motion.h1
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight text-balance"
          >
            <span className="text-foreground">Identity is the</span>
            <br />
            <span className="relative inline-block">
              <span className="text-gradient-cyan">New Alpha</span>
              <motion.span
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.8, delay: 1 }}
                className="absolute -bottom-2 left-0 right-0 h-1 bg-gradient-to-r from-primary to-success rounded-full origin-left"
              />
            </span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mt-8 text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto text-pretty"
          >
            The first ERC-8004 compliant agent with signature-level traceability and 
            on-chain risk enforcement. Every decision is cryptographically bound, 
            every trade is verifiable.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-5 flex flex-col items-center gap-3"
          >
            <p className="text-sm sm:text-base text-muted-foreground text-center">
              Leaderboard snapshot: <span className="text-foreground font-semibold">Agent 53</span> with <span className="text-foreground font-semibold">Validation 100/100</span> and <span className="text-foreground font-semibold">Reputation 99/100</span>.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-medium border border-primary/30 bg-primary/10 text-primary">
                Daily Risk Budget
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-medium border border-success/30 bg-success/10 text-success">
                Regime-Aware Sizing
              </span>
            </div>
          </motion.div>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="mt-10 flex flex-wrap items-center justify-center gap-4"
          >
            <Button
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90 glow-cyan gap-2 px-6"
              asChild
            >
              <a href="#protocol">
                <span>Explore Protocol</span>
              </a>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-border hover:bg-muted gap-2 px-6"
              asChild
            >
              <a href="#evidence">
                <span>View Evidence</span>
              </a>
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground gap-2"
              asChild
            >
              <a
                href="https://github.com/HyperionBurn/DualAgent-ERC8004"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="h-4 w-4" />
                <span>Source Code</span>
              </a>
            </Button>
          </motion.div>

          {/* Trust Indicator Cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.8 }}
            className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto"
          >
            {trustIndicators.map((indicator, index) => (
              <motion.div
                key={indicator.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.8 + index * 0.1 }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className={`group relative p-4 rounded-xl ${indicator.bgColor} border ${indicator.borderColor} glass-border overflow-hidden`}
              >
                {/* Hover gradient border effect */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-transparent via-primary/10 to-transparent" />
                
                <div className="relative flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${indicator.bgColor}`}>
                    <indicator.icon className={`h-5 w-5 ${indicator.color}`} />
                  </div>
                  <div className="text-left">
                    <div className="flex items-baseline gap-1">
                      <span className={`text-2xl font-bold font-mono tabular-nums ${indicator.color}`}>
                        {counters[index].count}
                      </span>
                      <span className="text-xs text-muted-foreground">{indicator.suffix}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{indicator.label}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Stats Ribbon */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 1 }}
            className="mt-12 flex flex-wrap items-center justify-center gap-6 sm:gap-8 py-4 px-6 rounded-xl bg-muted/50 border border-border max-w-fit mx-auto"
          >
            {heroStats.map((stat, index) => (
              <div key={stat.label} className="flex items-center gap-2">
                <div className="text-center sm:text-left">
                  <div className="flex items-center gap-1">
                    <span className="text-lg sm:text-xl font-bold font-mono tabular-nums text-foreground">
                      {stat.value}
                    </span>
                    {stat.trend === "up" && (
                      <TrendingUp className="h-3 w-3 text-success" />
                    )}
                    {stat.trend === "down" && (
                      <TrendingDown className="h-3 w-3 text-destructive" />
                    )}
                    {stat.trend === "neutral" && (
                      <Minus className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{stat.label}</span>
                </div>
                {index < heroStats.length - 1 && (
                  <div className="hidden sm:block w-px h-8 bg-border ml-4" />
                )}
              </div>
            ))}
          </motion.div>
        </div>
      </motion.div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5, duration: 0.5 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          className="flex flex-col items-center gap-2 text-muted-foreground"
        >
          <span className="text-xs uppercase tracking-wider">Scroll to explore</span>
          <ChevronDown className="h-4 w-4" />
        </motion.div>
      </motion.div>
    </section>
  )
}
