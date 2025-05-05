import {
  Arg,
  Authorized,
  Ctx,
  Field,
  InputType,
  Int,
  ObjectType,
  Query,
  Resolver,
  UseMiddleware,
} from "type-graphql";
import { AuditLog } from "../types/audit-log.type";
import { AuditAction, AuditCategory } from "../../generated/prisma-client";
import { GraphQLContext } from "../types/context.type";
import { prisma } from "../../config/db.config";
import { isAdmin } from "../middleware/auth.middleware";

@InputType()
class AuditLogFilter {
  @Field(() => String, { nullable: true })
  userId?: string;

  @Field(() => String, { nullable: true })
  entityId?: string;

  @Field(() => String, { nullable: true })
  entityType?: string;

  @Field(() => AuditAction, { nullable: true })
  action?: AuditAction;

  @Field(() => AuditCategory, { nullable: true })
  category?: AuditCategory;

  @Field(() => Date, { nullable: true })
  startDate?: Date;

  @Field(() => Date, { nullable: true })
  endDate?: Date;
}

@ObjectType()
class AuditLogConnection {
  @Field(() => [AuditLog])
  items?: AuditLog[];

  @Field(() => Int)
  total?: number;

  @Field(() => Boolean)
  hasMore?: boolean;
}

@Resolver()
export class AuditLogResolver {
  @UseMiddleware(isAdmin)
  @Query(() => AuditLogConnection)
  async getAuditLogs(
    @Ctx() {}: GraphQLContext,
    @Arg("filter", { nullable: true }) filter?: AuditLogFilter,
    @Arg("skip", () => Int, { nullable: true }) skip?: number,
    @Arg("take", () => Int, { nullable: true }) take: number = 20
  ): Promise<AuditLogConnection> {
    const where = {
      ...(filter?.userId && { userId: filter.userId }),
      ...(filter?.entityId && { entityId: filter.entityId }),
      ...(filter?.entityType && { entityType: filter.entityType }),
      ...(filter?.action && { action: filter.action }),
      ...(filter?.category && { category: filter.category }),
      ...(filter?.startDate &&
        filter?.endDate && {
          createdAt: {
            gte: filter.startDate,
            lte: filter.endDate,
          },
        }),
    };

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: take + 1,
        orderBy: { createdAt: "desc" },
      }),
      prisma.auditLog.count({ where }),
    ]);

    const hasMore = items.length > take;
    const auditLogs = hasMore ? items.slice(0, take) : items;

    return {
      items: auditLogs,
      total,
      hasMore,
    };
  }
}
