import { Navigation } from "@/components/navigation"
import { Hero } from "@/components/sections/hero"
import { AlphaVectors } from "@/components/sections/alpha-vectors"
import { ERC8004Trinity } from "@/components/sections/erc8004-trinity"
import { EvidencePipeline } from "@/components/sections/evidence-pipeline"
import { ScoreStory } from "@/components/sections/score-story"
import { Verdict } from "@/components/sections/verdict"
import { Footer } from "@/components/footer"

export default function Home() {
  return (
    <main className="relative min-h-screen bg-background">
      <Navigation />
      <Hero />
      <AlphaVectors />
      <ERC8004Trinity />
      <EvidencePipeline />
      <ScoreStory />
      <Verdict />
      <Footer />
    </main>
  )
}
