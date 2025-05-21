import { Resolver, Mutation, Arg, Ctx, UseMiddleware } from "type-graphql";
import { GraphQLContext } from "../types/context.type";
import { prisma } from "../../config/db.config";
import { isAuthenticated } from "../middleware/auth.middleware";
import {
  BankWithdrawal,
  WithdrawToNigerianBankInput,
} from "../types/withdrawal.type";
import {
  WalletTransactionType,
  WalletTransactionStatus,
  BankWithdrawalStatus,
} from "../../generated/prisma-client";
import { nanoid } from "nanoid";
import { Decimal } from "../../generated/prisma-client/runtime/library";
import { sendNotification } from "../../services/notification.service";

@Resolver(BankWithdrawal)
export class WithdrawalResolver {
  @Mutation(() => BankWithdrawal)
  @UseMiddleware(isAuthenticated)
  async withdrawToNigerianBank(
    @Arg("input") input: WithdrawToNigerianBankInput,
    @Ctx() { user }: GraphQLContext
  ): Promise<BankWithdrawal> {
    // Find user's wallet
    const wallet = await prisma.wallet.findUnique({
      where: { userId: user?.id },
    });

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    // Check if wallet has sufficient balance
    if (wallet.balance.lessThan(input.amount)) {
      throw new Error("Insufficient wallet balance");
    }

    // Generate a unique reference for the transaction
    const reference = `WD-${nanoid(10)}`;

    // Create withdrawal record and update wallet in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create bank withdrawal record
      const withdrawal = await tx.bankWithdrawal.create({
        data: {
          userId: user?.id as string,
          bankName: input.bankName,
          accountNumber: input.accountNumber,
          accountName: input.accountName,
          bankCode: input.bankCode,
          amount: input.amount,
          currency: input.currency,
          reference,
          status: BankWithdrawalStatus.PENDING,
        },
      });

      // Create wallet transaction
      const balanceBefore = wallet.balance;
      const balanceAfter = wallet.balance.minus(new Decimal(input.amount));

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: input.amount,
          currency: wallet.currency,
          description: `Withdrawal to ${input.bankName} - ${input.accountNumber}`,
          type: WalletTransactionType.WITHDRAWAL,
          reference,
          balanceBefore,
          balanceAfter,
          status: WalletTransactionStatus.COMPLETED,
        },
      });

      // Update wallet balance
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: balanceAfter,
        },
      });

      return withdrawal;
    });

    // Send notification to user
    await sendNotification({
      userId: user?.id as string,
      title: "Withdrawal Initiated",
      message: `Your withdrawal of ${input.amount} ${input.currency} to ${input.bankName} account has been initiated.`,
      type: "TRANSACTION",
    });

    return result;
  }
}
