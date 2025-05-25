import axios from "axios";
import logger from "../utils/logger";

interface Bank {
  id: number;
  name: string;
  code: string;
  active: boolean;
}

interface AccountResolveResponse {
  account_number?: string;
  account_name?: string;
  bank_code?: string;
}

export class BankService {
  private static instance: BankService;
  private readonly paystackSecretKey: string;
  private readonly paystackBaseUrl: string = "https://api.paystack.co";
  private bankListCache: Bank[] | null = null;
  private readonly cacheDuration = 24 * 60 * 60 * 1000; // 24 hours
  private lastCacheTime: number = 0;

  private constructor() {
    this.paystackSecretKey = process.env.PAYSTACK_SECRET_KEY || "";
    if (!this.paystackSecretKey) {
      logger.warn("Paystack secret key not configured");
    }
  }

  public static getInstance(): BankService {
    if (!BankService.instance) {
      BankService.instance = new BankService();
    }
    return BankService.instance;
  }

  private isCacheValid(): boolean {
    return (
      this.bankListCache !== null &&
      Date.now() - this.lastCacheTime < this.cacheDuration
    );
  }

  public async getNigerianBanks(): Promise<Bank[]> {
    try {
      if (this.isCacheValid()) {
        return this.bankListCache!;
      }

      if (!this.paystackSecretKey) {
        throw new Error("Paystack secret key not configured");
      }

      const response = await axios.get<{ data: Bank[] }>(
        `${this.paystackBaseUrl}/bank`,
        {
          headers: {
            Authorization: `Bearer ${this.paystackSecretKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      this.bankListCache = response.data.data;
      this.lastCacheTime = Date.now();

      return this.bankListCache;
    } catch (error) {
      logger.error("Error fetching Nigerian banks:", error);
      throw new Error("Failed to fetch Nigerian banks");
    }
  }

  public async resolveAccountNumber(
    accountNumber: string,
    bankCode: string
  ): Promise<AccountResolveResponse> {
    try {
      if (!this.paystackSecretKey) {
        throw new Error("Paystack secret key not configured");
      }

      const response = await axios.get<{ data: AccountResolveResponse }>(
        `${this.paystackBaseUrl}/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
        {
          headers: {
            Authorization: `Bearer ${this.paystackSecretKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      return response.data.data;
    } catch (error) {
      logger.error("Error resolving account number:", error);
      throw new Error("Failed to resolve account number");
    }
  }
}
