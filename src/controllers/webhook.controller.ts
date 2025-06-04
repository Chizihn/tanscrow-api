import { Request, Response } from "express";
import { PaymentService } from "../services/payment.service";
import logger from "../utils/logger";
import { PaymentGateway } from "@prisma/client";
import { prisma } from "../config/db.config";

// Custom interface for request with rawBody
interface WebhookRequest extends Request {
  rawBody?: string;
}

const paymentService = PaymentService.getInstance();

export const webhookController = {
  /**
   * Handle payment gateway webhooks
   * @param req - Express request with rawBody
   * @param res - Express response
   */
  handlePaymentWebhook: async (
    req: WebhookRequest,
    res: Response
  ): Promise<Response> => {
    try {
      const gatewayParam = req.params.gateway.toUpperCase();

      // Validate gateway parameter
      if (gatewayParam !== "PAYSTACK" && gatewayParam !== "FLUTTERWAVE") {
        logger.warn(`Unsupported gateway: ${gatewayParam}`);
        return res
          .status(400)
          .json({ status: "error", message: "Unsupported payment gateway" });
      }

      const gateway = gatewayParam as PaymentGateway;
      logger.info(`Webhook request received for gateway: ${gateway}`);

      // Get appropriate signature from headers based on gateway
      let signature = "";

      if (gateway === "PAYSTACK") {
        signature = req.headers["x-paystack-signature"] as string;
      } else if (gateway === "FLUTTERWAVE") {
        // For Flutterwave, we only use the verif-hash header
        signature = req.headers["verif-hash"] as string;

        // Log the received signature for debugging
        logger.info(`Received Flutterwave signature: ${signature}`);
        logger.info(
          `Expected Flutterwave hash: ${process.env.FLW_SECRET_HASH}`
        );
      }

      if (!signature) {
        logger.warn(`Missing ${gateway} signature`);
        return res
          .status(400)
          .json({ status: "error", message: "Missing signature header" });
      }

      // Process the webhook
      const rawBody = req.rawBody;
      const payload = req.body;

      const success = await paymentService.processWebhook(
        signature,
        payload,
        gateway,
        rawBody
      );

      if (!success) {
        logger.warn(`Webhook processing failed for ${gateway}`);
        return res
          .status(200) // Return 200 even for failures to prevent retries
          .json({ status: "error", message: "Webhook processing failed" });
      }

      logger.info(`Webhook processed successfully for ${gateway}`);
      return res
        .status(200)
        .json({ status: "success", message: "Webhook processed successfully" });
    } catch (error) {
      // Log error but still return 200 to prevent retries
      logger.error("Webhook processing error:", error);
      return res.status(200).json({
        status: "error",
        message: `Internal server error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  },

  /**
   * Handle payment verifications from callback URLs
   * @param req - Express request
   * @param res - Express response
   */
  verifyPayment: async (req: Request, res: Response): Promise<Response> => {
    try {
      const gatewayParam = req.params.gateway.toUpperCase();

      // Validate gateway parameter
      if (gatewayParam !== "PAYSTACK" && gatewayParam !== "FLUTTERWAVE") {
        return res.status(400).json({
          success: false,
          message:
            "Invalid payment gateway. Supported gateways: PAYSTACK, FLUTTERWAVE",
        });
      }

      const gateway = gatewayParam as PaymentGateway;

      // Get reference from query parameters
      const reference =
        gateway === "PAYSTACK"
          ? (req.query.reference as string)
          : (req.query.tx_ref as string);

      if (!reference) {
        return res.status(400).json({
          success: false,
          message: "Payment reference is required",
        });
      }

      // Verify the payment (returns boolean)
      const isVerified = await paymentService.verifyPayment(reference, gateway);

      if (isVerified) {
        // Since verification was successful, get payment details from database
        const payment = await prisma.payment.findFirst({
          where: { gatewayReference: reference },
          include: {
            transactions: { take: 1 },
            walletTransactions: { take: 1 },
          },
        });

        if (!payment) {
          return res.status(404).json({
            success: false,
            message: "Payment record not found in database",
          });
        }

        // Get additional details from gateway if needed
        let gatewayDetails = null;
        try {
          if (gateway === "PAYSTACK") {
            gatewayDetails = await webhookController.getPaystackTransactionDetails(
              reference
            );
          } else if (gateway === "FLUTTERWAVE") {
            gatewayDetails = await webhookController.getFlutterwaveTransactionDetails(
              reference
            );
          }
        } catch (error) {
          logger.warn("Failed to fetch gateway details:", error);
        }

        return res.json({
          success: true,
          message: "Payment verified successfully",
          data: {
            reference: reference,
            amount: gatewayDetails?.amount || (payment!.amount!.toNumber() ?? 0),
            currency: gatewayDetails?.currency || (payment!.paymentCurrency ?? "NGN"),
            status: "success",
            gateway: gateway.toLowerCase(),
          },
        });
      } else {
        return res.status(400).json({
          success: false,
          message: "Payment verification failed",
          data: {
            reference: reference,
            gateway: gateway.toLowerCase(),
          },
        });
      }
    } catch (error) {
      logger.error("Payment verification error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error during payment verification",
      });
    }
  },

  // Helper methods to get transaction details from gateways
  async getPaystackTransactionDetails(reference: string) {
    try {
      const response = await fetch(
        `https://api.paystack.co/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();
      if (data.status && data.data) {
        return {
          amount: data.data.amount / 100, // Convert from kobo
          currency: data.data.currency,
          status: data.data.status,
        };
      }
      return null;
    } catch (error) {
      logger.warn("Failed to get Paystack details:", error);
      return null;
    }
  },

  async getFlutterwaveTransactionDetails(reference: string) {
    try {
      const response = await fetch(
        `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${reference}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();
      if (data.status === "success" && data.data) {
        return {
          amount: data.data.amount,
          currency: data.data.currency,
          status: data.data.status,
        };
      }
      return null;
    } catch (error) {
      logger.warn("Failed to get Flutterwave details:", error);
      return null;
    }
  },
};
