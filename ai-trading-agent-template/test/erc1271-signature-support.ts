import { expect } from "chai";
import hre from "hardhat";

const ethers = (hre as any).ethers;

const AGENT_MESSAGE_TYPES = {
  AgentMessage: [
    { name: "agentId", type: "uint256" },
    { name: "agentWallet", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "contentHash", type: "bytes32" },
  ],
};

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

describe("ERC-1271 signature compatibility", function () {
  async function deployCore() {
    const [deployer, ownerSigner, eoaAgent] = await ethers.getSigners();

    const registryFactory = await ethers.getContractFactory("AgentRegistry");
    const registry = await registryFactory.deploy();
    await registry.waitForDeployment();

    const routerFactory = await ethers.getContractFactory("RiskRouter");
    const router = await routerFactory.deploy(await registry.getAddress());
    await router.waitForDeployment();

    const erc1271Factory = await ethers.getContractFactory("MockERC1271Wallet");
    const erc1271Wallet = await erc1271Factory.deploy(await ownerSigner.getAddress());
    await erc1271Wallet.waitForDeployment();

    return { deployer, ownerSigner, eoaAgent, registry, router, erc1271Wallet };
  }

  async function registerAgent(registry: any, walletAddress: string) {
    await registry.register(
      walletAddress,
      "TestAgent",
      "Test Agent",
      ["trading", "eip712-signing"],
      "ipfs://agent"
    );
    return (await registry.totalAgents()) - 1n;
  }

  async function submitAndExpectApproved(router: any, intent: any, signature: string) {
    const tx = await router.submitTradeIntent(intent, signature);
    const receipt = await tx.wait();
    const hasApprovedEvent = (receipt.logs ?? []).some((log: any) => {
      try {
        const parsed = router.interface.parseLog(log);
        return parsed?.name === "TradeApproved";
      } catch {
        return false;
      }
    });
    expect(hasApprovedEvent).to.equal(true);
  }

  it("verifies EOA signatures in AgentRegistry", async function () {
    const { eoaAgent, registry } = await deployCore();
    const agentId = await registerAgent(registry, await eoaAgent.getAddress());

    const nonce = await registry.getSigningNonce(agentId);
    const network = await ethers.provider.getNetwork();
    const contentHash = ethers.keccak256(ethers.toUtf8Bytes("checkpoint:1"));

    const signature = await eoaAgent.signTypedData(
      {
        name: "AgentRegistry",
        version: "1",
        chainId: Number(network.chainId),
        verifyingContract: await registry.getAddress(),
      },
      AGENT_MESSAGE_TYPES,
      {
        agentId,
        agentWallet: await eoaAgent.getAddress(),
        nonce,
        contentHash,
      }
    );

    expect(await registry.verifyAgentSignature(agentId, contentHash, signature)).to.equal(true);
  });

  it("verifies ERC-1271 signatures in AgentRegistry", async function () {
    const { ownerSigner, registry, erc1271Wallet } = await deployCore();
    const walletAddress = await erc1271Wallet.getAddress();
    const agentId = await registerAgent(registry, walletAddress);

    const nonce = await registry.getSigningNonce(agentId);
    const network = await ethers.provider.getNetwork();
    const contentHash = ethers.keccak256(ethers.toUtf8Bytes("checkpoint:2"));

    const signature = await ownerSigner.signTypedData(
      {
        name: "AgentRegistry",
        version: "1",
        chainId: Number(network.chainId),
        verifyingContract: await registry.getAddress(),
      },
      AGENT_MESSAGE_TYPES,
      {
        agentId,
        agentWallet: walletAddress,
        nonce,
        contentHash,
      }
    );

    expect(await registry.verifyAgentSignature(agentId, contentHash, signature)).to.equal(true);
  });

  it("approves EOA-signed RiskRouter intents", async function () {
    const { eoaAgent, registry, router } = await deployCore();
    const agentWallet = await eoaAgent.getAddress();
    const agentId = await registerAgent(registry, agentWallet);

    await router.setRiskParams(agentId, 1_000_000n, 2_000, 10);

    const now = Math.floor(Date.now() / 1000);
    const intent = {
      agentId,
      agentWallet,
      pair: "XBTUSD",
      action: "BUY",
      amountUsdScaled: 50_000n,
      maxSlippageBps: 50n,
      nonce: 0n,
      deadline: BigInt(now + 300),
    };

    const network = await ethers.provider.getNetwork();
    const signature = await eoaAgent.signTypedData(
      {
        name: "RiskRouter",
        version: "1",
        chainId: Number(network.chainId),
        verifyingContract: await router.getAddress(),
      },
      TRADE_INTENT_TYPES,
      intent
    );

    const simulation = await router.submitTradeIntent.staticCall(intent, signature);
    expect(simulation[0]).to.equal(true);
    expect(simulation[1]).to.equal("");

    await submitAndExpectApproved(router, intent, signature);
  });

  it("approves ERC-1271-signed RiskRouter intents", async function () {
    const { ownerSigner, registry, router, erc1271Wallet } = await deployCore();
    const agentWallet = await erc1271Wallet.getAddress();
    const agentId = await registerAgent(registry, agentWallet);

    await router.setRiskParams(agentId, 1_000_000n, 2_000, 10);

    const now = Math.floor(Date.now() / 1000);
    const intent = {
      agentId,
      agentWallet,
      pair: "XBTUSD",
      action: "BUY",
      amountUsdScaled: 50_000n,
      maxSlippageBps: 50n,
      nonce: 0n,
      deadline: BigInt(now + 300),
    };

    const network = await ethers.provider.getNetwork();
    const signature = await ownerSigner.signTypedData(
      {
        name: "RiskRouter",
        version: "1",
        chainId: Number(network.chainId),
        verifyingContract: await router.getAddress(),
      },
      TRADE_INTENT_TYPES,
      intent
    );

    const simulation = await router.submitTradeIntent.staticCall(intent, signature);
    expect(simulation[0]).to.equal(true);
    expect(simulation[1]).to.equal("");

    await submitAndExpectApproved(router, intent, signature);
  });
});
