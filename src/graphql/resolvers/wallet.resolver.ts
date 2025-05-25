// wallet.resolver.ts
import {
  Resolver,
  Query,
  Mutation,
  Arg,
  Ctx,
  UseMiddleware,
} from "type-graphql";
import {
  Wallet,
  WalletTransaction,
  CreateWalletInput,
  PaymentInitiationResponse,
  WalletTransferInput,
} from "../types/wallet.type";
import { FundWalletInput } from "../types/wallet.input";
import {
  WalletTransactionType,
  WalletTransactionStatus,
  PaymentCurrency,
  PaymentStatus,
} from "../../generated/prisma-client";
import { GraphQLContext } from "../types/context.type";
import { prisma } from "../../config/db.config";
import { isAuthenticated } from "../middleware/auth.middleware";
import { PaymentService } from "../../services/payment.service";
import logger from "../../utils/logger";

@Resolver(Wallet)
export class WalletResolver {
  @Query(() => Wallet)
  @UseMiddleware(isAuthenticated)
  async wallet(@Ctx() { user }: GraphQLContext): Promise<Wallet> {
    const wallet = await prisma.wallet.findUnique({
      where: { userId: user?.id },
      include: { transactions: true },
    });

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    return wallet;
  }

  @Query(() => [WalletTransaction])
  @UseMiddleware(isAuthenticated)
  async walletTransactions(
    @Ctx() { user }: GraphQLContext
  ): Promise<WalletTransaction[]> {
    const wallet = await prisma.wallet.findUnique({
      where: { userId: user?.id },
    });

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    return prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
    });
  }

  @Mutation(() => Wallet)
  @UseMiddleware(isAuthenticated)
  async createWallet(
    @Arg("input") input: CreateWalletInput,
    @Ctx() { user }: GraphQLContext
  ): Promise<Wallet> {
    const existingWallet = await prisma.wallet.findUnique({
      where: { userId: user?.id },
    });

    if (existingWallet) {
      throw new Error("User already has a wallet");
    }

    // Convert string currency to PaymentCurrency enum
    const currency = input.currency as PaymentCurrency;

    return prisma.wallet.create({
      data: {
        userId: user?.id as string,
        currency: currency,
        balance: 0,
        escrowBalance: 0,
        isActive: true,
      },
      include: { transactions: true },
    });
  }

  @Mutation(() => PaymentInitiationResponse)
  @UseMiddleware(isAuthenticated)
  async fundWallet(
    @Arg("input") input: FundWalletInput,
    @Ctx() { user }: GraphQLContext
  ): Promise<PaymentInitiationResponse> {
    try {
      const wallet = await prisma.wallet.findUnique({
        where: { userId: user?.id },
      });

      if (!wallet) {
        throw new Error("Wallet not found");
      }

      if (input.currency !== wallet.currency) {
        throw new Error("Currency mismatch with wallet currency");
      }

      const userRecord = await prisma.user.findUnique({
        where: { id: user?.id },
      });

      if (!userRecord?.email) {
        throw new Error("User email required for payment");
      }

      const gatewayReference = `WALLET-FUND-${wallet.id}-${Date.now()}`;

      // Create payment and wallet transaction records
      const result = await prisma.$transaction(async (tx) => {
        const payment = await tx.payment.create({
          data: {
            amount: input.amount,
            fee: 0,
            totalAmount: input.amount,
            paymentCurrency: input.currency,
            paymentGateway: input.paymentGateway,
            gatewayReference,
            status: PaymentStatus.PENDING,
          },
        });

        const walletTransaction = await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            paymentId: payment.id,
            amount: input.amount,
            currency: input.currency,
            type: WalletTransactionType.DEPOSIT,
            reference: gatewayReference,
            status: WalletTransactionStatus.PENDING,
            description: "Wallet funding via payment gateway",
            balanceBefore: wallet.balance,
            balanceAfter: wallet.balance,
          },
        });

        return { payment, walletTransaction };
      });

      // Initialize payment with gateway
      const paymentService = PaymentService.getInstance();
      const initiationResponse = await paymentService.initiatePayment({
        transactionId: gatewayReference,
        totalAmount: Number(input.amount),
        email: userRecord.email,
        gateway: input.paymentGateway,
        existingReference: gatewayReference,
      });

      // Clean up if payment initiation fails
      if (!initiationResponse.success) {
        await prisma.$transaction(async (tx) => {
          await tx.walletTransaction.delete({
            where: { id: result.walletTransaction.id },
          });
          await tx.payment.delete({
            where: { id: result.payment.id },
          });
        });
      }

      return initiationResponse;
    } catch (error) {
      logger.error("Wallet funding error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  @Mutation(() => WalletTransaction)
  @UseMiddleware(isAuthenticated)
  async transferWalletFunds(
    @Arg("input") input: WalletTransferInput,
    @Ctx() { user }: GraphQLContext
  ): Promise<WalletTransaction> {
    const wallet = await prisma.wallet.findUnique({
      where: { userId: user?.id },
    });

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    if (input.currency !== wallet.currency) {
      throw new Error("Currency mismatch with wallet currency");
    }

    let newBalance = wallet.balance;
    let newEscrowBalance = wallet.escrowBalance;
    let transactionStatus: WalletTransactionStatus;
    let description = "";

    // Handle different transfer types
    switch (input.type) {
      case WalletTransactionType.ESCROW_FUNDING:
        if (wallet.balance < input.amount) {
          throw new Error("Insufficient balance for escrow funding");
        }
        newBalance = newBalance.minus(input.amount);
        newEscrowBalance = newEscrowBalance.plus(input.amount);
        transactionStatus = WalletTransactionStatus.COMPLETED;
        description = `Escrow funding for transaction ${input.transactionId}`;
        break;

      case WalletTransactionType.ESCROW_RELEASE:
        if (wallet.escrowBalance < input.amount) {
          throw new Error("Insufficient escrow balance for release");
        }
        newEscrowBalance = newEscrowBalance.minus(input.amount);
        transactionStatus = WalletTransactionStatus.COMPLETED;
        description = `Escrow release for transaction ${input.transactionId}`;
        break;

      case WalletTransactionType.ESCROW_REFUND:
        if (wallet.escrowBalance < input.amount) {
          throw new Error("Insufficient escrow balance for refund");
        }
        newEscrowBalance = newEscrowBalance.minus(input.amount);
        newBalance = newBalance.plus(input.amount);
        transactionStatus = WalletTransactionStatus.COMPLETED;
        description = `Escrow refund for transaction ${input.transactionId}`;
        break;

      case WalletTransactionType.WITHDRAWAL:
        if (wallet.balance < input.amount) {
          throw new Error("Insufficient balance for withdrawal");
        }
        newBalance = newBalance.minus(input.amount);
        transactionStatus = WalletTransactionStatus.PENDING; // Withdrawals need approval
        description = "Wallet withdrawal";
        break;

      default:
        throw new Error("Invalid transfer type");
    }

    // Execute transfer
    return prisma.$transaction(async (tx) => {
      const reference = `WT-${Date.now()}-${Math.random()
        .toString(36)
        .substring(7)}`;

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: input.amount,
          currency: input.currency,
          type: input.type,
          status: transactionStatus,
          description,
          reference,
          balanceBefore: wallet.balance,
          balanceAfter: newBalance,
          transactionId: input.transactionId,
        },
      });

      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: newBalance,
          escrowBalance: newEscrowBalance,
        },
      });

      return transaction;
    });
  }

  /**
   * Confirm wallet funding after successful payment
   * This should be called by the payment service when payment is confirmed
   */
  async confirmWalletFunding(
    paymentId: string,
    gatewayResponse: any
  ): Promise<void> {
    try {
      // Find the payment and associated wallet transaction
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: {
          walletTransactions: {
            where: { status: WalletTransactionStatus.PENDING },
            include: { wallet: true },
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
      });

      logger.info(`Wallet funding confirmed for payment ${paymentId}`);
    } catch (error) {
      logger.error("Error confirming wallet funding:", error);
      throw error;
    }
  }

  /**
   * Handle failed wallet funding
   */
  async handleFailedWalletFunding(
    paymentId: string,
    gatewayResponse: any
  ): Promise<void> {
    try {
      // Find the payment and associated wallet transaction
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: {
          walletTransactions: {
            where: { status: WalletTransactionStatus.PENDING },
          },
        },
      });

      if (!payment || payment.walletTransactions.length === 0) {
        throw new Error("Payment or wallet transaction not found");
      }

      const walletTransaction = payment.walletTransactions[0];

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
      });

      logger.info(`Wallet funding failed for payment ${paymentId}`);
    } catch (error) {
      logger.error("Error handling failed wallet funding:", error);
      throw error;
    }
  }
}
