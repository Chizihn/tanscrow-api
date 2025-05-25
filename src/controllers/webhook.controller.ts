import { Request, Response } from "express";
import { PaymentService } from "../services/payment.service";
import logger from "../utils/logger";
import { PaymentGateway } from "@prisma/client";

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
  verifyPayment: async (req: Request, res: Response): Promise<void> => {
    try {
      const gatewayParam = req.params.gateway.toUpperCase();

      // Validate gateway parameter
      if (gatewayParam !== "PAYSTACK" && gatewayParam !== "FLUTTERWAVE") {
        return res.redirect(
          `${process.env.FRONTEND_URL}/payment/failed?reason=invalid_gateway`
        );
      }

      const gateway = gatewayParam as PaymentGateway;

      // Get reference from query parameters
      const reference =
        gateway === "PAYSTACK"
          ? (req.query.reference as string)
          : (req.query.tx_ref as string);

      if (!reference) {
        return res.redirect(
          `${process.env.FRONTEND_URL}/payment/failed?reason=missing_reference`
        );
      }

      // Verify the payment
      const success = await paymentService.verifyPayment(reference, gateway);

      if (success) {
        return res.redirect(`${process.env.FRONTEND_URL}/payment/success`);
      } else {
        return res.redirect(
          `${process.env.FRONTEND_URL}/payment/failed?reason=verification_failed`
        );
      }
    } catch (error) {
      logger.error("Payment verification error:", error);
      return res.redirect(
        `${process.env.FRONTEND_URL}/payment/failed?reason=server_error`
      );
    }
  },
};
