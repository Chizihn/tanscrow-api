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

@Resolver(() => VerificationDocument)
export class VerificationResolver {
  @Query(() => [VerificationDocument])
  @UseMiddleware(isAuthenticated)
  async myVerificationDocuments(@Ctx() { user }: GraphQLContext) {
    return prisma.verificationDocument.findMany({
      where: { userId: user?.id },
      orderBy: { submittedAt: "desc" },
    });
  }

  @Query(() => [VerificationDocument])
  @UseMiddleware(isAdmin)
  async pendingVerificationDocuments() {
    return prisma.verificationDocument.findMany({
      where: { verificationStatus: "PENDING" },
      orderBy: { submittedAt: "asc" },
    });
  }

  @Mutation(() => VerificationDocument)
  @UseMiddleware(isAuthenticated)
  async submitVerificationDocument(
    @Arg("input") input: SubmitVerificationDocumentInput,
    @Ctx() { user }: GraphQLContext
  ) {
    const document = await prisma.verificationDocument.create({
      data: {
        ...input,
        userId: user?.id as string,
        verificationStatus: "PENDING",
      },
    });

    return document;
  }

  @Mutation(() => VerificationDocument)
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
        verifiedAt: status === "APPROVED" ? new Date() : null,
      },
    });

    if (status === "APPROVED") {
      await prisma.user.update({
        where: { id: document.userId },
        data: { verified: true },
      });
    }

    return document;
  }
}
