import * as fs from "fs";
import * as path from "path";
import { KrakenOrder, KrakenOrderResult, TradeFill } from "../types/index";

export interface PaperBrokerOptions {
  fillsFile?: string;
}

export class PaperExchangeClient {
  private readonly fillsFile: string;

  constructor(options: PaperBrokerOptions = {}) {
    this.fillsFile = options.fillsFile || path.join(process.cwd(), "fills.jsonl");
  }

  async placeOrder(order: KrakenOrder): Promise<KrakenOrderResult> {
    const txid = `PAPER-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
    return {
      txid: [txid],
      descr: {
        order: `${order.type} ${order.volume} ${order.pair} @ ${order.ordertype}${order.price ? ` ${order.price}` : ""}`,
      },
    };
  }

  recordFill(fill: TradeFill): void {
    fs.appendFileSync(this.fillsFile, JSON.stringify(fill) + "\n");
  }
}
