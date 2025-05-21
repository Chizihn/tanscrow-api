import {
  PaymentGateway,
  PaymentStatus,
  TransactionStatus,
  EscrowStatus,
} from "../generated/prisma-client";
import { prisma } from "../config/db.config";
import axios from "axios";
import { PaymentSecurityService } from "./payment-security.service";
import { sendNotification } from "./notification.service";

interface PaymentInitiationResponse {
  success: boolean;
  redirectUrl?: string;
  reference?: string;
  error?: string;
}

export class PaymentService {
  private static instance: PaymentService;
  private readonly paystackSecretKey: string;
  private readonly flutterwaveSecretKey: string;
  private readonly paystackBaseUrl: string = "https://api.paystack.co";
  private readonly flutterwaveBaseUrl: string =
    "https://api.flutterwave.com/v3";
  private readonly securityService: PaymentSecurityService;

  private constructor() {
    this.paystackSecretKey = process.env.PAYSTACK_SECRET_KEY || "";
    this.flutterwaveSecretKey = process.env.FLUTTERWAVE_SECRET_KEY || "";
    this.securityService = PaymentSecurityService.getInstance();
  }

  public static getInstance(): PaymentService {
    if (!PaymentService.instance) {
      PaymentService.instance = new PaymentService();
    }
    return PaymentService.instance;
  }

  async initiatePayment(
    transactionId: string,
    amount: number,
    email: string,
    gateway: PaymentGateway
  ): Promise<PaymentInitiationResponse> {
    try {
      switch (gateway) {
        case PaymentGateway.PAYSTACK:
          return await this.initiatePaystackPayment(
            transactionId,
            amount,
            email
          );
        case PaymentGateway.FLUTTERWAVE:
          return await this.initiateFlutterwavePayment(
            transactionId,
            amount,
            email
          );
        default:
          throw new Error("Unsupported payment gateway");
      }
    } catch (error) {
      console.error(`Payment initiation error:`, error);
      return {
        success: false,
        error: "Failed to initiate payment",
      };
    }
  }

