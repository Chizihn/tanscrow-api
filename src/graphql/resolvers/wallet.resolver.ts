import {
  Resolver,
  Query,
  Mutation,
  Arg,
  Ctx,
  Authorized,
  ID,
  UseMiddleware,
} from "type-graphql";
import {
  Wallet,
  WalletTransaction,
  CreateWalletInput,
  WalletTransactionInput,
} from "../types/wallet.type";
import {
  WalletTransactionType,
  WalletTransactionStatus,
  PaymentCurrency,
} from "../../generated/prisma-client";
import { GraphQLContext } from "../types/context.type";
import { prisma } from "../../config/db.config";
import { isAuthenticated } from "../middleware/auth.middleware";

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
        // Add escrowBalance to match resolver logic
        escrowBalance: 0,
        isActive: true,
      },
      include: { transactions: true },
    });
  }

  @Mutation(() => WalletTransaction)
  @UseMiddleware(isAuthenticated)
  async processWalletTransaction(
    @Arg("input") input: WalletTransactionInput,
    @Ctx() { user }: GraphQLContext
  ): Promise<WalletTransaction> {
    const wallet = await prisma.wallet.findUnique({
      where: { userId: user?.id },
    });

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    // Validate transaction currency matches wallet currency
    if (input.currency !== wallet.currency) {
      throw new Error("Currency mismatch with wallet currency");
    }

    // Handle different transaction types
    let newBalance = wallet.balance;
    let newEscrowBalance = wallet.escrowBalance;

    switch (input.type) {
      case WalletTransactionType.ESCROW_FUNDING:
        if (wallet.balance < input.amount) {
          throw new Error("Insufficient balance for escrow funding");
        }
        newBalance = newBalance.minus(input.amount);
        newEscrowBalance = newEscrowBalance.plus(input.amount);
        break;

      case WalletTransactionType.ESCROW_RELEASE:
        if (wallet.escrowBalance < input.amount) {
          throw new Error("Insufficient escrow balance for release");
        }
        newEscrowBalance = newEscrowBalance.minus(input.amount);
        // For escrow release, the amount goes to the seller's wallet
        break;

      case WalletTransactionType.ESCROW_REFUND:
        if (wallet.escrowBalance < input.amount) {
          throw new Error("Insufficient escrow balance for refund");
        }
        newEscrowBalance = newEscrowBalance.minus(input.amount);
        newBalance = newBalance.plus(input.amount);
        break;

      default:
        throw new Error("Invalid transaction type");
    }

    // Calculate balance before and after
    const balanceBefore = wallet.balance;
    const balanceAfter = newBalance;

    // Create transaction and update wallet in a single transaction
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
          status: WalletTransactionStatus.COMPLETED,
          description: input.description || "",
          reference: reference,
          balanceBefore: balanceBefore,
          balanceAfter: balanceAfter,
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
}
