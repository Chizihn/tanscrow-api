import { Arg, Ctx, Query, Resolver, UseMiddleware } from "type-graphql";
import {
  UserDashboardSummary,
  UserWalletSummary,
} from "../types/dashboard.types";
import { isAuthenticated } from "../middleware/auth.middleware";
import {
  ReportDateRangeInput,
  TransactionStatusCount,
} from "../types/report.type";
import { GraphQLContext } from "../types/context.type";
import { Transaction, TransactionStatus } from "@prisma/client";
import { prisma } from "../../config/db.config";

@Resolver()
export class DashboardResolver {
  @Query(() => UserDashboardSummary)
  @UseMiddleware(isAuthenticated)
  async userDashboardSummary(
    @Ctx() { user }: GraphQLContext,
    @Arg("dateRange", { nullable: true }) dateRange?: ReportDateRangeInput
  ): Promise<UserDashboardSummary> {
    const defaultDateRange = {
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(),
    };

    const queryDateRange = dateRange || defaultDateRange;

    // Get user's transactions (both as buyer and seller)
    const userTransactions: Transaction[] = await prisma.transaction.findMany({
      where: {
        OR: [{ buyerId: user?.id }, { sellerId: user?.id }],
        createdAt: {
          gte: queryDateRange.startDate,
          lte: queryDateRange.endDate,
        },
      },
      include: {
        payment: true,
      },
    });

    const totalTransactions = userTransactions.length;
    const totalAmount = userTransactions.reduce(
      (sum, t) => sum + t.amount.toNumber(),
      0
    );

    // Calculate transactions by status
    const completedTransactions = userTransactions.filter(
      (t) => t.status === TransactionStatus.COMPLETED
    ).length;

    const activeTransactions = userTransactions.filter((t) =>
      [
        TransactionStatus.PENDING,
        TransactionStatus.IN_PROGRESS,
        TransactionStatus.COMPLETED,
        TransactionStatus.DELIVERED,
        TransactionStatus.CANCELED,
        TransactionStatus.FAILED,
        TransactionStatus.REFUND_REQUESTED,
        TransactionStatus.REFUNDED,
        TransactionStatus.DISPUTED,
      ].includes(t.status)
    ).length;

    const disputedTransactions = userTransactions.filter(
      (t) => t.status === TransactionStatus.REFUNDED
    ).length;

    const canceledTransactions = userTransactions.filter(
      (t) => t.status === TransactionStatus.CANCELED
    ).length;

    // Calculate role-specific stats
    const buyerTransactions = userTransactions.filter(
      (t) => t.buyerId === user?.id
    );
    const sellerTransactions = userTransactions.filter(
      (t) => t.sellerId === user?.id
    );

    const totalAmountAsBuyer = buyerTransactions.reduce(
      (sum, t) => sum + t.amount.toNumber(),
      0
    );

    const totalAmountAsSeller = sellerTransactions.reduce(
      (sum, t) => sum + t.amount.toNumber(),
      0
    );

    // Calculate total fees paid (as buyer) and earned (as seller)
    const totalFeesPaid = buyerTransactions.reduce(
      (sum, t) => sum + t.escrowFee.toNumber(),
      0
    );

    // Status breakdown for the user
    const statusCounts: TransactionStatusCount[] = Object.values(
      TransactionStatus
    )
      .map((status) => ({
        status,
        count: userTransactions.filter((t) => t.status === status).length,
      }))
      .filter((item) => item.count > 0); // Only include statuses with counts > 0

    // Get recent transactions (last 10)
    const recentTransactions = await prisma.transaction.findMany({
      where: {
        OR: [{ buyerId: user?.id }, { sellerId: user?.id }],
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
      include: {
        buyer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        seller: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    return {
      // Summary stats
      totalTransactions,
      activeTransactions,
      completedTransactions,
      disputedTransactions,
      canceledTransactions,

      // Financial stats
      totalAmount,
      totalAmountAsBuyer,
      totalAmountAsSeller,
      totalFeesPaid,
      averageTransactionAmount: totalAmount / totalTransactions || 0,

      // Role-based stats
      transactionsAsBuyer: buyerTransactions.length,
      transactionsAsSeller: sellerTransactions.length,

      // Breakdowns
      statusBreakdown: statusCounts,
      recentTransactions: recentTransactions.map((transaction) => ({
        id: transaction.id,
        title: transaction.title,
        amount: transaction.amount.toNumber(),
        status: transaction.status,
        createdAt: transaction.createdAt,
        role: transaction.buyerId === user?.id ? "BUYER" : "SELLER",
        counterparty:
          transaction.buyerId === user?.id
            ? `${transaction.seller.firstName} ${transaction.seller.lastName}`
            : `${transaction.buyer.firstName} ${transaction.buyer.lastName}`,
      })),

      // Date range used for the query
      dateRange: {
        startDate: queryDateRange.startDate,
        endDate: queryDateRange.endDate,
      },
    };
  }

  @Query(() => UserWalletSummary)
  @UseMiddleware(isAuthenticated)
  async userWalletSummary(
    @Ctx() { user }: GraphQLContext
  ): Promise<UserWalletSummary> {
    // Get user's wallet information
    const wallet = await prisma.wallet.findUnique({
      where: { userId: user?.id },
    });

    if (!wallet) {
      throw new Error("Wallet not found for user");
    }

    // Get recent wallet transactions
    const recentWalletTransactions = await prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    // Calculate total money in escrow (from active transactions where user is buyer)
    const escrowBalance = await prisma.transaction.aggregate({
      where: {
        buyerId: user?.id,
        status: {
          in: [
            TransactionStatus.PENDING,
            TransactionStatus.IN_PROGRESS,
            TransactionStatus.COMPLETED,
          ],
        },
      },
      _sum: {
        amount: true,
      },
    });

    return {
      availableBalance: wallet.balance.toNumber(),
      escrowBalance: escrowBalance._sum.amount?.toNumber() || 0,
      totalBalance:
        wallet.balance.toNumber() +
        (escrowBalance._sum.amount?.toNumber() || 0),
      currency: wallet.currency,
      recentTransactions: recentWalletTransactions.map((wt) => ({
        id: wt.id,
        type: wt.type,
        amount: wt.amount.toNumber(),
        description: wt.description,
        createdAt: wt.createdAt,
      })),
    };
  }
}
