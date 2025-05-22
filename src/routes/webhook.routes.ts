import { Router, Request, Response, NextFunction } from "express";
import { webhookController } from "../controllers/webhook.controller";

// Custom interface for request with rawBody
interface WebhookRequest extends Request {
  rawBody?: string;
}

const router = Router();

/**
 * Middleware to capture raw request body for signature verification
 * This is critical for webhook signature validation
 */
const captureRawBody = (
  req: WebhookRequest,
  res: Response,
  next: NextFunction
): void => {
  let data = "";

  // Only parse as text for webhook routes to capture raw body
  req.on("data", (chunk: Buffer) => {
    data += chunk.toString();
  });

  req.on("end", () => {
    req.rawBody = data;

    // If content-type is application/json, parse the JSON
    // but still keep the raw body for signature verification
    if (req.headers["content-type"] === "application/json") {
      try {
        const jsonData = JSON.parse(data);
        req.body = jsonData;
      } catch (e) {
        // If parsing fails, don't modify req.body
        console.error("Error parsing JSON body:", e);
      }
    }

    next();
  });
};

// Apply raw body capture middleware to all webhook routes
router.use(captureRawBody);

/**
 * Handle webhooks from payment gateways
 * POST /payment/:gateway
 */
router.post("/payment/:gateway", webhookController.handlePaymentWebhook);

/**
 * Handle payment verifications from callback URLs
 * GET /payment/verify/:gateway
 */
router.get("/payment/verify/:gateway", webhookController.verifyPayment);

export { router as webhookRoutes };
