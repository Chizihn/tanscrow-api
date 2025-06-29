import {
  Arg,
  Ctx,
  Mutation,
  Query,
  Resolver,
  UseMiddleware,
} from "type-graphql";
import { prisma } from "../../config/db.config";
import { GraphQLContext } from "../types/context.type";
import { isAdmin, isAuthenticated } from "../middleware/auth.middleware";
import {
  VerificationDocument,
  SubmitVerificationDocumentInput,
  ReviewVerificationDocumentInput,
} from "../types/verification.type";
import { sendNotification } from "../../services/notification.service";
import { VerificationStatus } from "@prisma/client";

@Resolver(() => VerificationDocument)
export class VerificationResolver {
  @Query(() => [VerificationDocument], {
    description: "Retrieve verification documents for the authenticated user",
  })
  @UseMiddleware(isAuthenticated)
  async myVerificationDocuments(@Ctx() { user }: GraphQLContext) {
    return prisma.verificationDocument.findMany({
      where: { userId: user?.id },
      orderBy: { submittedAt: "desc" },
    });
  }

  @Query(() => [VerificationDocument], {
    description: "Retrieve pending verification documents for admin review",
  })
  @UseMiddleware(isAdmin)
  async pendingVerificationDocuments() {
    return prisma.verificationDocument.findMany({
      where: { verificationStatus: VerificationStatus.PENDING },
      orderBy: { submittedAt: "asc" },
    });
  }

  @Mutation(() => VerificationDocument, {
    description: "Submit a new verification document for review",
  })
  @UseMiddleware(isAuthenticated)
  async submitVerificationDocument(
    @Arg("input") input: SubmitVerificationDocumentInput,
    @Ctx() { user }: GraphQLContext
  ) {
    const document = await prisma.verificationDocument.create({
      data: {
        ...input,
        userId: user?.id as string,
        verificationStatus: VerificationStatus.PENDING,
      },
    });

    return document;
  }

  @Mutation(() => VerificationDocument, {
    description: "Review and update the status of a verification document",
  })
  @UseMiddleware(isAdmin)
  async reviewVerificationDocument(
    @Arg("input") input: ReviewVerificationDocumentInput
  ) {
    const { documentId, status, rejectionReason } = input;

    const document = await prisma.verificationDocument.update({
      where: { id: documentId },
      data: {
        verificationStatus: status,
        rejectionReason,
        verifiedAt: status === VerificationStatus.APPROVED ? new Date() : null,
      },
    });

    if (status === VerificationStatus.APPROVED) {
      await prisma.user.update({
        where: { id: document.userId },
        data: { verified: true },
      });

      // Send approval notification
      await sendNotification({
        userId: document.userId,
        title: "Verification Approved",
        message:
          "Your verification documents have been approved. Your account is now verified.",
        type: "VERIFICATION",
        entityId: documentId,
        entityType: "VerificationDocument",
      });
    } else if (status === "REJECTED") {
      // Send rejection notification
      await sendNotification({
        userId: document.userId,
        title: "Verification Rejected",
        message: `Your verification documents were rejected. Reason: ${rejectionReason}`,
        type: "VERIFICATION",
        entityId: documentId,
        entityType: "VerificationDocument",
      });
    }

    return document;
  }
}