  private async initiatePaystackPayment(
    transactionId: string,
    amount: number,
    email: string
  ): Promise<PaymentInitiationResponse> {
    try {
      if (!this.paystackSecretKey) {
        throw new Error("Paystack secret key not configured");
      }

      const response = await axios.post(
        `${this.paystackBaseUrl}/transaction/initialize`,
        {
          email,
          amount: amount * 100, // Convert to kobo
          reference: `PAY-${transactionId}-${Date.now()}`,
          callback_url: `${process.env.APP_URL}/payment/verify/paystack`,
        },
        {
          headers: {
            Authorization: `Bearer ${this.paystackSecretKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.status) {
        return {
          success: true,
          redirectUrl: response.data.data.authorization_url,
          reference: response.data.data.reference,
        };
      }

      throw new Error("Failed to initialize Paystack payment");
    } catch (error) {
      console.error("Paystack payment initiation error:", error);
      return {
        success: false,
        error: "Failed to initiate Paystack payment",
      };
    }
  }

  private async initiateFlutterwavePayment(
    transactionId: string,
    amount: number,
    email: string
  ): Promise<PaymentInitiationResponse> {
    try {
      if (!this.flutterwaveSecretKey) {
        throw new Error("Flutterwave secret key not configured");
      }

      const response = await axios.post(
        `${this.flutterwaveBaseUrl}/payments`,
        {
          tx_ref: `PAY-${transactionId}-${Date.now()}`,
          amount: amount,
          currency: "NGN",
          redirect_url: `${process.env.APP_URL}/payment/verify/flutterwave`,
          customer: {
            email,
          },
          customizations: {
            title: "Tanscrow Payment",
            description: `Payment for transaction ${transactionId}`,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.flutterwaveSecretKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.status === "success") {
        return {
          success: true,
          redirectUrl: response.data.data.link,
          reference: response.data.data.tx_ref,
        };
      }

      throw new Error("Failed to initialize Flutterwave payment");
    } catch (error) {
      console.error("Flutterwave payment initiation error:", error);
      return {
        success: false,
        error: "Failed to initiate Flutterwave payment",
      };
    }
  }

  async verifyPayment(
    id: string,
    reference: string,
    gateway: PaymentGateway
  ): Promise<boolean> {
    try {
      let verificationResult = false;

      switch (gateway) {
        case PaymentGateway.PAYSTACK:
          verificationResult = await this.verifyPaystackPayment(reference);
          break;
        case PaymentGateway.FLUTTERWAVE:
          verificationResult = await this.verifyFlutterwavePayment(reference);
          break;
        default:
          throw new Error("Unsupported payment gateway");
      }

      if (verificationResult) {
        const payment = await prisma.payment.findFirst({
          where: { id, gatewayReference: reference },
          include: { transactions: { take: 1 } },
        });

        if (!payment || payment.transactions.length === 0) {
          throw new Error("Payment not found or no transactions associated");
        }

        const transaction = payment.transactions[0];

        await prisma.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id },
            data: {
              status: PaymentStatus.SUCCESSFUL,
            },
          });

          await tx.transaction.update({
            where: { id: transaction.id },
            data: {
              status: TransactionStatus.IN_PROGRESS,
              escrowStatus: EscrowStatus.FUNDED,
              isPaid: true,
              logs: {
                create: {
                  action: "PAYMENT_CONFIRMED",
                  status: TransactionStatus.IN_PROGRESS,
                  escrowStatus: EscrowStatus.FUNDED,
                  performedBy: transaction.buyerId,
                  description: `Payment confirmed via ${gateway}`,
                },
              },
            },
          });

          await sendNotification({
            userId: transaction.sellerId,
            title: "Payment Received",
            message: `Payment for transaction ${transaction.transactionCode} has been confirmed`,
            type: "PAYMENT",
            entityId: transaction.id,
            entityType: "Transaction",
          });
        });
      }

      return verificationResult;
    } catch (error) {
      console.error(`Payment verification error:`, error);
      return false;
    }
  }

  async validateWebhookSignature(
    signature: string,
    payload: any,
    gateway: PaymentGateway
  ): Promise<boolean> {
    return this.securityService.verifyWebhookSignature(
      signature,
      payload,
      gateway
    );
  }

  private async verifyPaystackPayment(reference: string): Promise<boolean> {
    try {
      const response = await axios.get(
        `${this.paystackBaseUrl}/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${this.paystackSecretKey}`,
          },
        }
      );

      return response.data.status && response.data.data.status === "success";
    } catch (error) {
      console.error("Paystack payment verification error:", error);
      return false;
    }
  }

  private async verifyFlutterwavePayment(reference: string): Promise<boolean> {
    try {
      const response = await axios.get(
        `${this.flutterwaveBaseUrl}/verify_by_reference?tx_ref=${reference}`,
        {
          headers: {
            Authorization: `Bearer ${this.flutterwaveSecretKey}`,
          },
        }
      );

      return (
        response.data.status === "success" &&
        response.data.data.status === "successful"
      );
    } catch (error) {
      console.error("Flutterwave payment verification error:", error);
      return false;
    }
  }

  async handleFailedPayment(
    id: string,
    reference: string,
    gateway: PaymentGateway
  ): Promise<void> {
    const payment = await prisma.payment.findFirst({
      where: { id, gatewayReference: reference },
      include: { transactions: { take: 1 } },
    });

    if (!payment || payment.transactions.length === 0) {
      throw new Error("Payment not found or no transactions associated");
    }

    const transaction = payment.transactions[0];

    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id },
        data: {
          status: PaymentStatus.FAILED,
        },
      });

      await tx.transaction.update({
        where: { id: transaction.id },
        data: {
          status: TransactionStatus.PENDING,
          escrowStatus: EscrowStatus.NOT_FUNDED,
          logs: {
            create: {
              action: "PAYMENT_FAILED",
              status: TransactionStatus.PENDING,
              escrowStatus: EscrowStatus.NOT_FUNDED,
              performedBy: transaction.buyerId,
              description: `Payment failed via ${gateway}`,
            },
          },
        },
      });

      await sendNotification({
        userId: transaction.buyerId,
        title: "Payment Failed",
        message: `Payment for transaction ${transaction.transactionCode} has failed`,
        type: "PAYMENT",
        entityId: transaction.id,
        entityType: "Transaction",
      });
    });
  }
}
