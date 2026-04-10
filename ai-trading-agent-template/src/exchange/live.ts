import { KrakenClient } from "./kraken";
import { MarketData } from "../types/index";

export class LiveMarketClient {
  private readonly kraken: KrakenClient;

  constructor() {
    this.kraken = new KrakenClient();
  }

  async getTicker(pair: string): Promise<MarketData> {
    return this.kraken.getTicker(pair);
  }
}
