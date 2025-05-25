import {
  Resolver,
  Mutation,
  Arg,
  Ctx,
  UseMiddleware,
  Query,
  ID,
} from "type-graphql";
import { GraphQLContext } from "../types/context.type";
import { prisma } from "../../config/db.config";
import { isAuthenticated } from "../middleware/auth.middleware";
import {
  BankWithdrawal,
  WithdrawToNigerianBankInput,
} from "../types/withdrawal.type";
import { Bank, AccountDetails, AccountResolveInput } from "../types/bank.type";
import { BankService } from "../../services/bank.service";
import { PaymentService } from "../../services/payment.service";
import {
  WalletTransactionType,
  WalletTransactionStatus,
  BankWithdrawalStatus,
  PrismaClient,
} from "../../generated/prisma-client";
import { nanoid } from "nanoid";
import { Decimal } from "../../generated/prisma-client/runtime/library";
import { sendNotification } from "../../services/notification.service";
import logger from "../../utils/logger";

@Resolver(BankWithdrawal)
export class WithdrawalResolver {
  private bankService: BankService;

  private paymentService: PaymentService;

  constructor() {
    this.bankService = BankService.getInstance();
    this.paymentService = PaymentService.getInstance();
  }

  @Query(() => [Bank])
  async getNigerianBanks(): Promise<Bank[]> {
    try {
      return await this.bankService.getNigerianBanks();
    } catch (error) {
      throw new Error("Failed to fetch Nigerian banks");
    }
  }

  @Query(() => AccountDetails)
  async resolveAccountDetails(
    @Arg("input") input: AccountResolveInput
  ): Promise<AccountDetails> {
    try {
      const accountDetails = await this.bankService.resolveAccountNumber(
        input.accountNumber,
        input.bankCode
      );

      const data = {
        accountNumber: accountDetails.account_number as string,
        accountName: accountDetails.account_name as string,
        bankCode: accountDetails.bank_code as string,
      };

      return data;
    } catch (error) {
      throw new Error("Failed to resolve account details");
    }
  }

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
    const result = await prisma.$transaction(async (tx: PrismaClient) => {
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

  @Mutation(() => BankWithdrawal)
  @UseMiddleware(isAuthenticated)
  async confirmWithdrawal(
    @Arg("id", () => ID) id: string,
    @Ctx() { user }: GraphQLContext
  ): Promise<BankWithdrawal> {
    try {
      // Fetch the withdrawal record
      const withdrawal = await prisma.bankWithdrawal.findUnique({
        where: { id },
      });

      if (!withdrawal) {
        throw new Error("Withdrawal record not found");
      }

      if (withdrawal.userId !== user?.id) {
        throw new Error("Not authorized to confirm this withdrawal");
      }

      if (withdrawal.status !== BankWithdrawalStatus.PENDING) {
        throw new Error("Withdrawal is not in pending status");
      }

      // Initiate transfer via Paystack
      const transferResponse = await this.paymentService.initiateTransfer({
        amount: Number(withdrawal.amount),
        recipient: {
          accountNumber: withdrawal.accountNumber,
          bankCode: withdrawal.bankCode,
          accountName: withdrawal.accountName,
        },
        reference: withdrawal.reference as string,
      });

      if (!transferResponse.success) {
        // Update withdrawal status to failed
        const failedWithdrawal = await prisma.bankWithdrawal.update({
          where: { id },
          data: {
            status: BankWithdrawalStatus.FAILED,
            failureReason:
              transferResponse.error || "Transfer initiation failed",
          },
        });

        // Send failure notification
        await sendNotification({
          userId: user?.id as string,
          title: "Withdrawal Failed",
          message: `Your withdrawal of ${withdrawal.amount} ${withdrawal.currency} to ${withdrawal.bankName} account has failed. Reason: ${transferResponse.error}`,
          type: "TRANSACTION",
        });

        return failedWithdrawal;
      }

      // Update withdrawal status to processing
      const updatedWithdrawal = await prisma.bankWithdrawal.update({
        where: { id },
        data: {
          status: BankWithdrawalStatus.PROCESSING,
        },
      });

      // Send processing notification
      await sendNotification({
        userId: user?.id as string,
        title: "Withdrawal Processing",
        message: `Your withdrawal of ${withdrawal.amount} ${withdrawal.currency} to ${withdrawal.bankName} account is being processed.`,
        type: "TRANSACTION",
      });

      return updatedWithdrawal;
    } catch (error) {
      logger.error("Withdrawal confirmation error:", error);
      throw new Error(
        error instanceof Error ? error.message : "Failed to confirm withdrawal"
      );
    }
  }
}
