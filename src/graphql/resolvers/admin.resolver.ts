import {
  Resolver,
  Query,
  Mutation,
  Arg,
  Ctx,
  UseMiddleware,
} from "type-graphql";
import { isAdmin } from "../middleware/auth.middleware";
import {
  AdminDashboardStats,
  UserManagementInput,
  TransactionFilterInput,
  DisputeManagementInput,
  SystemConfigInput,
  SystemConfig,
  DisputeFilterInput,
  WithdrawalFilterInput,
} from "../types/admin.type";
import { User } from "../types/user.type";
import { Transaction } from "../types/transaction.type";
import { AccountType, DisputeStatus, Prisma } from "@prisma/client";
import { Dispute } from "../types/dispute.type";
import { WalletTransaction } from "../types/wallet.type";
import { prisma } from "../../config/db.config";

@Resolver()
export class AdminResolver {

  @Query(() => AdminDashboardStats)
  @UseMiddleware(isAdmin)
  async getAdminDashboardStats(): Promise<AdminDashboardStats> {
    const [totalUsers, totalTransactions, activeDisputes, transactions] =
      await Promise.all([
        prisma.user.count({
          where: {
            accountType: AccountType.USER,
          },
        }),
        prisma.transaction.count(),
        prisma.dispute.count({
          where: {
            status: {
              in: [DisputeStatus.OPENED , DisputeStatus.IN_REVIEW],
            },
          },
        }),
        prisma.transaction.findMany({
          select: {
            amount: true,
          },
        }),
      ]);

    const totalTransactionVolume = transactions.reduce(
      (sum: number, transaction: Transaction) =>
        sum + Number(transaction.amount),
      0
    );

    return {
      totalUsers,
      totalTransactions,
      activeDisputes,
      totalTransactionVolume,
    };
  }

  @Query(() => [User])
  @UseMiddleware(isAdmin)
  async getAllUsers(
    @Arg("page", () => Number, { nullable: true }) page: number = 1,
    @Arg("limit", () => Number, { nullable: true }) limit: number = 10
  ): Promise<User[]> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
  
    const users = await prisma.user.findMany({
      where: {
        accountType: AccountType.USER,
      },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
      orderBy: {
        createdAt: "desc",
      },
    });
  
    return users;
  }
  

  @Mutation(() => User)
  @UseMiddleware(isAdmin)
  async updateUserManagement(
    @Arg("input") input: UserManagementInput
  ): Promise<User> {
    return prisma.user.update({
      where: { id: input.userId },
      data: {
        verified: input.verified,
        accountType: input.accountType as any,
      },
    });
  }

  @Query(() => [Transaction])
  @UseMiddleware(isAdmin)
  async getFilteredTransactions(
    @Arg("filter") filter: TransactionFilterInput
  ): Promise<Transaction[]> {
    const where: Prisma.TransactionWhereInput = {};

    if (filter.status) {
      where.status = filter.status as any;
    }

    if (filter.escrowStatus) {
      where.escrowStatus = filter.escrowStatus as any;
    }

    if (filter.startDate) {
      where.createdAt = {
        gte: filter.startDate,
      };
    }

    if (filter.endDate) {
      where.createdAt = {
        ...(where.createdAt as Date),
        lte: filter.endDate,
      };
    }

    return prisma.transaction.findMany({
      where,
      skip: ((filter.page || 1) - 1) * (filter.limit || 10),
      take: filter.limit || 10,
      include: {
        buyer: true,
        seller: true,
        payment: true,
        logs: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  @Query(() => [Dispute])
  @UseMiddleware(isAdmin)
  async getFilteredDisputes(
    @Arg("filter") filter: DisputeFilterInput
  ): Promise<Dispute[]> {
    const where: Prisma.DisputeWhereInput = {};

    if (filter.status) {
      where.status = filter.status as any;
    }

    if (filter.startDate) {
      where.createdAt = {
        gte: filter.startDate,
      };
    }

    if (filter.endDate) {
      where.createdAt = {
        ...(where.createdAt as Date),
        lte: filter.endDate,
      };
    }

    return prisma.dispute.findMany({
      where,
      skip: ((filter.page || 1) - 1) * (filter.limit || 10),
      take: filter.limit || 10,
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  @Query(() => [WalletTransaction])
  @UseMiddleware(isAdmin)
  async getFilteredWithdrawals(
    @Arg("filter") filter: WithdrawalFilterInput
  ): Promise<WalletTransaction[]> {
    const where: Prisma.WalletTransactionWhereInput = {};

    if (filter.status) {
      where.status = filter.status as any;
    }

    if (filter.startDate) {
      where.createdAt = {
        gte: filter.startDate,
      };
    }

    if (filter.endDate) {
      where.createdAt = {
        ...(where.createdAt as Date),
        lte: filter.endDate,
      };
    }

    return prisma.walletTransaction.findMany({
      where,
      skip: ((filter.page || 1) - 1) * (filter.limit || 10),
      include: {
        wallet: true,
      },
      take: filter.limit || 10,
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  @Mutation(() => Boolean)
  @UseMiddleware(isAdmin)
  async resolveDispute(
    @Arg("input") input: DisputeManagementInput
  ): Promise<boolean> {
    await prisma.dispute.update({
      where: { id: input.disputeId },
      data: {
        resolution: input.resolution,
        status: input.status as any,
        resolvedAt: new Date(),
      },
    });

    return true;
  }

  @Mutation(() => SystemConfig)
  @UseMiddleware(isAdmin)
  async updateSystemConfig(
    @Arg("input") input: SystemConfigInput
  ): Promise<SystemConfig> {
    return prisma.systemSetting.upsert({
      where: { key: input.key },
      update: {
        value: input.value,
        description: input.description,
      },
      create: {
        key: input.key,
        value: input.value,
        description: input.description,
      },
    });
  }

  @Query(() => [SystemConfig])
  @UseMiddleware(isAdmin)
  async getSystemConfigs(): Promise<SystemConfig[]> {
    return prisma.systemSetting.findMany();
  }
}
