import {
  PaymentGateway,
  PaymentStatus,
  TransactionStatus,
  EscrowStatus,
  AuditAction,
  AuditCategory,
} from "../generated/prisma-client";
import { prisma } from "../config/db.config";
import axios from "axios";
import crypto from "crypto";
import { sendNotification } from "./notification.service";
import logger from "../utils/logger";

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
  private readonly flutterwaveSecretHash: string;
  private readonly paystackBaseUrl: string = "https://api.paystack.co";
  private readonly flutterwaveBaseUrl: string =
    "https://api.flutterwave.com/v3";

  private constructor() {
    this.paystackSecretKey = process.env.PAYSTACK_SECRET_KEY || "";
    this.flutterwaveSecretKey = process.env.FLUTTERWAVE_SECRET_KEY || "";
    this.flutterwaveSecretHash = process.env.FLW_SECRET_HASH || "";

    // Validate environment variables
    if (
      !this.paystackSecretKey ||
      !this.flutterwaveSecretKey ||
      !this.flutterwaveSecretHash
    ) {
      logger.warn("Missing payment gateway configuration");
    }
  }

  public static getInstance(): PaymentService {
    if (!PaymentService.instance) {
      PaymentService.instance = new PaymentService();
    }
    return PaymentService.instance;
  }

  /**
   * Initiate a payment through the specified gateway
   */
  async initiatePayment({
    transactionId,
    totalAmount,
    email,
    gateway,
    existingReference = null, // Allow using a pre-generated reference
  }: {
    transactionId: string;
    totalAmount: number;
    email: string;
    gateway: PaymentGateway;
    existingReference?: string | null;
  }): Promise<PaymentInitiationResponse> {
    try {
      console.log(
        `PaymentService: Initiating ${gateway} payment for transaction ${transactionId}`
      );

      // Use existing reference if provided, otherwise generate a new one
      const reference =
        existingReference || this.generatePaymentReference(transactionId);
      console.log(`Using payment reference: ${reference}`);

      // Initialize payment with gateway - no need to create payment record here
      // as it's already created in the processPayment method
      let response: PaymentInitiationResponse;

      switch (gateway) {
        case PaymentGateway.PAYSTACK:
          console.log(
            `Initializing Paystack payment for ${totalAmount} with email ${email}`
          );
          response = await this.initiatePaystackPayment(
            reference,
            totalAmount,
            email
          );
          break;

        case PaymentGateway.FLUTTERWAVE:
          console.log(
            `Initializing Flutterwave payment for ${totalAmount} with email ${email}`
          );
          response = await this.initiateFlutterwavePayment(
            reference,
            totalAmount,
            email
          );
          break;

        default:
          console.error(`Unsupported payment gateway: ${gateway}`);
          throw new Error("Unsupported payment gateway");
      }

      if (!response.success) {
        console.error(
          `Payment gateway initialization failed: ${response.error}`
        );
      } else {
        console.log(
          `Payment gateway initialization successful: ${response.reference}`
        );
      }

      return response;
    } catch (error) {
      console.error(`Payment initiation error:`, error);
      console.error(
        "Error details:",
        error instanceof Error ? error.stack : "No stack trace"
      );

      return {
        success: false,
        error: `Failed to initiate payment: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  /**
   * Process a webhook from a payment gateway
   */
  async processWebhook(
    signature: string,
    payload: any,
    gateway: PaymentGateway,
    rawBody?: string
  ): Promise<boolean> {
    try {
      logger.info(`Processing ${gateway} webhook`);

      // 1. Verify the webhook signature
      const isValid = this.verifyWebhookSignature(
        signature,
        payload,
        gateway,
        rawBody
      );
      if (!isValid) {
        await this.logSecurityEvent(`Invalid ${gateway} webhook signature`);
        return false;
      }

      // 2. Extract event and data from the payload based on gateway format
      let event: string, reference: string, status: string, amount: number;

      if (gateway === PaymentGateway.PAYSTACK) {
        // Paystack payload format: https://paystack.com/docs/payments/webhooks/
        event = payload.event;
        reference = payload.data?.reference;
        status = payload.data?.status;
        amount = (payload.data?.amount || 0) / 100; // Convert from kobo to naira
      } else if (gateway === PaymentGateway.FLUTTERWAVE) {
        // Flutterwave payload format: https://developer.flutterwave.com/docs/webhooks
        const flutterData = payload.data;

        // Log the webhook payload for debugging
        logger.info(
          "Flutterwave webhook payload:",
          JSON.stringify(flutterData, null, 2)
        );

        // Map Flutterwave events to our standard format
        event =
          flutterData?.status === "successful"
            ? "charge.completed"
            : "charge.failed";
        reference = flutterData?.tx_ref;
        status = flutterData?.status; // 'successful', 'failed', etc.

        // Use charged_amount for exact verification
        amount = Number(
          flutterData?.charged_amount || flutterData?.amount || 0
        );
      } else {
        await this.logSecurityEvent(`Unsupported gateway: ${gateway}`);
        return false;
      }

      if (!reference) {
        await this.logSecurityEvent(
          `Missing payment reference in webhook payload`
        );
        return false;
      }

      // 3. Fetch the payment from database
      const payment = await prisma.payment.findFirst({
        where: { gatewayReference: reference },
        include: { transactions: { take: 1 } },
      });

      if (!payment || payment.transactions.length === 0) {
        await this.logSecurityEvent(
          `Payment not found for reference: ${reference}`
        );
        return false;
      }

      // 4. Validate payment amount
      const expectedAmount = Number(payment.totalAmount);
      if (!this.validatePaymentAmount(expectedAmount, amount)) {
        await this.logSecurityEvent(
          `Payment amount mismatch. Expected: ${expectedAmount}, Received: ${amount}`
        );
        return false;
      }

      // 5. Process based on payment status
      if (payment.status === PaymentStatus.SUCCESSFUL) {
        logger.info(`Payment ${reference} already processed`);
        return true;
      }

      const transaction = payment.transactions[0];

      // 6. Handle event based on success/failure
      if (
        event === "charge.success" ||
        event === "charge.completed" ||
        status === "successful" ||
        status === "success"
      ) {
        await this.handleSuccessfulPayment(
          payment.id,
          transaction.id,
          gateway,
          payload
        );
      } else if (event === "charge.failed" || status === "failed") {
        await this.handleFailedPayment(
          payment.id,
          transaction.id,
          gateway,
          payload
        );
      } else {
        logger.info(`Ignored webhook event: ${event}`);
      }

      return true;
    } catch (error) {
      logger.error(`Webhook processing error:`, error);
      await this.logSecurityEvent(
        `Webhook processing error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return false;
    }
  }

  /**
   * Handle successful payment by updating database and sending notifications
   */
  private async handleSuccessfulPayment(
    paymentId: string,
    transactionId: string,
    gateway: PaymentGateway,
    gatewayResponse: any
  ): Promise<void> {
    try {
      const transaction = await prisma.transaction.findUnique({
        where: { id: transactionId },
      });

      if (!transaction) {
        throw new Error(`Transaction not found: ${transactionId}`);
      }

      await prisma.$transaction(async (tx) => {
        // Update payment status
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: PaymentStatus.SUCCESSFUL,
            gatewayResponse,
          },
        });

        // Update transaction status
        await tx.transaction.update({
          where: { id: transactionId },
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

        // Send notification to seller
        await sendNotification({
          userId: transaction.sellerId,
          title: "Payment Received",
          message: `Payment for transaction ${transaction.transactionCode} has been confirmed`,
          type: "PAYMENT",
          entityId: transactionId,
          entityType: "Transaction",
        });
      });

      logger.info(
        `Successfully processed payment for transaction ${transactionId}`
      );
    } catch (error) {
      logger.error(`Error processing successful payment:`, error);
      throw error;
    }
  }

  /**
   * Handle failed payment by updating database and sending notifications
   */
  private async handleFailedPayment(
    paymentId: string,
    transactionId: string,
    gateway: PaymentGateway,
    gatewayResponse: any
  ): Promise<void> {
    try {
      const transaction = await prisma.transaction.findUnique({
        where: { id: transactionId },
      });

      if (!transaction) {
        throw new Error(`Transaction not found: ${transactionId}`);
      }

      await prisma.$transaction(async (tx) => {
        // Update payment status
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: PaymentStatus.FAILED,
            gatewayResponse,
          },
        });

        // Update transaction status
        await tx.transaction.update({
          where: { id: transactionId },
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

        // Send notification to buyer
        await sendNotification({
          userId: transaction.buyerId,
          title: "Payment Failed",
          message: `Payment for transaction ${transaction.transactionCode} has failed`,
          type: "PAYMENT",
          entityId: transactionId,
          entityType: "Transaction",
        });
      });

      logger.info(`Recorded failed payment for transaction ${transactionId}`);
    } catch (error) {
      logger.error(`Error processing failed payment:`, error);
      throw error;
    }
  }

  /**
   * Verify payment received through callback URL
   */
  async verifyPayment(
    reference: string,
    gateway: PaymentGateway
  ): Promise<boolean> {
    try {
      let isSuccessful = false;

      if (gateway === PaymentGateway.PAYSTACK) {
        isSuccessful = await this.verifyPaystackPayment(reference);
      } else if (gateway === PaymentGateway.FLUTTERWAVE) {
        isSuccessful = await this.verifyFlutterwavePayment(reference);
      } else {
        throw new Error("Unsupported payment gateway");
      }

      if (isSuccessful) {
        const payment = await prisma.payment.findFirst({
          where: { gatewayReference: reference },
          include: { transactions: { take: 1 } },
        });

        if (!payment || payment.transactions.length === 0) {
          throw new Error("Payment not found or no transactions associated");
        }

        // Process the successful payment
        const transaction = payment.transactions[0];
        await this.handleSuccessfulPayment(
          payment.id,
          transaction.id,
          gateway,
          { verificationMethod: "callback" }
        );
      }

      return isSuccessful;
    } catch (error) {
      logger.error(`Payment verification error:`, error);
      return false;
    }
  }

  /* UTILITY METHODS */

  /**
   * Initialize Paystack payment and get redirect URL
   */
  private async initiatePaystackPayment(
    reference: string,
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
          reference,
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
          reference,
        };
      }

      throw new Error("Failed to initialize Paystack payment");
    } catch (error) {
      logger.error("Paystack payment initiation error:", error);
      return {
        success: false,
        error: `Failed to initiate Paystack payment: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  /**
   * Initialize Flutterwave payment and get redirect URL
   */
  private async initiateFlutterwavePayment(
    reference: string,
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
          tx_ref: reference,
          amount: amount,
          currency: "NGN",
          redirect_url: `${process.env.APP_URL}/payment/verify/flutterwave`,
          customer: {
            email,
          },
          customizations: {
            title: "Tanscrow Payment",
            description: `Payment for transaction ${reference}`,
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
          reference,
        };
      }

      throw new Error("Failed to initialize Flutterwave payment");
    } catch (error) {
      logger.error("Flutterwave payment initiation error:", error);
      return {
        success: false,
        error: `Failed to initiate Flutterwave payment: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  /**
   * Verify Paystack payment status
   */
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
      logger.error("Paystack payment verification error:", error);
      return false;
    }
  }

  /**
   * Verify Flutterwave payment status
   */
  private async verifyFlutterwavePayment(reference: string): Promise<boolean> {
    try {
      const response = await axios.get(
        `${this.flutterwaveBaseUrl}/transactions/verify_by_reference?tx_ref=${reference}`,
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
      logger.error("Flutterwave payment verification error:");
      return false;
    }
  }

  /**
   * Verify webhook signature based on gateway
   */
  private verifyWebhookSignature(
    signature: string,
    payload: any,
    gateway: PaymentGateway,
    rawBody?: string
  ): boolean {
    try {
      if (!signature) {
        logger.warn(`Missing ${gateway} signature`);
        return false;
      }

      let isValid = false;
      const bodyToHash = rawBody || JSON.stringify(payload);

      if (gateway === PaymentGateway.PAYSTACK) {
        if (!this.paystackSecretKey) {
          throw new Error("Paystack secret key not configured");
        }

        const hash = crypto
          .createHmac("sha512", this.paystackSecretKey)
          .update(bodyToHash)
          .digest("hex");

        isValid = hash === signature;
      } else if (gateway === PaymentGateway.FLUTTERWAVE) {
        if (!this.flutterwaveSecretHash) {
          throw new Error("Flutterwave secret hash not configured");
        }

        // For Flutterwave, compare directly with secret hash
        isValid = this.flutterwaveSecretHash === signature;
      } else {
        throw new Error(`Unsupported payment gateway: ${gateway}`);
      }

      if (!isValid) {
        logger.warn(`Invalid ${gateway} webhook signature`);
      } else {
        logger.info(`Valid ${gateway} webhook signature`);
      }

      return isValid;
    } catch (error) {
      logger.error(`Webhook signature verification error:`, error);
      return false;
    }
  }

  /**
   * Validate that payment amount matches expected amount
   */
  private validatePaymentAmount(
    expectedAmount: number,
    actualAmount: number,
    tolerance: number = 0.01
  ): boolean {
    // Handle zero or undefined amounts
    if (!actualAmount) return false;
    if (expectedAmount === 0 && actualAmount === 0) return true;

    const difference = Math.abs(expectedAmount - actualAmount);
    const percentageDifference = difference / expectedAmount;
    return percentageDifference <= tolerance;
  }

  /**
   * Generate a unique payment reference
   */
  private generatePaymentReference(prefix: string = "PAY"): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000000);
    return `${prefix}-${timestamp}-${random}`;
  }

  /**
   * Log security events for audit trail
   */
  private async logSecurityEvent(message: string): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          action: AuditAction.VERIFY,
          details: { message, ipAddress: "webhook" },
          entityType: "PAYMENT",
          entityId: "system",
          category: AuditCategory.PAYMENT,
        },
      });
    } catch (error) {
      logger.error("Failed to log security event:", error);
    }
  }
}
