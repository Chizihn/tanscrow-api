import {
  Arg,
  Ctx,
  Mutation,
  Query,
  Resolver,
  UseMiddleware,
} from "type-graphql";
import {
  Dispute,
  OpenDisputeInput,
  AddDisputeEvidenceInput,
  ResolveDisputeInput,
} from "../types/dispute.type";
import {
  DisputeStatus,
  NotificationType,
  PrismaClient,
  TransactionStatus,
} from "../../generated/prisma-client";
import { GraphQLContext } from "../types/context.type";
import { prisma } from "../../config/db.config";
import { isAdmin, isAuthenticated } from "../middleware/auth.middleware";

@Resolver(Dispute)
export class DisputeResolver {
  @Query(() => [Dispute])
  @UseMiddleware(isAuthenticated)
  async disputes(@Ctx() { user }: GraphQLContext): Promise<Dispute[]> {
    return prisma.dispute.findMany({
      where: {
        OR: [
          { initiatorId: user?.id },
          { moderatorId: user?.id },
          {
            transaction: {
              OR: [{ buyerId: user?.id }, { sellerId: user?.id }],
            },
          },
        ],
      },
      include: {
        transaction: true,
        initiator: true,
        moderator: true,
        evidence: true,
      },
    });
  }

  @Query(() => Dispute)
  @UseMiddleware(isAuthenticated)
  async dispute(
    @Arg("id") id: string,
    @Ctx() { user }: GraphQLContext
  ): Promise<Dispute> {
    const dispute = await prisma.dispute.findUnique({
      where: { id },
      include: {
        transaction: true,
        initiator: true,
        moderator: true,
        evidence: true,
      },
    });

    if (!dispute) {
      throw new Error("Dispute not found");
    }

    const hasAccess = [
      dispute.initiatorId,
      dispute.moderatorId,
      dispute.transaction.buyerId,
      dispute.transaction.sellerId,
    ].includes(user?.id as string);

    if (!hasAccess) {
      throw new Error("Unauthorized access to dispute");
    }

    return dispute;
  }

  @Mutation(() => Dispute)
  @UseMiddleware(isAuthenticated)
  async openDispute(
    @Arg("input") input: OpenDisputeInput,
    @Ctx() { user }: GraphQLContext
  ): Promise<Dispute> {
    const transaction = await prisma.transaction.findUnique({
      where: { id: input.transactionId },
    });

    if (!transaction) {
      throw new Error("Transaction not found");
    }

    if (transaction.buyerId !== user?.id && transaction.sellerId !== user?.id) {
      throw new Error("Unauthorized to open dispute for this transaction");
    }

    if (transaction.status === TransactionStatus.DISPUTED) {
      throw new Error("Dispute already exists for this transaction");
    }

    const dispute = await prisma.$transaction(async (tx: PrismaClient) => {
      const createdDispute = await tx.dispute.create({
        data: {
          transactionId: input.transactionId,
          initiatorId: user?.id ?? "",
          reason: input.reason,
          description: input.description,
          status: DisputeStatus.OPENED,
        },
        include: {
          transaction: true,
          initiator: true,
          evidence: true,
        },
      });

      await tx.transaction.update({
        where: { id: input.transactionId },
        data: { status: TransactionStatus.DISPUTED },
      });

      const notifyUserId =
        transaction.buyerId === user?.id
          ? transaction.sellerId
          : transaction.buyerId;

      await tx.notification.create({
        data: {
          userId: notifyUserId,
          title: "New Dispute Opened",
          message: `A dispute has been opened for transaction ${transaction.transactionCode}`,
          type: NotificationType.DISPUTE,
          relatedEntityId: createdDispute.id,
          relatedEntityType: "Dispute",
        },
      });

      return createdDispute;
    });

    return dispute;
  }

  @Mutation(() => Dispute)
  @UseMiddleware(isAuthenticated)
  async addDisputeEvidence(
    @Arg("input") input: AddDisputeEvidenceInput,
    @Ctx() { user }: GraphQLContext
  ): Promise<Dispute> {
    const dispute = await prisma.dispute.findUnique({
      where: { id: input.disputeId },
      include: { transaction: true },
    });

    if (!dispute) {
      throw new Error("Dispute not found");
    }

    if (
      ![
        dispute.initiatorId,
        dispute.transaction.buyerId,
        dispute.transaction.sellerId,
      ].includes(user?.id as string)
    ) {
      throw new Error("Unauthorized to add evidence to this dispute");
    }

    if (dispute.status === DisputeStatus.CLOSED) {
      throw new Error("Cannot add evidence to a closed dispute");
    }

    return prisma.dispute.update({
      where: { id: input.disputeId },
      data: {
        evidence: {
          create: {
            evidenceType: input.evidenceType as string,
            evidenceUrl: input.evidenceUrl as string,
            description: input.description as string,
            submittedBy: user?.id as string,
          },
        },
      },
      include: {
        transaction: true,
        initiator: true,
        moderator: true,
        evidence: true,
      },
    });
  }

  @Mutation(() => Dispute)
  @UseMiddleware(isAdmin)
  async resolveDispute(
    @Arg("input") input: ResolveDisputeInput,
    @Ctx() { user }: GraphQLContext
  ): Promise<Dispute> {
    const dispute = await prisma.dispute.findUnique({
      where: { id: input.disputeId },
      include: { transaction: true },
    });

    if (!dispute) {
      throw new Error("Dispute not found");
    }

    if (dispute.status === DisputeStatus.CLOSED) {
      throw new Error("Dispute is already closed");
    }

    const updatedDispute = await prisma.$transaction(
      async (tx: PrismaClient) => {
        const resolved = await tx.dispute.update({
          where: { id: input.disputeId },
          data: {
            status: input.resolution,
            resolution: input.resolutionDetails,
            resolvedAt: new Date(),
            moderatorId: user?.id,
          },
          include: {
            transaction: true,
            initiator: true,
            moderator: true,
            evidence: true,
          },
        });

        await tx.notification.createMany({
          data: [
            {
              userId: dispute.transaction.buyerId,
              title: "Dispute Resolution",
              message: `The dispute for transaction ${dispute.transaction.transactionCode} has been resolved`,
              type: NotificationType.DISPUTE,
              relatedEntityId: dispute.id,
              relatedEntityType: "Dispute",
            },
            {
              userId: dispute.transaction.sellerId,
              title: "Dispute Resolution",
              message: `The dispute for transaction ${dispute.transaction.transactionCode} has been resolved`,
              type: NotificationType.DISPUTE,
              relatedEntityId: dispute.id,
              relatedEntityType: "Dispute",
            },
          ],
        });

        return resolved;
      }
    );

    return updatedDispute;
  }
}
