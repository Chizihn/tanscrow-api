import { Resolver, Query, Arg, Ctx, UseMiddleware } from "type-graphql";
import {
  TransactionReport,
  DisputeReport,
  UserActivityReport,
  FinancialSummary,
  ReportDateRangeInput,
} from "../types/report.type";
import { prisma } from "../../config/db.config";
import {
  TransactionStatus,
  Transaction,
  Dispute,
} from "../../generated/prisma-client";
import { GraphQLContext } from "../types/context.type";
import { isAdmin } from "../middleware/auth.middleware";

type StatusCount = {
  status: TransactionStatus;
  count: number;
};

type CurrencyBreakdownItem = {
  currency: string;
  totalAmount: number;
  transactionCount: number;
};

@Resolver()
export class ReportResolver {
  @Query(() => TransactionReport)
  @UseMiddleware(isAdmin)
  async transactionReport(
    @Arg("dateRange") dateRange: ReportDateRangeInput,
    @Ctx() {}: GraphQLContext
  ): Promise<TransactionReport> {
    const transactions: Transaction[] = await prisma.transaction.findMany({
      where: {
        createdAt: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
    });

    const totalTransactions = transactions.length;
    const totalAmount = transactions.reduce(
      (sum, t) => sum + t.amount.toNumber(),
      0
    );
    const totalEscrowFees = transactions.reduce(
      (sum, t) => sum + t.escrowFee.toNumber(),
      0
    );
    const completedTransactions = transactions.filter(
      (t) => t.status === TransactionStatus.COMPLETED
    ).length;
    const canceledTransactions = transactions.filter(
      (t) => t.status === TransactionStatus.CANCELED
    ).length;
    const disputedTransactions = transactions.filter(
      (t) => t.status === TransactionStatus.REFUND_REQUESTED
    ).length;

    const statusCounts: StatusCount[] = Object.values(TransactionStatus).map(
      (status) => ({
        status,
        count: transactions.filter((t) => t.status === status).length,
      })
    );

    return {
      totalTransactions,
      totalAmount,
      totalEscrowFees,
      completedTransactions,
      canceledTransactions,
      disputedTransactions,
      averageTransactionAmount: totalAmount / totalTransactions || 0,
      statusBreakdown: statusCounts,
    };
  }

  @Query(() => DisputeReport)
  @UseMiddleware(isAdmin)
  async disputeReport(
    @Arg("dateRange") dateRange: ReportDateRangeInput,
    @Ctx() {}: GraphQLContext
  ): Promise<DisputeReport> {
    const disputes = await prisma.transaction.findMany({
      where: {
        status: TransactionStatus.REFUND_REQUESTED,
        createdAt: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
    });

    const totalTransactions = await prisma.transaction.count({
      where: {
        createdAt: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
    });

    const resolvedDisputes = disputes.filter(
      (d: { status: TransactionStatus }) =>
        d.status === TransactionStatus.REFUNDED
    ).length;

    const totalDisputes = disputes.length;
    const pendingDisputes = totalDisputes - resolvedDisputes;
    const disputeRate = (totalDisputes / totalTransactions) * 100;

    const resolutionTimes: number[] = disputes
      .filter((d: { refundedAt: Date | null; createdAt: Date }) => d.refundedAt)
      .map((d: Dispute) => d.resolvedAt!.getTime() - d.createdAt.getTime());

    const averageResolutionTime =
      resolutionTimes.length > 0
        ? resolutionTimes.reduce((a, b) => a + b, 0) /
          (resolutionTimes.length * 3600000)
        : 0;

    return {
      totalDisputes,
      resolvedDisputes,
      pendingDisputes,
      averageResolutionTime,
      disputeRate,
    };
  }

  @Query(() => UserActivityReport)
  @UseMiddleware(isAdmin)
  async userActivityReport(
    @Arg("dateRange") dateRange: ReportDateRangeInput,
    @Ctx() {}: GraphQLContext
  ): Promise<UserActivityReport> {
    const totalUsers = await prisma.user.count();
    const newUsers = await prisma.user.count({
      where: {
        createdAt: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
    });

    const transactions = await prisma.transaction.findMany({
      where: {
        createdAt: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
      select: {
        buyerId: true,
        sellerId: true,
      },
    });

    const activeUserIds = new Set<string>(
      transactions.flatMap((t: any) => [t.buyerId, t.sellerId])
    );

    return {
      totalUsers,
      activeUsers: activeUserIds.size,
      newUsers,
      totalTransactions: transactions.length,
      averageTransactionsPerUser:
        transactions.length / (activeUserIds.size || 1),
    };
  }

  @Query(() => FinancialSummary)
  @UseMiddleware(isAdmin)
  async financialSummary(
    @Arg("dateRange") dateRange: ReportDateRangeInput,
    @Ctx() {}: GraphQLContext
  ): Promise<FinancialSummary> {
    const transactions = await prisma.transaction.findMany({
      where: {
        createdAt: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
        status: TransactionStatus.COMPLETED,
      },
      include: {
        payment: true,
      },
    });

    const totalRevenue = transactions.reduce(
      (sum: any, t: Transaction) => sum + t.amount.toNumber(),
      0
    );
    const totalEscrowFees = transactions.reduce(
      (sum: any, t: Transaction) => sum + t.escrowFee,
      0
    );
    const totalProcessingFees = transactions.reduce(
      (sum: number, t: { payment?: { fee: number } }) =>
        sum + (t.payment?.fee || 0),
      0
    );

    const currencyGroups = transactions.reduce(
      (
        groups: Record<string, CurrencyBreakdownItem>,
        t: { paymentCurrency: string; amount: { toNumber: () => number } }
      ) => {
        const currency = t.paymentCurrency;
        if (!groups[currency]) {
          groups[currency] = {
            currency,
            totalAmount: 0,
            transactionCount: 0,
          };
        }
        groups[currency].totalAmount += t.amount.toNumber();
        groups[currency].transactionCount += 1;
        return groups;
      },
      {} as Record<string, CurrencyBreakdownItem>
    );

    return {
      totalRevenue,
      totalEscrowFees,
      totalProcessingFees,
      averageTransactionValue: totalRevenue / transactions.length || 0,
      currencyBreakdown: Object.values(currencyGroups),
    };
  }
}
