"use client"

import { motion, useInView } from "framer-motion"
import { useRef } from "react"
import { BrainCircuit, Network, Binary, Activity } from "lucide-react"

const features = [
  {
    number: "01",
    icon: BrainCircuit,
    title: "Dual-LLM Consensus",
    description:
      "Two independent language models analyze market conditions and must reach consensus before any trading decision. Eliminates single-point-of-failure reasoning.",
    color: "text-primary",
    bgColor: "bg-primary/10",
    borderColor: "border-primary/20",
    glowColor: "group-hover:shadow-primary/20",
    span: "col-span-1 md:col-span-2",
    animation: "consensus",
  },
  {
    number: "02",
    icon: Network,
    title: "Asymmetric Data Integration",
    description:
      "Real-time market feeds, on-chain metrics, and sentiment analysis converge into a unified decision matrix. Information advantage through data diversity.",
    color: "text-chart-3",
    bgColor: "bg-chart-3/10",
    borderColor: "border-chart-3/20",
    glowColor: "group-hover:shadow-chart-3/20",
    span: "col-span-1",
    animation: "orbit",
  },
  {
    number: "03",
    icon: Binary,
    title: "Immutable Smart Contract Guardrails",
    description:
      "RiskRouter.sol enforces position limits, drawdown thresholds, and trade frequency caps at the protocol level. No override possible.",
    color: "text-success",
    bgColor: "bg-success/10",
    borderColor: "border-success/20",
    glowColor: "group-hover:shadow-success/20",
    span: "col-span-1",
    animation: "shield",
  },
  {
    number: "04",
    icon: Activity,
    title: "Portable Reputation State",
    description:
      "Performance metrics, validation scores, and reputation feedback travel with the agent across protocols. Your track record is your passport.",
    color: "text-chart-4",
    bgColor: "bg-chart-4/10",
    borderColor: "border-chart-4/20",
    glowColor: "group-hover:shadow-chart-4/20",
    span: "col-span-1 md:col-span-2",
    animation: "growth",
  },
]

// Animated visualization components
function ConsensusAnimation({ color }: { color: string }) {
  return (
    <div className="relative w-full h-20 flex items-center justify-center">
      {/* Left signal */}
      <motion.div
        className={`absolute left-4 w-2 h-2 rounded-full ${color.replace("text-", "bg-")}`}
        animate={{
          x: [0, 40, 40],
          opacity: [1, 1, 0],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      {/* Right signal */}
      <motion.div
        className={`absolute right-4 w-2 h-2 rounded-full ${color.replace("text-", "bg-")}`}
        animate={{
          x: [0, -40, -40],
          opacity: [1, 1, 0],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      {/* Center merge point */}
      <motion.div
        className={`w-4 h-4 rounded-full ${color.replace("text-", "bg-")} opacity-50`}
        animate={{
          scale: [1, 1.5, 1],
          opacity: [0.3, 0.8, 0.3],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      {/* Consensus flash */}
      <motion.span
        className={`absolute text-xs font-mono ${color} font-bold`}
        animate={{
          opacity: [0, 0, 1, 1, 0],
          y: [10, 10, 0, 0, -10],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        CONSENSUS
      </motion.span>
    </div>
  )
}

function OrbitAnimation({ color }: { color: string }) {
  return (
    <div className="relative w-full h-20 flex items-center justify-center">
      {/* Central brain */}
      <div className={`w-4 h-4 rounded-full ${color.replace("text-", "bg-")} opacity-60`} />
      
      {/* Orbiting nodes */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className={`absolute w-2 h-2 rounded-full ${color.replace("text-", "bg-")}`}
          animate={{
            rotate: 360,
          }}
          transition={{
            duration: 3 + i,
            repeat: Infinity,
            ease: "linear",
          }}
          style={{
            transformOrigin: "center center",
          }}
        >
          <motion.div
            className={`w-2 h-2 rounded-full ${color.replace("text-", "bg-")}`}
            style={{
              transform: `translateX(${20 + i * 10}px)`,
            }}
          />
        </motion.div>
      ))}
    </div>
  )
}

function ShieldAnimation({ color }: { color: string }) {
  return (
    <div className="relative w-full h-20 flex items-center justify-center">
      {/* Shield icon */}
      <motion.div
        className={`w-8 h-8 rounded-lg ${color.replace("text-", "bg-")} opacity-30`}
        animate={{
          scale: [1, 1.1, 1],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      {/* Force field rings */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className={`absolute rounded-full border ${color.replace("text-", "border-")}`}
          style={{
            width: 40 + i * 16,
            height: 40 + i * 16,
          }}
          animate={{
            opacity: [0.5, 0, 0.5],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.3,
          }}
        />
      ))}
    </div>
  )
}

function GrowthAnimation({ color }: { color: string }) {
  return (
    <div className="relative w-full h-20 flex items-end justify-center gap-1 pb-2">
      {[0.3, 0.5, 0.4, 0.7, 0.6, 0.8, 0.9, 1].map((height, i) => (
        <motion.div
          key={i}
          className={`w-2 rounded-sm ${color.replace("text-", "bg-")}`}
          initial={{ height: 0 }}
          animate={{ height: height * 50 }}
          transition={{
            duration: 0.5,
            delay: i * 0.1,
            repeat: Infinity,
            repeatType: "reverse",
            repeatDelay: 1.5,
          }}
        />
      ))}
    </div>
  )
}

function FeatureAnimation({ type, color }: { type: string; color: string }) {
  switch (type) {
    case "consensus":
      return <ConsensusAnimation color={color} />
    case "orbit":
      return <OrbitAnimation color={color} />
    case "shield":
      return <ShieldAnimation color={color} />
    case "growth":
      return <GrowthAnimation color={color} />
    default:
      return null
  }
}

export function AlphaVectors() {
  const containerRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(containerRef, { once: true, margin: "-100px" })

  return (
    <section id="protocol" className="relative py-24 sm:py-32 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-muted via-background to-background" />
      <div className="absolute inset-0 grid-pattern opacity-30" />

      <div ref={containerRef} className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
            The Alpha Vectors
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto text-pretty">
            Four architectural pillars that transform autonomous trading from black-box 
            speculation into verifiable, auditable intelligence.
          </p>
        </motion.div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`group relative ${feature.span}`}
            >
              <div
                className={`relative h-full p-6 rounded-2xl bg-card border ${feature.borderColor} 
                  transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${feature.glowColor}
                  overflow-hidden noise-overlay`}
              >
                {/* Large background number */}
                <span
                  className={`absolute top-4 right-4 text-6xl font-bold font-mono ${feature.color} opacity-5 
                    group-hover:opacity-10 transition-opacity`}
                >
                  {feature.number}
                </span>

                {/* Content */}
                <div className="relative flex flex-col h-full">
                  {/* Icon */}
                  <div className={`inline-flex p-3 rounded-xl ${feature.bgColor} w-fit mb-4`}>
                    <feature.icon className={`h-6 w-6 ${feature.color}`} />
                  </div>

                  {/* Text */}
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed flex-grow">
                    {feature.description}
                  </p>

                  {/* Animation visualization */}
                  <div className="mt-4 pt-4 border-t border-border/50">
                    <FeatureAnimation type={feature.animation} color={feature.color} />
                  </div>
                </div>

                {/* Hover gradient overlay */}
                <div
                  className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 
                    bg-gradient-to-br from-transparent via-transparent to-${feature.color.replace("text-", "")}/5 
                    pointer-events-none rounded-2xl`}
                />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
