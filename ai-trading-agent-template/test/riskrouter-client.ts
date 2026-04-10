import { expect } from "chai";
import hre from "hardhat";
import { RiskRouterClient } from "../src/onchain/riskRouter";

const ethers = (hre as any).ethers;

describe("RiskRouterClient shared ABI compatibility", function () {
  it("reads risk params through the public mapping getter", async function () {
    const [owner, agent] = await ethers.getSigners();

    const registryFactory = await ethers.getContractFactory("AgentRegistry");
    const registry = await registryFactory.deploy();
    await registry.waitForDeployment();

    const routerFactory = await ethers.getContractFactory("RiskRouter");
    const router = await routerFactory.deploy(await registry.getAddress());
    await router.waitForDeployment();

    await registry.connect(owner).register(
      await agent.getAddress(),
      "ClientAgent",
      "RiskRouterClient test agent",
      ["trading"],
      "ipfs://client-agent"
    );

    const agentId = (await registry.totalAgents()) - 1n;
    await router.setRiskParams(agentId, 250_000n, 600n, 7n);

    const network = await ethers.provider.getNetwork();
    const client = new RiskRouterClient(
      await router.getAddress(),
      ethers.provider,
      Number(network.chainId)
    );

    const params = await client.getRiskParams(agentId);
    expect(params.maxPositionUsd).to.equal(2500);
    expect(params.maxDrawdownBps).to.equal(600);
    expect(params.maxTradesPerHour).to.equal(7);
    expect(params.active).to.equal(true);
  });
});
