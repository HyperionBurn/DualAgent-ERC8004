import { expect } from "chai";
import axios from "axios";
import { PrismMarketClient } from "../src/exchange/prism";

const axiosAny = axios as any;
const originalAxiosGet = axios.get;

describe("PrismMarketClient", function () {
  beforeEach(function () {
    process.env.PRISM_API_KEY = "prism_sk_test_key";
    process.env.PRISM_FALLBACK_TO_KRAKEN = "false";
    delete process.env.PRISM_CACHE_TTL_MS;
    delete process.env.PRISM_MAX_REQUESTS_PER_MINUTE;
    delete process.env.PRISM_RATE_LIMIT_COOLDOWN_MS;
  });

  afterEach(function () {
    axiosAny.get = originalAxiosGet;
    delete process.env.PRISM_API_KEY;
    delete process.env.PRISM_FALLBACK_TO_KRAKEN;
    delete process.env.PRISM_CACHE_TTL_MS;
    delete process.env.PRISM_MAX_REQUESTS_PER_MINUTE;
    delete process.env.PRISM_RATE_LIMIT_COOLDOWN_MS;
  });

  it("caches repeated ticker lookups within the local TTL", async function () {
    let callCount = 0;

    axiosAny.get = async (url: string) => {
      callCount += 1;
      expect(String(url)).to.include("/crypto/price/BTC");
      return {
        status: 200,
        data: {
          price_usd: 65000,
          volume_24h: 1200,
          change_24h_pct: 2,
        },
        headers: {},
      };
    };

    const client = new PrismMarketClient();
    const first = await client.getTicker("XBTUSD");
    const second = await client.getTicker("XBTUSD");

    expect(first.price).to.equal(65000);
    expect(second.price).to.equal(65000);
    expect(callCount).to.equal(1);
  });

  it("backs off after a Prism rate-limit response", async function () {
    let callCount = 0;

    axiosAny.get = async (url: string) => {
      callCount += 1;
      expect(String(url)).to.include("/crypto/price/BTC");
      return {
        status: 429,
        data: {
          message: "rate limit exceeded",
        },
        headers: {
          "retry-after": "60",
        },
      };
    };

    const client = new PrismMarketClient();

    try {
      await client.getTicker("XBTUSD");
      expect.fail("expected PrismMarketClient to reject the rate-limited response");
    } catch (error) {
      expect(String((error as Error).message)).to.include("rate limit");
    }

    try {
      await client.getTicker("XBTUSD");
      expect.fail("expected PrismMarketClient to stay in cooldown");
    } catch (error) {
      expect(String((error as Error).message)).to.include("temporarily paused");
    }

    expect(callCount).to.equal(1);
  });

  it("forces a fresh price lookup when requested", async function () {
    let callCount = 0;

    axiosAny.get = async (url: string, config: any) => {
      callCount += 1;
      expect(String(url)).to.include("/crypto/price/BTC");
      if (callCount === 2) {
        expect(config?.params).to.have.property("_");
      }
      return {
        status: 200,
        data: {
          price_usd: 65000 + callCount,
          volume_24h: 1200,
          change_24h_pct: 2,
        },
        headers: {},
      };
    };

    const client = new PrismMarketClient();
    const cached = await client.getTicker("XBTUSD");
    const fresh = await client.getTicker("XBTUSD", { forceFresh: true });

    expect(cached.price).to.equal(65001);
    expect(fresh.price).to.equal(65002);
    expect(callCount).to.equal(2);
  });
});
