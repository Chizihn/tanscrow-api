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
  WalletTransactionType,
  WalletTransactionStatus,
  PaymentGateway,
} from "../../generated/prisma-client";
import { generateTransactionCode } from "../../utils/transaction";
import { calculateEscrowFee } from "../../utils/fees";
import { GraphQLContext } from "../types/context.type";
import { prisma } from "../../config/db.config";
import { Decimal } from "../../generated/prisma-client/runtime/library";
import { isAuthenticated } from "../middleware/auth.middleware";
import { sendNotification } from "../../services/notification.service";
import { TransactionAuditService } from "../../services/transaction-audit.service";
import { PaymentService } from "../../services/payment.service";

const transactionAudit = new TransactionAuditService();

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
    if (input.buyerId === input.sellerId) {
      throw new Error("You cannot create a transaction with yourself!");
    }

    //Calculate escrow fee
    const escrowFee = calculateEscrowFee(input.amount);
    // Convert escrowFee to Decimal and add to input.amount
    const totalAmount = new Decimal(input.amount).add(escrowFee);

    return prisma.transaction.create({
      data: {
        ...input,
        transactionCode: generateTransactionCode(),
        // buyerId: user?.id as string,
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
  }
  @Mutation(() => Transaction)
  @UseMiddleware(isAuthenticated)
  async processPayment(
    @Arg("input") input: ProcessPaymentInput,
    @Ctx() { user }: GraphQLContext
  ): Promise<Transaction> {
    // Begin transaction to ensure all database operations are atomic
    return prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findUnique({
        where: { id: input.transactionId },
        include: { payment: true, logs: true },
      });

      if (!transaction) throw new Error("Transaction not found");
      if (transaction.buyerId !== user?.id)
        throw new Error("Only the buyer can process payment");
      if (transaction.isPaid) throw new Error("Transaction is already paid");

      // Check if there's already a payment in progress
      if (
        transaction.payment &&
        transaction.payment.status === PaymentStatus.PENDING
      ) {
        // Clean up existing payment attempt and all related logs
        if (transaction.logs) {
          const paymentLogs = transaction.logs.filter(
            (log) =>
              (log.action === "PAYMENT_INITIATED" ||
                log.action === "PAYMENT") &&
              log.status !== TransactionStatus.COMPLETED
          );

          for (const log of paymentLogs) {
            await tx.transactionLog.delete({
              where: { id: log.id },
            });
          }
        }

        // Delete the pending payment record
        if (transaction.payment.id) {
          await tx.payment.delete({
            where: { id: transaction.payment.id },
          });
        }
      }

      // Generate a unique reference for the payment gateway using UUID
      // Much more secure than using timestamp which can be predicted
      const gatewayReference = `PAY-${transaction.transactionCode}-${crypto
        .randomUUID()
        .substring(0, 8)}`;

      // Handle wallet payment
      if (input.paymentGateway === PaymentGateway.WALLET) {
        const wallet = await tx.wallet.findUnique({
          where: { userId: user?.id },
        });

        if (!wallet) {
          throw new Error(
            "You don't have a wallet. Visit the wallet page to create one."
          );
        }

        if (wallet.balance.lessThan(transaction.totalAmount)) {
          throw new Error("Insufficient wallet balance");
        }

        // Create payment record
        const payment = await tx.payment.create({
          data: {
            amount: transaction.amount,
            fee: transaction.escrowFee,
            totalAmount: transaction.totalAmount,
            paymentCurrency: transaction.paymentCurrency,
            paymentGateway: input.paymentGateway,
            gatewayReference: gatewayReference,
            status: PaymentStatus.SUCCESSFUL,
          },
        });

        // Update wallet balance
        const balanceBefore = wallet.balance;
        const balanceAfter = wallet.balance.sub(transaction.totalAmount);

        // Create wallet transaction
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            amount: transaction.totalAmount,
            currency: transaction.paymentCurrency,
            type: WalletTransactionType.PAYMENT,
            reference: gatewayReference,
            status: WalletTransactionStatus.COMPLETED,
            description: `Payment for transaction ${transaction.transactionCode}`,
            balanceBefore,
            balanceAfter,
          },
        });

        // Update wallet balance
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: balanceAfter },
        });

        // First check if there's already a successful payment log to prevent duplicates
        const existingSuccessLog = transaction.logs?.find(
          (log) =>
            log.action === "PAYMENT" &&
            log.status === TransactionStatus.IN_PROGRESS &&
            log.escrowStatus === EscrowStatus.FUNDED
        );

        // Create a new log only if one doesn't already exist
        const logData = existingSuccessLog
          ? {}
          : {
              logs: {
                create: {
                  action: "PAYMENT",
                  status: TransactionStatus.IN_PROGRESS,
                  escrowStatus: EscrowStatus.FUNDED,
                  performedBy: user?.id,
                  description: "Payment processed using wallet",
                },
              },
            };

        return tx.transaction.update({
          where: { id: input.transactionId },
          data: {
            paymentId: payment.id,
            isPaid: true,
            status: TransactionStatus.IN_PROGRESS,
            escrowStatus: EscrowStatus.FUNDED,
            ...logData,
          },
          include: {
            buyer: true,
            seller: true,
            payment: true,
            logs: true,
          },
        });
      }

      // Handle payment gateway payments (Flutterwave/Paystack)
      try {
        // Create initial payment record
        const payment = await tx.payment.create({
          data: {
            amount: transaction.amount,
            fee: transaction.escrowFee,
            totalAmount: transaction.totalAmount,
            paymentCurrency: transaction.paymentCurrency,
            paymentGateway: input.paymentGateway,
            gatewayReference: gatewayReference,
            status: PaymentStatus.PENDING,
          },
        });

        // Initialize payment with gateway
        const paymentService = PaymentService.getInstance();
        const buyer = await tx.user.findUnique({
          where: { id: transaction.buyerId },
          select: { email: true, firstName: true, lastName: true }, // Get name for better payment tracking
        });

        if (!buyer?.email) {
          throw new Error("Buyer email is required for payment");
        }

        const paymentInitiation = await paymentService.initiatePayment(
          transaction.id,
          transaction.totalAmount.toNumber(),
          buyer.email,
          input.paymentGateway
        );

        if (!paymentInitiation.success) {
          // Handle failed payment initiation by cleaning up
          await tx.payment.delete({
            where: { id: payment.id },
          });

          throw new Error(
            paymentInitiation.error || "Failed to initiate payment"
          );
        }

        // Securely store gateway response data - only store necessary information
        const gatewayResponse = {
          redirectUrl: paymentInitiation.redirectUrl,
          timestamp: new Date().toISOString(),
          reference: paymentInitiation.reference || gatewayReference,
          // Only include essential data needed for verification
        };

        // Update payment with verified gateway reference and response
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            gatewayReference: paymentInitiation.reference || gatewayReference,
            gatewayResponse: gatewayResponse,
          },
        });

        // First check if there's already a pending payment log to prevent duplicates
        const existingPendingLog = transaction.logs?.find(
          (log) =>
            log.action === "PAYMENT_INITIATED" &&
            log.status === TransactionStatus.PENDING &&
            log.escrowStatus === EscrowStatus.NOT_FUNDED
        );

        // Create a new log only if one doesn't already exist
        const logData = existingPendingLog
          ? {}
          : {
              logs: {
                create: {
                  action: "PAYMENT_INITIATED",
                  status: TransactionStatus.PENDING,
                  escrowStatus: EscrowStatus.NOT_FUNDED,
                  performedBy: user?.id,
                  description: `Payment initiated with ${input.paymentGateway}`,
                },
              },
            };

        return tx.transaction.update({
          where: { id: input.transactionId },
          data: {
            paymentId: payment.id,
            isPaid: false, // Will be set to true after payment confirmation
            status: TransactionStatus.PENDING,
            escrowStatus: EscrowStatus.NOT_FUNDED, // Explicitly set escrow status
            ...logData,
          },
          include: {
            buyer: true,
            seller: true,
            payment: true,
            logs: true,
          },
        });
      } catch (error) {
        // Log the error for debugging (optional)
        console.error("Payment processing error:", error);

        // Re-throw the error to be handled by the caller
        throw error;
      }
    });
  }

  // @Mutation(() => Transaction)
  // @UseMiddleware(isAuthenticated)
  // async processPayment(
  //   @Arg("input") input: ProcessPaymentInput,
  //   @Ctx() { user }: GraphQLContext
  // ): Promise<Transaction> {
  //   const transaction = await prisma.transaction.findUnique({
  //     where: { id: input.transactionId },
  //     include: { payment: true },
  //   });

  //   if (!transaction) throw new Error("Transaction not found");
  //   if (transaction.buyerId !== user?.id)
  //     throw new Error("Only the buyer can process payment");
  //   if (transaction.isPaid) throw new Error("Transaction is already paid");

  //   // Generate a unique reference for the payment gateway
  //   const gatewayReference = `PAY-${transaction.transactionCode}-${Date.now()}`;

  //   // Handle wallet payment
  //   if (input.paymentGateway === PaymentGateway.WALLET) {
  //     const wallet = await prisma.wallet.findUnique({
  //       where: { userId: user?.id },
  //     });

  //     if (!wallet) {
  //       throw new Error(
  //         "You don't have a wallet. Visit the wallet page to create one.."
  //       );
  //     }

  //     if (wallet.balance.lessThan(transaction.totalAmount)) {
  //       throw new Error("Insufficient wallet balance");
  //     }

  //     // Create payment record
  //     const payment = await prisma.payment.create({
  //       data: {
  //         amount: transaction.amount,
  //         fee: transaction.escrowFee,
  //         totalAmount: transaction.totalAmount,
  //         paymentCurrency: transaction.paymentCurrency,
  //         paymentGateway: input.paymentGateway,
  //         gatewayReference: gatewayReference,
  //         status: PaymentStatus.SUCCESSFUL,
  //       },
  //     });

  //     // Update wallet balance
  //     const balanceBefore = wallet.balance;
  //     const balanceAfter = wallet.balance.sub(transaction.totalAmount);

  //     await prisma.$transaction(async (tx) => {
  //       // Create wallet transaction
  //       await tx.walletTransaction.create({
  //         data: {
  //           walletId: wallet.id,
  //           amount: transaction.totalAmount,
  //           currency: transaction.paymentCurrency,
  //           type: WalletTransactionType.PAYMENT,
  //           reference: gatewayReference,
  //           status: WalletTransactionStatus.COMPLETED,
  //           description: `Payment for transaction ${transaction.transactionCode}`,
  //           balanceBefore,
  //           balanceAfter,
  //         },
  //       });

  //       // Update wallet balance
  //       await tx.wallet.update({
  //         where: { id: wallet.id },
  //         data: { balance: balanceAfter },
  //       });
  //     });

  //     return prisma.transaction.update({
  //       where: { id: input.transactionId },
  //       data: {
  //         paymentId: payment.id,
  //         isPaid: true,
  //         status: TransactionStatus.IN_PROGRESS,
  //         escrowStatus: EscrowStatus.FUNDED,
  //         logs: {
  //           create: {
  //             action: "PAYMENT",
  //             status: TransactionStatus.IN_PROGRESS,
  //             escrowStatus: EscrowStatus.FUNDED,
  //             performedBy: user?.id,
  //             description: "Payment processed using wallet",
  //           },
  //         },
  //       },
  //       include: {
  //         buyer: true,
  //         seller: true,
  //         payment: true,
  //         logs: true,
  //       },
  //     });
  //   }

  //   // Handle payment gateway payments (Flutterwave/Paystack)
  //   const payment = await prisma.payment.create({
  //     data: {
  //       amount: transaction.amount,
  //       fee: transaction.escrowFee,
  //       totalAmount: transaction.totalAmount,
  //       paymentCurrency: transaction.paymentCurrency,
  //       paymentGateway: input.paymentGateway,
  //       gatewayReference: gatewayReference,
  //       status: PaymentStatus.PENDING,
  //     },
  //   });

  //   // Initialize payment with gateway
  //   const paymentService = PaymentService.getInstance();
  //   const buyer = await prisma.user.findUnique({
  //     where: { id: transaction.buyerId },
  //     select: { email: true },
  //   });

  //   if (!buyer?.email) {
  //     throw new Error("Buyer email is required for payment");
  //   }

  //   const paymentInitiation = await paymentService.initiatePayment(
  //     transaction.id,
  //     transaction.totalAmount.toNumber(),
  //     buyer.email,
  //     input.paymentGateway
  //   );

  //   if (!paymentInitiation.success) {
  //     throw new Error(paymentInitiation.error || "Failed to initiate payment");
  //   }

  //   // Update payment with gateway reference
  //   await prisma.payment.update({
  //     where: { id: payment.id },
  //     data: {
  //       gatewayReference: paymentInitiation.reference || gatewayReference,
  //     },
  //   });

  //   const updatedTransaction = await prisma.transaction.update({
  //     where: { id: input.transactionId },
  //     data: {
  //       paymentId: payment.id,
  //       isPaid: false, // Will be set to true after payment confirmation
  //       status: TransactionStatus.PENDING,
  //       logs: {
  //         create: {
  //           action: "PAYMENT_INITIATED",
  //           status: TransactionStatus.PENDING,
  //           escrowStatus: EscrowStatus.NOT_FUNDED,
  //           performedBy: user?.id,
  //           description: "Payment initiated with gateway",
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

  //   // Update payment with gateway response and return transaction
  //   await prisma.payment.update({
  //     where: { id: payment.id },
  //     data: {
  //       gatewayResponse: { redirectUrl: paymentInitiation.redirectUrl },
  //     },
  //   });

  //   return updatedTransaction;
  // }

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
      include: {
        seller: true,
      },
    });

    if (!transaction) throw new Error("Transaction not found");
    if (transaction.buyerId !== user?.id)
      throw new Error("Only the buyer can confirm delivery");
    if (transaction.status !== TransactionStatus.IN_PROGRESS) {
      throw new Error("Transaction must be in progress to confirm delivery");
    }

    // Update transaction status to DELIVERED
    const updatedTransaction = await prisma.transaction.update({
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

    // Automatically release funds to seller's wallet
    try {
      // Find seller's wallet
      const sellerWallet = await prisma.wallet.findUnique({
        where: { userId: transaction.sellerId },
      });

      if (sellerWallet) {
        // Generate a unique reference for the transaction
        const reference = `ESCROW-RELEASE-${transaction.transactionCode}`;
        const amount = transaction.amount;

        // Update seller's wallet balance
        const balanceBefore = sellerWallet.balance;
        const balanceAfter = sellerWallet.balance.add(amount);

        await prisma.$transaction(async (tx) => {
          // Create wallet transaction
          await tx.walletTransaction.create({
            data: {
              walletId: sellerWallet.id,
              amount: amount,
              currency: transaction.paymentCurrency,
              description: `Payment received for transaction ${transaction.transactionCode}`,
              type: WalletTransactionType.ESCROW_RELEASE,
              reference,
              balanceBefore,
              balanceAfter,
              status: WalletTransactionStatus.COMPLETED,
            },
          });

          // Update wallet balance
          await tx.wallet.update({
            where: { id: sellerWallet.id },
            data: {
              balance: balanceAfter,
            },
          });

          // Update transaction escrow status
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
        // const buyerName = transaction.buyer?.firstName || "Buyer";

        // Seller notification
        const sellerNotificationMessage = `Payment of ${amount} ${transaction.paymentCurrency} has been released to your wallet for transaction ${transaction.transactionCode}.`;
        await sendNotification({
          userId: transaction.sellerId,
          title: "Payment Released",
          message: sellerNotificationMessage,
          type: "TRANSACTION",
          entityId: transaction.id,
          entityType: "Transaction",
          forceAll: true, // Ensure critical transaction notifications are sent
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
          forceAll: true, // Ensure critical transaction notifications are sent
        });
      }
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
