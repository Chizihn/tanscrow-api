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
} from "../types/admin.type";
import { User } from "../types/user.type";
import { Transaction } from "../types/transaction.type";
import { PrismaClient, Prisma } from "../../generated/prisma-client";

@Resolver()
export class AdminResolver {
  constructor(private prisma: PrismaClient) {}

  @Query(() => AdminDashboardStats)
  @UseMiddleware(isAdmin)
  async getAdminDashboardStats(): Promise<AdminDashboardStats> {
    const [totalUsers, totalTransactions, activeDisputes, transactions] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.transaction.count(),
        this.prisma.dispute.count({
          where: {
            status: {
              in: ["OPENED", "IN_REVIEW"],
            },
          },
        }),
        this.prisma.transaction.findMany({
          select: {
            amount: true,
          },
        }),
      ]);

    const totalTransactionVolume = transactions.reduce(
      (sum, transaction) => sum + Number(transaction.amount),
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
    return this.prisma.user.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  @Mutation(() => User)
  @UseMiddleware(isAdmin)
  async updateUserManagement(
    @Arg("input") input: UserManagementInput
  ): Promise<User> {
    return this.prisma.user.update({
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

    return this.prisma.transaction.findMany({
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

  @Mutation(() => Boolean)
  @UseMiddleware(isAdmin)
  async resolveDispute(
    @Arg("input") input: DisputeManagementInput
  ): Promise<boolean> {
    await this.prisma.dispute.update({
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
    return this.prisma.systemSetting.upsert({
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
    return this.prisma.systemSetting.findMany();
  }
}
