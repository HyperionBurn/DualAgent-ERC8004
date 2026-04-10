"use client";

import { motion } from "framer-motion";
import { BrainCircuit, Activity, Network, Binary } from "lucide-react";

const features = [
  {
    icon: BrainCircuit,
    title: "Dual-LLM Consensus Ensemble",
    description:
      "A parallel execution architecture querying dual foundational models simultaneously. Exact directional consensus is required before firing TradeIntents. Disagreements automatically trigger a hard abort to HOLD safety.",
    classes: {
      bg: "bg-primary/10",
      border: "border-primary/20",
      text: "text-primary",
      gradient: "from-primary",
    }
  },
  {
    icon: Network,
    title: "Asymmetric Data Integration",
    description:
      "FluxAgent doesn't just chase price ladders. A dedicated background daemon intercepts Binance Order Book Depth Tilts, Funding Rates, ETH Base Gas, and sentiment vectors dynamically to inform macro market context.",
    classes: {
      bg: "bg-[#00ff88]/10",
      border: "border-[#00ff88]/20",
      text: "text-[#00ff88]",
      gradient: "from-[#00ff88]",
    }
  },
  {
    icon: Binary,
    title: "Immutable Smart Contract Guardrails",
    description:
      "Capital allocations are safeguarded by the RiskRouter contract on Sepolia. Protocol-enforced thresholds cap max drawdowns universally. The LLMs propose trades, but the blockchain strictly limits the fallout risk.",
    classes: {
      bg: "bg-chart-2/10",
      border: "border-chart-2/20",
      text: "text-chart-2",
      gradient: "from-chart-2",
    }
  },
  {
    icon: Activity,
    title: "Portable Reputation State",
    description:
      "The ERC-8004 Identity Passport maps historic wins and absolute PnL into the agent's DNA. FluxAgent enters any new arena with verifiable credentials attached to its cryptographic signature.",
    classes: {
      bg: "bg-chart-4/10",
      border: "border-chart-4/20",
      text: "text-chart-4",
      gradient: "from-chart-4",
    }
  },
];

export function AlphaVectors() {
  return (
    <section id="features" className="relative py-32 px-6">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute bottom-1/4 right-0 w-[400px] h-[400px] rounded-full bg-primary/3 blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block text-xs font-semibold tracking-wider text-primary uppercase mb-4">
            Competitive Edge
          </span>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-foreground mb-4 text-balance">
            The Alpha Vectors
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto text-pretty">
            Under the hood, FluxAgent employs high-tier logic gates separating the standard 
            algorithmic wrappers from institutional-grade intelligent autonomy.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              className="relative group rounded-3xl border border-border bg-card/30 backdrop-blur-sm p-8 overflow-hidden transition-all hover:border-border/80"
            >
              <div 
                className={`absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity bg-gradient-to-br ${feature.classes.gradient} to-transparent`}
              />
              
              <div className={`flex h-14 w-14 items-center justify-center rounded-xl ${feature.classes.bg} border ${feature.classes.border} mb-6`}>
                <feature.icon className={`h-6 w-6 ${feature.classes.text}`} />
              </div>
              
              <h3 className="text-xl font-semibold text-foreground mb-3">
                {feature.title}
              </h3>
              
              <p className="text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
