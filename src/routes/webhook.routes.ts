import { Router } from "express";
import crypto from "crypto";
import { PaymentGateway } from "../generated/prisma-client";
import { PaymentWebhookService } from "../services/payment-webhook.service";
import logger from "../utils/logger";

const router = Router();
const webhookService = new PaymentWebhookService();

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
const FLUTTERWAVE_SECRET_HASH = process.env.FLW_SECRET_HASH || "";

// POST /webhooks/payment/:gateway
router.post("/payment/:gateway", async (req, res) => {
  try {
    const gateway = req.params.gateway.toUpperCase() as PaymentGateway;

    logger.info(`Webhook request received for gateway: ${gateway}`);
    logger.info(`Headers: ${JSON.stringify(req.headers)}`);

    const rawBody = (req as any).rawBody;
    const signatureHeaders = req.headers;
    let signature: string | undefined;

    let verified = false;

    if (gateway === "PAYSTACK") {
      signature = signatureHeaders["x-paystack-signature"] as string;
      if (!signature) {
        logger.warn("Missing Paystack signature");
        return res
          .status(400)
          .json({ status: "error", message: "Missing signature" });
      }

      const computedHash = crypto
        .createHmac("sha512", PAYSTACK_SECRET_KEY)
        .update(rawBody)
        .digest("hex");

      verified = computedHash === signature;
    } else if (gateway === "FLUTTERWAVE") {
      signature =
        (signatureHeaders["verif-hash"] as string) ||
        (signatureHeaders["x-flw-signature"] as string) ||
        (signatureHeaders["flutterwave-signature"] as string);

      if (!signature) {
        logger.warn("Missing Flutterwave signature");
        return res
          .status(400)
          .json({ status: "error", message: "Missing signature" });
      }

      const computedHash = crypto
        .createHmac("sha256", FLUTTERWAVE_SECRET_HASH)
        .update(rawBody)
        .digest("hex");

      verified = computedHash === signature;
    } else {
      logger.warn(`Unsupported gateway: ${gateway}`);
      return res
        .status(400)
        .json({ status: "error", message: "Unsupported gateway" });
    }

    if (!verified) {
      logger.error(`Invalid signature for ${gateway}`);
      return res
        .status(400)
        .json({ status: "error", message: "Invalid signature" });
    }

    logger.info(`Signature verified for ${gateway}`);
    const payload = req.body;

    const success = await webhookService.handleWebhook(
      signature,
      payload,
      gateway
    );

    if (!success) {
      return res
        .status(400)
        .json({ status: "error", message: "Webhook processing failed" });
    }

    logger.info(`Webhook processed successfully for ${gateway}`);
    return res
      .status(200)
      .json({ status: "success", message: "Webhook processed successfully" });
  } catch (error) {
    logger.error("Webhook processing error:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Internal server error" });
  }
});

export { router as webhookRoutes };
