import { prisma } from "../config/db.config";
import {
  PaymentGateway,
  PaymentStatus,
  TransactionStatus,
  EscrowStatus,
  AuditAction,
} from "../generated/prisma-client";
import { AuditLogService } from "./audit-log.service";
import { PaymentSecurityService } from "./payment-security.service";
import { sendNotification } from "./notification.service";

const auditLog = new AuditLogService(prisma);
const paymentSecurity = PaymentSecurityService.getInstance();

export class PaymentWebhookService {
  async handleWebhook(
    signature: string,
    payload: any,
    gateway: PaymentGateway
  ): Promise<boolean> {
    try {
      if (!(await this.validateWebhook(signature, payload, gateway))) {
        return false;
      }

      const { event, data } = payload;
      if (!data?.reference) {
        await this.logSecurityEvent("Missing payment data or reference");
        return false;
      }

      const payment = await this.getValidPayment(data.reference);
      if (!payment) {
        return false;
      }

      const webhookAmount = Number(data.amount) / 100;
      const expectedAmount = Number(payment.totalAmount);

      if (
        !(await this.validateAmount(
          expectedAmount,
          webhookAmount,
          data.reference
        ))
      ) {
        return false;
      }

      if (payment.status === PaymentStatus.SUCCESSFUL) {
        await this.logSecurityEvent(
          `Duplicate webhook for completed payment: ${data.reference}`
        );
        return false;
      }

      switch (event) {
        case "charge.success":
        case "charge.completed":
          await this.handleSuccessfulPayment(data, gateway);
          break;
        case "charge.failed":
          await this.handleFailedPayment(data, gateway);
          break;
        default:
          await this.logSecurityEvent(`Unhandled event type: ${event}`);
          return false;
      }

      return true;
    } catch (error) {
      console.error(`${gateway} webhook error:`, error);
      await this.logSecurityEvent(
        `${gateway} webhook processing error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return false;
    }
  }

  private async validateWebhook(
    signature: string,
    payload: any,
    gateway: PaymentGateway
  ): Promise<boolean> {
    if (!signature || !payload) {
      await this.logSecurityEvent("Missing webhook signature or payload");
      return false;
    }

    try {
      const valid = paymentSecurity.verifyWebhookSignature(
        signature,
        payload,
        gateway
      );
      if (!valid) {
        await this.logSecurityEvent(`Invalid ${gateway} webhook signature`);
        return false;
      }

      return true;
    } catch (error) {
      await this.logSecurityEvent(
        `Error validating webhook: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return false;
    }
  }

  private async getValidPayment(reference: string) {
    try {
      const payment = await prisma.payment.findFirst({
        where: { gatewayReference: reference },
        include: { transactions: { take: 1 } },
      });

      if (!payment || payment.transactions.length === 0) {
        await this.logSecurityEvent(
          `Payment or transaction not found for reference: ${reference}`
        );
        return null;
      }

      return payment;
    } catch (error) {
      await this.logSecurityEvent(
        `Error fetching payment: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  }

  private async validateAmount(
    expected: number,
    received: number,
    reference: string
  ): Promise<boolean> {
    try {
      const isValid = paymentSecurity.validatePaymentAmount(expected, received);
      if (!isValid) {
        await this.logSecurityEvent(
          `Payment amount mismatch. Expected: ${expected}, Received: ${received} (Reference: ${reference})`
        );
      }
      return isValid;
    } catch (error) {
      await this.logSecurityEvent(
        `Error validating amount: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return false;
    }
  }

  private async handleSuccessfulPayment(
    data: any,
    gateway: PaymentGateway
  ): Promise<void> {
    try {
      const payment = await this.getValidPayment(data.reference);
      if (!payment) return;

      const transaction = payment.transactions[0];

      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.SUCCESSFUL,
            gatewayResponse: data,
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

        // Use the direct notification creation method
        await sendNotification({
          userId: transaction.sellerId,
          title: "Payment Received",
          message: `Payment for transaction ${transaction.transactionCode} has been confirmed`,
          type: "PAYMENT",
          entityId: transaction.id,
          entityType: "Transaction",
        });
      });
    } catch (error) {
      await this.logSecurityEvent(
        `Error processing successful payment: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private async handleFailedPayment(
    data: any,
    gateway: PaymentGateway
  ): Promise<void> {
    try {
      const payment = await this.getValidPayment(data.reference);
      if (!payment) return;

      const transaction = payment.transactions[0];

      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.FAILED,
            gatewayResponse: data,
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

        // Use the direct notification creation method
        await sendNotification({
          userId: transaction.buyerId,
          title: "Payment Failed",
          message: `Payment for transaction ${transaction.transactionCode} has failed`,
          type: "PAYMENT",
          entityId: transaction.id,
          entityType: "Transaction",
        });
      });
    } catch (error) {
      await this.logSecurityEvent(
        `Error processing failed payment: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private async logSecurityEvent(message: string): Promise<void> {
    try {
      await auditLog.logSecurityEvent(
        AuditAction.VERIFY,
        {
          message,
          ipAddress: "webhook",
        },
        undefined // Pass undefined instead of "system"
      );
    } catch (error) {
      console.error("Failed to log security event:", error);
    }
  }
}
