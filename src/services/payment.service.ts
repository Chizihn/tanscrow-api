// payment.service.ts
import {
  PrismaClient,
  PaymentGateway,
  PaymentStatus,
  TransactionStatus,
  EscrowStatus,
  AuditAction,
  AuditCategory,
  WalletTransactionStatus,
} from "@prisma/client";
import { prisma } from "../config/db.config";
import axios from "axios";
import crypto from "crypto";
import { sendNotification } from "./notification.service";
import logger from "../utils/logger";
import {
  TransferRecipient,
  TransferResponse,
} from "../graphql/types/payment.type";
import config from "../config/app.config";

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

  private readonly paystackTransferEndpoint = "/transfer";
  private readonly paystackRecipientEndpoint = "/transferrecipient";

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

  /**
   * Initiate a transfer to a bank account
   */
  async initiateTransfer({
    amount,
    recipient,
    reference,
  }: {
    amount: number;
    recipient: TransferRecipient;
    reference: string;
  }): Promise<TransferResponse> {
    try {
      logger.info(
        `Initiating transfer of ${amount} to ${recipient.accountNumber}`
      );

      // First create a transfer recipient
      const recipientResponse = await axios.post(
        `${this.paystackBaseUrl}${this.paystackRecipientEndpoint}`,
        {
          type: "nuban",
          name: recipient.accountName,
          account_number: recipient.accountNumber,
          bank_code: recipient.bankCode,
          currency: "NGN",
        },
        {
          headers: {
            Authorization: `Bearer ${this.paystackSecretKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!recipientResponse.data.status) {
        logger.error(
          "Failed to create transfer recipient:",
          recipientResponse.data
        );
        return {
          success: false,
          error: "Failed to create transfer recipient",
        };
      }

      const recipientCode = recipientResponse.data.data.recipient_code;

      // Initiate the transfer
      const transferResponse = await axios.post(
        `${this.paystackBaseUrl}${this.paystackTransferEndpoint}`,
        {
          source: "balance",
          amount: amount * 100, // Convert to kobo
          recipient: recipientCode,
          reason: `Withdrawal - ${reference}`,
          reference,
        },
        {
          headers: {
            Authorization: `Bearer ${this.paystackSecretKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!transferResponse.data.status) {
        logger.error("Failed to initiate transfer:", transferResponse.data);
        return {
          success: false,
          error: transferResponse.data.message || "Failed to initiate transfer",
        };
      }

      return {
        success: true,
        transferCode: transferResponse.data.data.transfer_code,
        reference: transferResponse.data.data.reference,
      };
    } catch (error) {
      logger.error("Transfer initiation error:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to initiate transfer",
      };
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
    existingReference = null,
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

      // Initialize payment with gateway
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
        event = payload.event;
        reference = payload.data?.reference;
        status = payload.data?.status;
        amount = (payload.data?.amount || 0) / 100; // Convert from kobo to naira
      } else if (gateway === PaymentGateway.FLUTTERWAVE) {
        const flutterData = payload.data;

        logger.info(
          "Flutterwave webhook payload:",
          JSON.stringify(flutterData, null, 2)
        );

        event =
          flutterData?.status === "successful"
            ? "charge.completed"
            : "charge.failed";
        reference = flutterData?.tx_ref;
        status = flutterData?.status;
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

      // 3. Fetch the payment from database with all related data
      const payment = await prisma.payment.findFirst({
        where: { gatewayReference: reference },
        include: {
          transactions: { take: 1 },
          walletTransactions: { take: 1 },
        },
      });

      if (!payment) {
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

      // 5. Check if payment is already processed
      if (payment.status === PaymentStatus.SUCCESSFUL) {
        logger.info(`Payment ${reference} already processed`);
        return true;
      }

      // 6. Determine payment type and handle accordingly
      const isWalletFunding = payment.walletTransactions.length > 0;
      const isTransactionPayment = payment.transactions.length > 0;

      // 7. Handle event based on success/failure
      if (
        event === "charge.success" ||
        event === "charge.completed" ||
        status === "successful" ||
        status === "success"
      ) {
        if (isWalletFunding) {
          await this.handleSuccessfulWalletFunding(
            payment.id,
            gateway,
            payload
          );
        } else if (isTransactionPayment) {
          const transaction = payment.transactions[0];
          await this.handleSuccessfulTransactionPayment(
            payment.id,
            transaction.id,
            gateway,
            payload
          );
        } else {
          logger.warn(
            `Payment ${reference} has no associated transaction or wallet funding`
          );
        }
      } else if (event === "charge.failed" || status === "failed") {
        if (isWalletFunding) {
          await this.handleFailedWalletFunding(payment.id, gateway, payload);
        } else if (isTransactionPayment) {
          const transaction = payment.transactions[0];
          await this.handleFailedTransactionPayment(
            payment.id,
            transaction.id,
            gateway,
            payload
          );
        }
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
   * Handle successful transaction payment (existing logic)
   */
  private async handleSuccessfulTransactionPayment(
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
        `Successfully processed transaction payment for transaction ${transactionId}`
      );
    } catch (error) {
      logger.error(`Error processing successful transaction payment:`, error);
      throw error;
    }
  }

  /**
   * Handle failed transaction payment (existing logic)
   */
  private async handleFailedTransactionPayment(
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

      logger.info(
        `Recorded failed transaction payment for transaction ${transactionId}`
      );
    } catch (error) {
      logger.error(`Error processing failed transaction payment:`, error);
      throw error;
    }
  }

  /**
   * Handle successful wallet funding (NEW)
   */
  private async handleSuccessfulWalletFunding(
    paymentId: string,
    gateway: PaymentGateway,
    gatewayResponse: any
  ): Promise<void> {
    try {
      // Find the payment and associated wallet transaction
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: {
          walletTransactions: {
            where: { status: WalletTransactionStatus.PENDING },
            include: { wallet: { include: { user: true } } },
          },
        },
      });

      if (!payment || payment.walletTransactions.length === 0) {
        throw new Error("Payment or wallet transaction not found");
      }

      const walletTransaction = payment.walletTransactions[0];
      const wallet = walletTransaction.wallet;

      // Update wallet balance and transaction status
      await prisma.$transaction(async (tx) => {
        // Update wallet balance
        const newBalance = wallet.balance.plus(walletTransaction.amount);

        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: newBalance },
        });

        // Update wallet transaction status
        await tx.walletTransaction.update({
          where: { id: walletTransaction.id },
          data: {
            status: WalletTransactionStatus.COMPLETED,
            balanceAfter: newBalance,
          },
        });

        // Update payment status
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: PaymentStatus.SUCCESSFUL,
            gatewayResponse,
          },
        });

        // Send notification to user
        await sendNotification({
          userId: wallet.userId,
          title: "Wallet Funded",
          message: `Your wallet has been successfully funded with ${walletTransaction.amount} ${walletTransaction.currency}`,
          type: "PAYMENT",
          entityId: walletTransaction.id,
          entityType: "WalletTransaction",
        });
      });

      logger.info(
        `Successfully processed wallet funding for payment ${paymentId}`
      );
    } catch (error) {
      logger.error("Error processing successful wallet funding:", error);
      throw error;
    }
  }

  /**
   * Handle failed wallet funding (NEW)
   */
  private async handleFailedWalletFunding(
    paymentId: string,
    gateway: PaymentGateway,
    gatewayResponse: any
  ): Promise<void> {
    try {
      // Find the payment and associated wallet transaction
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: {
          walletTransactions: {
            where: { status: WalletTransactionStatus.PENDING },
            include: { wallet: { include: { user: true } } },
          },
        },
      });

      if (!payment || payment.walletTransactions.length === 0) {
        throw new Error("Payment or wallet transaction not found");
      }

      const walletTransaction = payment.walletTransactions[0];
      const wallet = walletTransaction.wallet;

      // Update transaction and payment status
      await prisma.$transaction(async (tx) => {
        // Mark wallet transaction as failed
        await tx.walletTransaction.update({
          where: { id: walletTransaction.id },
          data: {
            status: WalletTransactionStatus.FAILED,
          },
        });

        // Update payment status
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: PaymentStatus.FAILED,
            gatewayResponse,
          },
        });

        // Send notification to user
        await sendNotification({
          userId: wallet.userId,
          title: "Wallet Funding Failed",
          message: `Your wallet funding of ${walletTransaction.amount} ${walletTransaction.currency} has failed. Please try again.`,
          type: "PAYMENT",
          entityId: walletTransaction.id,
          entityType: "WalletTransaction",
        });
      });

      logger.info(`Recorded failed wallet funding for payment ${paymentId}`);
    } catch (error) {
      logger.error("Error handling failed wallet funding:", error);
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
          include: {
            transactions: { take: 1 },
            walletTransactions: { take: 1 },
          },
        });

        if (!payment) {
          throw new Error("Payment not found");
        }

        // Handle verification based on payment type
        const isWalletFunding = payment.walletTransactions.length > 0;
        const isTransactionPayment = payment.transactions.length > 0;

        if (isWalletFunding) {
          await this.handleSuccessfulWalletFunding(payment.id, gateway, {
            verificationMethod: "callback",
          });
        } else if (isTransactionPayment) {
          const transaction = payment.transactions[0];
          await this.handleSuccessfulTransactionPayment(
            payment.id,
            transaction.id,
            gateway,
            { verificationMethod: "callback" }
          );
        }
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
          callback_url: `${config.APP_URL}/payment/verify/paystack`,
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
          redirect_url: `${config.APP_URL}/payment/verify/flutterwave`,
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
