import {
  Resolver,
  Query,
  Mutation,
  Arg,
  Ctx,
  ID,
  UseMiddleware,
} from "type-graphql";
import {
  Transaction,
  CreateTransactionInput,
  ProcessPaymentInput,
} from "../types/transaction.type";
import {
  UpdateDeliveryInput,
  ConfirmDeliveryInput,
  ReleaseEscrowInput,
  CancelTransactionInput,
  RequestRefundInput,
} from "../types/transaction.input";
import {
  TransactionStatus,
  EscrowStatus,
  PaymentStatus,
  PaymentCurrency,
} from "../../generated/prisma-client";
import { generateTransactionCode } from "../../utils/transaction";
import { calculateEscrowFee } from "../../utils/fees";
import { GraphQLContext } from "../types/context.type";
import { prisma } from "../../config/db.config";
import { Decimal } from "../../generated/prisma-client/runtime/library";
import { isAuthenticated } from "../middleware/auth.middleware";

@Resolver(Transaction)
export class TransactionResolver {
  @Query(() => [Transaction])
  @UseMiddleware(isAuthenticated)
  async transactions(@Ctx() { user }: GraphQLContext): Promise<Transaction[]> {
    return prisma.transaction.findMany({
      where: {
        OR: [{ buyerId: user?.id }, { sellerId: user?.id }],
      },
      include: {
        buyer: true,
        seller: true,
        payment: true,
        logs: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  @Query(() => Transaction)
  @UseMiddleware(isAuthenticated)
  async transaction(
    @Arg("id", () => ID) id: string,
    @Ctx() { user }: GraphQLContext
  ): Promise<Transaction> {
    const transaction = await prisma.transaction.findUnique({
      where: { id },
      include: {
        buyer: true,
        seller: true,
        payment: true,
        logs: true,
      },
    });

    if (!transaction) {
      throw new Error("Transaction not found");
    }

    if (transaction.buyerId !== user?.id && transaction.sellerId !== user?.id) {
      throw new Error("Not authorized to view this transaction");
    }

    return transaction;
  }

  @Mutation(() => Transaction)
  @UseMiddleware(isAuthenticated)
  async createTransaction(
    @Arg("input") input: CreateTransactionInput,
    @Ctx() { user }: GraphQLContext
  ): Promise<Transaction> {
    const escrowFee = calculateEscrowFee(input.amount.toNumber());

    // Convert escrowFee to Decimal and add to input.amount
    const totalAmount = input.amount.add(new Decimal(escrowFee));

    return prisma.transaction.create({
      data: {
        ...input,
        transactionCode: generateTransactionCode(),
        buyerId: user?.id as string,
        escrowFee,
        totalAmount,
        paymentCurrency: PaymentCurrency.NGN,
        status: TransactionStatus.PENDING,
        escrowStatus: EscrowStatus.NOT_FUNDED,
        logs: {
          create: {
            action: "CREATE",
            status: TransactionStatus.PENDING,
            escrowStatus: EscrowStatus.NOT_FUNDED,
            performedBy: user?.id as string,
            description: "Transaction created",
          },
        },
      },
      include: {
        buyer: true,
        seller: true,
        payment: true,
        logs: true,
      },
    });
  }

  @Mutation(() => Transaction)
  @UseMiddleware(isAuthenticated)
  async processPayment(
    @Arg("input") input: ProcessPaymentInput,
    @Ctx() { user }: GraphQLContext
  ): Promise<Transaction> {
    const transaction = await prisma.transaction.findUnique({
      where: { id: input.transactionId },
      include: { payment: true },
    });

    if (!transaction) throw new Error("Transaction not found");
    if (transaction.buyerId !== user?.id)
      throw new Error("Only the buyer can process payment");
    if (transaction.isPaid) throw new Error("Transaction is already paid");

    const payment = await prisma.payment.create({
      data: {
        amount: transaction.amount,
        fee: transaction.escrowFee,
        totalAmount: transaction.totalAmount,
        paymentCurrency: transaction.paymentCurrency,
        paymentGateway: input.paymentGateway,
        gatewayReference: input.gatewayReference,
        status: PaymentStatus.PENDING,
      },
    });

    return prisma.transaction.update({
      where: { id: input.transactionId },
      data: {
        paymentId: payment.id,
        isPaid: true,
        status: TransactionStatus.IN_PROGRESS,
        escrowStatus: EscrowStatus.FUNDED,
        logs: {
          create: {
            action: "PAYMENT",
            status: TransactionStatus.IN_PROGRESS,
            escrowStatus: EscrowStatus.FUNDED,
            performedBy: user?.id,
            description: "Payment processed",
          },
        },
      },
      include: {
        buyer: true,
        seller: true,
        payment: true,
        logs: true,
      },
    });
  }

  @Mutation(() => Transaction)
  @UseMiddleware(isAuthenticated)
  async updateDelivery(
    @Arg("input") input: UpdateDeliveryInput,
    @Ctx() { user }: GraphQLContext
  ): Promise<Transaction> {
    const transaction = await prisma.transaction.findUnique({
      where: { id: input.transactionId },
    });

    if (!transaction) throw new Error("Transaction not found");
    if (transaction.sellerId !== user?.id)
      throw new Error("Only the seller can update delivery information");
    if (transaction.status !== TransactionStatus.IN_PROGRESS) {
      throw new Error("Transaction must be in progress to update delivery");
    }

    return prisma.transaction.update({
      where: { id: input.transactionId },
      data: {
        deliveryMethod: input.deliveryMethod,
        trackingInfo: input.trackingInfo,
        expectedDeliveryDate: input.expectedDeliveryDate,
        logs: {
          create: {
            action: "DELIVERY_UPDATE",
            status: transaction.status,
            escrowStatus: transaction.escrowStatus,
            performedBy: user?.id,
            description: "Delivery information updated",
          },
        },
      },
      include: {
        buyer: true,
        seller: true,
        payment: true,
        logs: true,
      },
    });
  }

  @Mutation(() => Transaction)
  @UseMiddleware(isAuthenticated)
  async confirmDelivery(
    @Arg("input") input: ConfirmDeliveryInput,
    @Ctx() { user }: GraphQLContext
  ): Promise<Transaction> {
    const transaction = await prisma.transaction.findUnique({
      where: { id: input.transactionId },
    });

    if (!transaction) throw new Error("Transaction not found");
    if (transaction.buyerId !== user?.id)
      throw new Error("Only the buyer can confirm delivery");
    if (transaction.status !== TransactionStatus.IN_PROGRESS) {
      throw new Error("Transaction must be in progress to confirm delivery");
    }

    return prisma.transaction.update({
      where: { id: input.transactionId },
      data: {
        status: TransactionStatus.DELIVERED,
        actualDeliveryDate: new Date(),
        logs: {
          create: {
            action: "DELIVERY_CONFIRMED",
            status: TransactionStatus.DELIVERED,
            escrowStatus: transaction.escrowStatus,
            performedBy: user?.id,
            description: "Delivery confirmed by buyer",
          },
        },
      },
      include: {
        buyer: true,
        seller: true,
        payment: true,
        logs: true,
      },
    });
  }

  @Mutation(() => Transaction)
  @UseMiddleware(isAuthenticated)
  async releaseEscrow(
    @Arg("input") input: ReleaseEscrowInput,
    @Ctx() { user }: GraphQLContext
  ): Promise<Transaction> {
    const transaction = await prisma.transaction.findUnique({
      where: { id: input.transactionId },
    });

    if (!transaction) throw new Error("Transaction not found");
    if (transaction.buyerId !== user?.id)
      throw new Error("Only the buyer can release escrow");
    if (transaction.status !== TransactionStatus.DELIVERED)
      throw new Error("Transaction must be delivered to release escrow");
    if (transaction.escrowStatus !== EscrowStatus.FUNDED)
      throw new Error("Escrow must be funded to release");

    return prisma.transaction.update({
      where: { id: input.transactionId },
      data: {
        status: TransactionStatus.COMPLETED,
        escrowStatus: EscrowStatus.RELEASED,
        completedAt: new Date(),
        logs: {
          create: {
            action: "ESCROW_RELEASED",
            status: TransactionStatus.COMPLETED,
            escrowStatus: EscrowStatus.RELEASED,
            performedBy: user?.id,
            description: "Escrow released by buyer",
          },
        },
      },
      include: {
        buyer: true,
        seller: true,
        payment: true,
        logs: true,
      },
    });
  }

  @Mutation(() => Transaction)
  @UseMiddleware(isAuthenticated)
  async cancelTransaction(
    @Arg("input") input: CancelTransactionInput,
    @Ctx() { user }: GraphQLContext
  ): Promise<Transaction> {
    const transaction = await prisma.transaction.findUnique({
      where: { id: input.transactionId },
    });

    if (!transaction) throw new Error("Transaction not found");
    if (transaction.buyerId !== user?.id && transaction.sellerId !== user?.id) {
      throw new Error("Only the buyer or seller can cancel the transaction");
    }

    if (
      transaction.status === TransactionStatus.COMPLETED ||
      transaction.status === TransactionStatus.CANCELED
    ) {
      throw new Error(
        "Cannot cancel a completed or already canceled transaction"
      );
    }

    return prisma.transaction.update({
      where: { id: input.transactionId },
      data: {
        status: TransactionStatus.CANCELED,
        canceledAt: new Date(),
        logs: {
          create: {
            action: "CANCELED",
            status: TransactionStatus.CANCELED,
            escrowStatus: transaction.escrowStatus,
            performedBy: user?.id,
            description: `Transaction canceled: ${input.reason}`,
          },
        },
      },
      include: {
        buyer: true,
        seller: true,
        payment: true,
        logs: true,
      },
    });
  }

  @Mutation(() => Transaction)
  @UseMiddleware(isAuthenticated)
  async requestRefund(
    @Arg("input") input: RequestRefundInput,
    @Ctx() { user }: GraphQLContext
  ): Promise<Transaction> {
    const transaction = await prisma.transaction.findUnique({
      where: { id: input.transactionId },
    });

    if (!transaction) throw new Error("Transaction not found");
    if (transaction.buyerId !== user?.id)
      throw new Error("Only the buyer can request a refund");
    if (!transaction.isPaid)
      throw new Error("Cannot request refund for unpaid transaction");
    if (
      transaction.status === TransactionStatus.COMPLETED ||
      transaction.status === TransactionStatus.REFUNDED
    ) {
      throw new Error(
        "Cannot request refund for completed or already refunded transaction"
      );
    }

    return prisma.transaction.update({
      where: { id: input.transactionId },
      data: {
        status: TransactionStatus.REFUND_REQUESTED,
        logs: {
          create: {
            action: "REFUND_REQUESTED",
            status: TransactionStatus.REFUND_REQUESTED,
            escrowStatus: transaction.escrowStatus,
            performedBy: user?.id,
            description: `Refund requested: ${input.reason}`,
          },
        },
      },
      include: {
        buyer: true,
        seller: true,
        payment: true,
        logs: true,
      },
    });
  }
}
