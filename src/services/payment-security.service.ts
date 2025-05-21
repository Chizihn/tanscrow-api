import crypto from "crypto";
import { PaymentGateway } from "../generated/prisma-client";

export class PaymentSecurityService {
  private static instance: PaymentSecurityService;
  private readonly paystackSecretKey: string;
  private readonly flutterwaveSecretKey: string;

  private constructor() {
    this.paystackSecretKey = process.env.PAYSTACK_SECRET_KEY || "";
    this.flutterwaveSecretKey = process.env.FLUTTERWAVE_SECRET_KEY || "";
  }

  public static getInstance(): PaymentSecurityService {
    if (!PaymentSecurityService.instance) {
      PaymentSecurityService.instance = new PaymentSecurityService();
    }
    return PaymentSecurityService.instance;
  }

  /**
   * Verify webhook signature based on payment gateway
   */
  public verifyWebhookSignature(
    signature: string,
    payload: any,
    gateway: PaymentGateway
  ): boolean {
    switch (gateway) {
      case PaymentGateway.PAYSTACK:
        return this.verifyPaystackSignature(signature, payload);
      case PaymentGateway.FLUTTERWAVE:
        return this.verifyFlutterwaveSignature(signature, payload);
      default:
        throw new Error(`Unsupported payment gateway: ${gateway}`);
    }
  }

  /**
   * Verify Paystack webhook signature
   * @see https://paystack.com/docs/payments/webhooks#validating-webhooks
   */
  private verifyPaystackSignature(signature: string, payload: any): boolean {
    if (!this.paystackSecretKey) {
      throw new Error("Paystack secret key not configured");
    }

    const hash = crypto
      .createHmac("sha512", this.paystackSecretKey)
      .update(JSON.stringify(payload))
      .digest("hex");

    return hash === signature;
  }

  /**
   * Verify Flutterwave webhook signature
   * @see https://developer.flutterwave.com/docs/integration-guides/webhooks
   */
  private verifyFlutterwaveSignature(signature: string, payload: any): boolean {
    if (!this.flutterwaveSecretKey) {
      throw new Error("Flutterwave secret key not configured");
    }

    const hash = crypto
      .createHmac("sha512", this.flutterwaveSecretKey)
      .update(JSON.stringify(payload))
      .digest("hex");

    return hash === signature;
  }

  /**
   * Validate payment amount to prevent tampering
   */
  public validatePaymentAmount(
    expectedAmount: number,
    actualAmount: number,
    tolerance: number = 0.01
  ): boolean {
    const difference = Math.abs(expectedAmount - actualAmount);
    const percentageDifference = difference / expectedAmount;
    return percentageDifference <= tolerance;
  }

  /**
   * Generate a unique payment reference
   */
  public generatePaymentReference(prefix: string = "PAY"): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000000);
    return `${prefix}-${timestamp}-${random}`;
  }
}
