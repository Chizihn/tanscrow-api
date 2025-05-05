import { Resolver, Mutation, Arg, Ctx } from "type-graphql";
import { prisma } from "../../config/db.config";
import {
  EscrowStatus,
  PaymentStatus,
  TransactionStatus,
} from "../../generated/prisma-client";
import { GraphQLContext } from "../types/context.type";
import { GraphQLJSONObject } from "graphql-type-json";

@Resolver()
export class PaymentWebhookResolver {
  @Mutation(() => Boolean)
  async handlePaystackWebhook(
    @Arg("signature") signature: string,
    @Arg("payload", () => GraphQLJSONObject) payload: any,
    @Ctx() {}: GraphQLContext
  ): Promise<boolean> {
    try {
      // TODO: Implement signature verification

      const event = payload.event;
      const data = payload.data;

      switch (event) {
        case "charge.success":
          await this.handleSuccessfulPayment(data, "PAYSTACK");
          break;
        case "charge.failed":
          await this.handleFailedPayment(data, "PAYSTACK");
          break;
      }

      return true;
    } catch (error) {
      console.error("Paystack webhook error:", error);
      return false;
    }
  }

  @Mutation(() => Boolean)
  async handleFlutterwaveWebhook(
    @Arg("signature") signature: string,
    @Arg("payload", () => GraphQLJSONObject) payload: any,
    @Ctx() {}: GraphQLContext
  ): Promise<boolean> {
    try {
      // TODO: Implement signature verification

      const event = payload.event;
      const data = payload.data;

      switch (event) {
        case "charge.completed":
          await this.handleSuccessfulPayment(data, "FLUTTERWAVE");
          break;
        case "charge.failed":
          await this.handleFailedPayment(data, "FLUTTERWAVE");
          break;
      }

      return true;
    } catch (error) {
      console.error("Flutterwave webhook error:", error);
      return false;
    }
  }

  private async handleSuccessfulPayment(
    data: any,
    gateway: string
  ): Promise<void> {
    const payment = await prisma.payment.findFirst({
      where: { gatewayReference: data.reference },
      include: { transactions: { take: 1 } },
    });

    if (!payment || payment.transactions.length === 0)
      throw new Error("Payment not found or no transactions associated");

    const transaction = payment.transactions[0];

    await prisma.$transaction(async (tx: any) => {
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

      await tx.notification.create({
        data: {
          userId: transaction.sellerId,
          title: "Payment Received",
          message: `Payment for transaction ${transaction.transactionCode} has been confirmed`,
          type: "PAYMENT",
          relatedEntityId: transaction.id,
          relatedEntityType: "Transaction",
        },
      });
    });
  }

  private async handleFailedPayment(data: any, gateway: string): Promise<void> {
    const payment = await prisma.payment.findFirst({
      where: { gatewayReference: data.reference },
      include: { transactions: { take: 1 } },
    });

    if (!payment || payment.transactions.length === 0)
      throw new Error("Payment not found or no transactions associated");

    const transaction = payment.transactions[0];

    await prisma.$transaction(async (tx: any) => {
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

      await tx.notification.create({
        data: {
          userId: transaction.buyerId,
          title: "Payment Failed",
          message: `Payment for transaction ${transaction.transactionCode} has failed`,
          type: "PAYMENT",
          relatedEntityId: transaction.id,
          relatedEntityType: "Transaction",
        },
      });
    });
  }
}
