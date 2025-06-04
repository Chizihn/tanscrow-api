import {
  Resolver,
  Query,
  Mutation,
  Arg,
  Ctx,
  ID,
  UseMiddleware,
} from "type-graphql";
import { Transaction, CreateTransactionInput } from "../types/transaction.type";
import {
  UpdateDeliveryInput,
  ReleaseEscrowInput,
  CancelTransactionInput,
  RequestRefundInput,
} from "../types/transaction.input";
import {
  TransactionStatus,
  EscrowStatus,
  PaymentCurrency,
  WalletTransactionType,
  WalletTransactionStatus,
} from "@prisma/client";
import { generateTransactionCode } from "../../utils/transaction";
import { calculateEscrowFee } from "../../utils/fees";
import { GraphQLContext } from "../types/context.type";
import { prisma } from "../../config/db.config";

import { isAuthenticated } from "../middleware/auth.middleware";
import {
  sendEmail,
  sendNotification,
} from "../../services/notification.service";
import logger from "../../utils/logger";
import { Decimal } from "@prisma/client/runtime/library";

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

  // @Mutation(() => Transaction)
  // @UseMiddleware(isAuthenticated)
  // async createTransaction(
  //   @Arg("input") input: CreateTransactionInput,
  //   @Ctx() { user }: GraphQLContext
  // ): Promise<Transaction> {
  //   if (input.buyerId === input.sellerId) {
  //     throw new Error("You cannot create a transaction with yourself!");
  //   }

  //   //Calculate escrow fee
  //   const escrowFee = calculateEscrowFee(input.amount);
  //   // Convert escrowFee to Decimal and add to input.amount
  //   const totalAmount = new Decimal(input.amount).add(escrowFee);

  //   const transaction = prisma.transaction.create({
  //     data: {
  //       ...input,
  //       transactionCode: generateTransactionCode(),
  //       // buyerId: user?.id as string,
  //       escrowFee,
  //       totalAmount,
  //       paymentCurrency: PaymentCurrency.NGN,
  //       status: TransactionStatus.PENDING,
  //       escrowStatus: EscrowStatus.NOT_FUNDED,
  //       logs: {
  //         create: {
  //           action: "CREATE",
  //           status: TransactionStatus.PENDING,
  //           escrowStatus: EscrowStatus.NOT_FUNDED,
  //           performedBy: input.buyerId as string,
  //           description: "Transaction created",
  //         },
  //       },
  //     },
  //     include: {
  //       buyer: true,
  //       seller: true,
  //       payment: true,
  //       logs: true,
  //     },
  //   });

  //   await sendNotification({
  //     userId: input.sellerId,
  //     entityType: "Transaction",
  //     entityId: (await transaction).id,
  //     type: "TRANSACTION",
  //     title: "New Transaction Created",
  //           message: `A new transaction (${(await transaction).transactionCode}) has been created. Please review the details.`,

  //     })

  //   return transaction;
  // }

  @Mutation(() => Transaction)
  @UseMiddleware(isAuthenticated)
  async createTransaction(
    @Arg("input") input: CreateTransactionInput,
    @Ctx() { user }: GraphQLContext
  ): Promise<Transaction> {
    if (input.buyerId === input.sellerId) {
      throw new Error("You cannot create a transaction with yourself!");
    }

    const escrowFee = calculateEscrowFee(input.amount);
    const totalAmount = new Decimal(input.amount).add(escrowFee);

    const transaction = await prisma.transaction.create({
      data: {
        ...input,
        transactionCode: generateTransactionCode(),
        escrowFee,
        totalAmount,
        paymentCurrency: PaymentCurrency.NGN,
        status: TransactionStatus.PENDING,
        escrowStatus: EscrowStatus.NOT_FUNDED,
        logs: {
          create: {
            action: "CREATED",
            status: TransactionStatus.PENDING,
            escrowStatus: EscrowStatus.NOT_FUNDED,
            performedBy: input.buyerId as string,
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

    const isBuyer = user?.id === input.buyerId;
    const isSeller = user?.id === input.sellerId;

    if (!isBuyer && !isSeller) {
      throw new Error("Unauthorized: You are not part of this transaction.");
    }

    // Notify the counterparty
    await sendNotification({
      userId: isBuyer ? input.sellerId : input.buyerId,
      entityType: "Transaction",
      entityId: transaction.id,
      type: "TRANSACTION",
      title: "New Transaction Created",
      message: `A new transaction (${
        transaction.transactionCode
      }) has been created by the ${
        isBuyer ? "buyer" : "seller"
      }. Please review the details.`,
    });

    // Notify the current user
    await sendNotification({
      userId: user?.id as string,
      entityType: "Transaction",
      entityId: transaction.id,
      type: "TRANSACTION",
      title: "Transaction Created",
      message: `You have successfully created a new transaction (${transaction.transactionCode}).`,
    });

    return transaction;
  }

  @Mutation(() => Transaction)
  @UseMiddleware(isAuthenticated)
  async payForTransaction(
    @Arg("transactionId") transactionId: string,
    @Ctx() { user }: GraphQLContext
  ): Promise<Transaction> {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { buyer: true, seller: true },
    });

    if (!transaction) {
      throw new Error("Transaction not found");
    }

    if (transaction.buyerId !== user?.id) {
      throw new Error("Only the buyer can pay for this transaction");
    }

    if (transaction.status !== TransactionStatus.PENDING) {
      throw new Error("Transaction is not in a payable state");
    }

    // Get buyer's wallet
    const buyerWallet = await prisma.wallet.findUnique({
      where: { userId: user?.id },
    });

    if (!buyerWallet) {
      throw new Error("Buyer wallet not found");
    }

    const totalAmount = transaction.totalAmount;

    // Check if buyer has sufficient funds
    if (buyerWallet.balance.lessThan(totalAmount)) {
      throw new Error("Insufficient wallet balance");
    }

    // Run DB transaction logic
    const updatedTransaction = await prisma.$transaction(async (tx) => {
      const newBuyerBalance = buyerWallet.balance.minus(totalAmount);
      const newBuyerEscrowBalance = buyerWallet.escrowBalance.plus(totalAmount);

      // 1. Update buyer wallet
      await tx.wallet.update({
        where: { id: buyerWallet.id },
        data: {
          balance: newBuyerBalance,
          escrowBalance: newBuyerEscrowBalance,
        },
      });

      // 2. Create wallet transaction record
      const walletTransactionRef = `TX-PAY-${transactionId}-${Date.now()}`;

      await tx.walletTransaction.create({
        data: {
          walletId: buyerWallet.id,
          transactionId,
          amount: totalAmount,
          currency: buyerWallet.currency,
          type: WalletTransactionType.ESCROW_FUNDING,
          status: WalletTransactionStatus.COMPLETED,
          description: `Payment for transaction ${transaction.transactionCode}`,
          reference: walletTransactionRef,
          balanceBefore: buyerWallet.balance,
          balanceAfter: newBuyerBalance,
        },
      });

      // 3. Update transaction status and create log
      return tx.transaction.update({
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
              performedBy: user?.id!,
              description: `Payment confirmed using wallet funds`,
            },
          },
        },
        include: { buyer: true, seller: true, logs: true },
      });
    });

    // 4. Send notification OUTSIDE the transaction
    await sendNotification({
      userId: transaction.sellerId,
      title: "Payment Received",
      message: `Payment for transaction ${transaction.transactionCode} has been confirmed`,
      type: "PAYMENT",
      entityId: transactionId,
      entityType: "Transaction",
    });

    return updatedTransaction;
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

    const updatedTransaction = await prisma.transaction.update({
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

    // Send notifications to buyer
    await sendNotification({
      userId: transaction.buyerId,
      title: "Delivery Update",
      message: `The seller has updated the delivery information for transaction ${
        transaction.transactionCode
      }. Expected delivery date: ${input.expectedDeliveryDate?.toLocaleDateString()}.`,
      type: "TRANSACTION",
      entityId: transaction.id,
      entityType: "Transaction",
    });

    // Send email to buyer
    const buyer = await prisma.user.findUnique({
      where: { id: transaction.buyerId },
    });

    if (buyer?.email) {
      await sendEmail({
        to: buyer.email,
        subject: `Delivery Update for Transaction ${transaction.transactionCode}`,
        body: `
          Hello ${buyer.firstName},

          The seller has updated the delivery information for your transaction ${
            transaction.transactionCode
          }.

          Delivery Method: ${input.deliveryMethod}
          Tracking Information: ${input.trackingInfo || "Not provided"}
          Expected Delivery Date: ${input.expectedDeliveryDate?.toLocaleDateString()}

          You will be notified once the delivery is completed.
        `,
      });
    }

    return updatedTransaction;
  }

  @Mutation(() => Transaction)
  @UseMiddleware(isAuthenticated)
  async confirmDelivery(
    @Arg("transactionId") transactionId: string,
    @Ctx() { user }: GraphQLContext
  ): Promise<Transaction> {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        seller: true,
        buyer: true, // Add buyer to include
      },
    });

    if (!transaction) throw new Error("Transaction not found");
    if (transaction.buyerId !== user?.id)
      throw new Error("Only the buyer can confirm delivery");
    if (transaction.status !== TransactionStatus.IN_PROGRESS) {
      throw new Error("Transaction must be in progress to confirm delivery");
    }

    let updatedTransaction;

    // Update transaction status to DELIVERED and handle escrow release in a single transaction
    try {
      updatedTransaction = await prisma.$transaction(async (tx) => {
        // First update the transaction status
        const updated = await tx.transaction.update({
          where: { id: transactionId },
          data: {
            status: TransactionStatus.DELIVERED,
            actualDeliveryDate: new Date(),
            logs: {
              create: {
                action: "DELIVERY_CONFIRMED",
                status: TransactionStatus.DELIVERED,
                escrowStatus: transaction.escrowStatus,
                performedBy: user?.id as string,
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
        return updated;
      });
    } catch (error) {
      logger.error("Error updating transaction status:", error);
      throw new Error("Failed to confirm delivery");
    }

    // Automatically release funds to seller's wallet
    try {
      // Find both buyer's and seller's wallets
      const [sellerWallet, buyerWallet] = await Promise.all([
        prisma.wallet.findUnique({
          where: { userId: transaction.sellerId },
        }),
        prisma.wallet.findUnique({
          where: { userId: transaction.buyerId },
        }),
      ]);

      if (!sellerWallet) {
        throw new Error("Seller wallet not found");
      }

      if (!buyerWallet) {
        throw new Error("Buyer wallet not found");
      }

      // Generate a unique reference for the transaction
      const reference = `ESC-${transaction.transactionCode}`;
      const amount = transaction.amount;
      const totalAmount = transaction.totalAmount; // This includes escrow fee

      await prisma.$transaction(async (tx) => {
        // 1. Update buyer's escrow balance (reduce it)
        const newBuyerEscrowBalance =
          buyerWallet.escrowBalance.minus(totalAmount);

        await tx.wallet.update({
          where: { id: buyerWallet.id },
          data: {
            escrowBalance: newBuyerEscrowBalance,
          },
        });

        // 2. Create wallet transaction for buyer (escrow reduction)
        await tx.walletTransaction.create({
          data: {
            walletId: buyerWallet.id,
            transactionId: transaction.id,
            amount: totalAmount.negated(), // Negative amount to show reduction
            currency: transaction.paymentCurrency,
            description: `Escrow released for transaction ${transaction.transactionCode}`,
            type: WalletTransactionType.ESCROW_RELEASE,
            reference: `${reference}-BUYER`,
            balanceBefore: buyerWallet.escrowBalance,
            balanceAfter: newBuyerEscrowBalance,
            status: WalletTransactionStatus.COMPLETED,
          },
        });

        // 3. Update seller's wallet balance (add the main amount, not including escrow fee)
        const sellerBalanceBefore = sellerWallet.balance;
        const sellerBalanceAfter = sellerWallet.balance.add(amount);

        await tx.wallet.update({
          where: { id: sellerWallet.id },
          data: {
            balance: sellerBalanceAfter,
          },
        });

        // 4. Create wallet transaction for seller (payment received)
        await tx.walletTransaction.create({
          data: {
            walletId: sellerWallet.id,
            transactionId: transaction.id,
            amount: amount,
            currency: transaction.paymentCurrency,
            description: `Payment received for transaction ${transaction.transactionCode}`,
            type: WalletTransactionType.ESCROW_RELEASE,
            reference: `${reference}-SELLER`,
            balanceBefore: sellerBalanceBefore,
            balanceAfter: sellerBalanceAfter,
            status: WalletTransactionStatus.COMPLETED,
          },
        });

        // 5. Update transaction escrow status
        await tx.transaction.update({
          where: { id: transaction.id },
          data: {
            status: TransactionStatus.COMPLETED,
            escrowStatus: EscrowStatus.RELEASED,
            completedAt: new Date(),
            logs: {
              create: {
                action: "ESCROW_RELEASED_AUTO",
                status: TransactionStatus.COMPLETED,
                escrowStatus: EscrowStatus.RELEASED,
                performedBy: user?.id as string,
                description:
                  "Escrow automatically released to seller upon delivery confirmation",
              },
            },
          },
        });
      });

      // Send notifications to both buyer and seller
      const sellerName = transaction.seller?.firstName || "Seller";

      // Seller notification
      const sellerNotificationMessage = `Payment of ${amount} ${transaction.paymentCurrency} has been released to your wallet for transaction ${transaction.transactionCode}.`;
      await sendNotification({
        userId: transaction.sellerId,
        title: "Payment Released",
        message: sellerNotificationMessage,
        type: "TRANSACTION",
        entityId: transaction.id,
        entityType: "Transaction",
        forceAll: true,
      });

      // Buyer notification
      const buyerNotificationMessage = `Your payment has been released to ${sellerName} for transaction ${transaction.transactionCode}. Thank you for using our service!`;
      await sendNotification({
        userId: transaction.buyerId,
        title: "Transaction Completed",
        message: buyerNotificationMessage,
        type: "TRANSACTION",
        entityId: transaction.id,
        entityType: "Transaction",
        forceAll: true,
      });
    } catch (error) {
      console.error("Error releasing escrow funds:", error);
      // We don't throw here to ensure the delivery confirmation still succeeds
      // The admin can manually release the funds if this automatic process fails
    }

    return updatedTransaction;
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

    const updatedTransaction = await prisma.transaction.update({
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

    // Send notifications to seller
    await sendNotification({
      userId: transaction.sellerId,
      title: "Escrow Released",
      message: `The buyer has released the escrow payment for transaction ${transaction.transactionCode}. The funds will be transferred to your wallet.`,
      type: "TRANSACTION",
      entityId: transaction.id,
      entityType: "Transaction",
      forceAll: true,
    });

    // Send email to seller
    const seller = await prisma.user.findUnique({
      where: { id: transaction.sellerId },
    });

    if (seller?.email) {
      await sendEmail({
        to: seller.email,
        subject: `Escrow Released for Transaction ${transaction.transactionCode}`,
        body: `
          Hello ${seller.firstName},

          Great news! The buyer has released the escrow payment for transaction ${transaction.transactionCode}.
          The funds (${transaction.amount} ${transaction.paymentCurrency}) will be transferred to your wallet.

          Thank you for using our service!
        `,
      });
    }

    return updatedTransaction;
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
