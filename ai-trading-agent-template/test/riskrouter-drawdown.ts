import { expect } from "chai";
import hre from "hardhat";

const ethers = (hre as any).ethers;

const TRADE_INTENT_TYPES = {
  TradeIntent: [
    { name: "agentId", type: "uint256" },
    { name: "agentWallet", type: "address" },
    { name: "pair", type: "string" },
    { name: "action", type: "string" },
    { name: "amountUsdScaled", type: "uint256" },
    { name: "maxSlippageBps", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

function outcomeRef(label: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(label));
}

async function signIntent(intent: any, signer: any, routerAddress: string): Promise<string> {
  const net = await ethers.provider.getNetwork();
  return signer.signTypedData(
    {
      name: "RiskRouter",
      version: "1",
      chainId: Number(net.chainId),
      verifyingContract: routerAddress,
    },
    TRADE_INTENT_TYPES,
    intent
  );
}

describe("RiskRouter drawdown enforcement", function () {
  async function deployCore() {
    const [owner, agent] = await ethers.getSigners();

    const registryFactory = await ethers.getContractFactory("AgentRegistry");
    const registry = await registryFactory.deploy();
    await registry.waitForDeployment();

    const routerFactory = await ethers.getContractFactory("RiskRouter");
    const router = await routerFactory.deploy(await registry.getAddress());
    await router.waitForDeployment();

    await registry.register(
      await agent.getAddress(),
      "DrawdownAgent",
      "Drawdown test agent",
      ["trading"],
      "ipfs://drawdown-agent"
    );

    const agentId = (await registry.totalAgents()) - 1n;
    return { owner, agent, registry, router, agentId };
  }

  it("rejects intents with explicit reason when drawdown threshold is breached", async function () {
    const { agent, router, agentId } = await deployCore();

    await router.setRiskParams(agentId, 1_000_000n, 500n, 10n); // 5% max drawdown

    await router.reportEquity(agentId, 1_000_000n, outcomeRef("peak-equity"));
    await router.reportEquity(agentId, 850_000n, outcomeRef("breach-equity")); // 15% drawdown

    const state = await router.getDrawdownState(agentId);
    expect(Number(state.drawdownBps)).to.equal(1500);
    expect(Boolean(state.circuitBreaker)).to.equal(true);

    const now = Math.floor(Date.now() / 1000);
    const intent = {
      agentId,
      agentWallet: await agent.getAddress(),
      pair: "XBTUSD",
      action: "BUY",
      amountUsdScaled: 50_000n,
      maxSlippageBps: 50n,
      nonce: 0n,
      deadline: BigInt(now + 300),
    };

    const signature = await signIntent(intent, agent, await router.getAddress());
    const simulation = await router.submitTradeIntent.staticCall(intent, signature);
    expect(simulation[0]).to.equal(false);
    expect(simulation[1]).to.equal("Drawdown circuit breaker active");
  });

  it("keeps trades valid when drawdown is within configured limit", async function () {
    const { agent, router, agentId } = await deployCore();

    await router.setRiskParams(agentId, 1_000_000n, 2000n, 10n); // 20% max drawdown

    await router.reportEquity(agentId, 1_000_000n, outcomeRef("peak-equity"));
    await router.reportEquity(agentId, 900_000n, outcomeRef("safe-equity")); // 10% drawdown

    const now = Math.floor(Date.now() / 1000);
    const intent = {
      agentId,
      agentWallet: await agent.getAddress(),
      pair: "XBTUSD",
      action: "BUY",
      amountUsdScaled: 50_000n,
      maxSlippageBps: 50n,
      nonce: 0n,
      deadline: BigInt(now + 300),
    };

    const signature = await signIntent(intent, agent, await router.getAddress());
    const simulation = await router.submitTradeIntent.staticCall(intent, signature);
    expect(simulation[0]).to.equal(true);
    expect(simulation[1]).to.equal("");
  });
});
