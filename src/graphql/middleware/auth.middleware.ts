import { MiddlewareFn } from "type-graphql";
import { GraphQLContext } from "../types/context.type";
import { NextFunction } from "express";
import { prisma } from "../../config/db.config";
import { AccountType, VerificationStatus } from "@prisma/client";

export const isAuthenticated: MiddlewareFn<GraphQLContext> = async (
  { context },
  next: NextFunction
) => {
  if (!context.user) {
    throw new Error("Not authenticated");
  }
  return next();
};

export const isVerified: MiddlewareFn<GraphQLContext> = async (
  { context },
  next: NextFunction
) => {
  if (!context.user || !context.user.verified) {
    throw new Error("You account hasn't been verified!");
  }
  return next();
};

export const isDocumentVerified: MiddlewareFn<GraphQLContext> = async (
  { context },
  next
) => {
  if (!context.user) {
    throw new Error("Not authenticated");
  }

  const verificationDocuments = await prisma.verificationDocument.findMany({
    where: { userId: context.user.id },
  });

  const hasApprovedDocument = verificationDocuments.some(
    (doc) => doc.verificationStatus === VerificationStatus.APPROVED
  );

  if (!hasApprovedDocument) {
    throw new Error(
      "You need to verify your identity to initiate a withdrawal!"
    );
  }

  return next();
};

export const isAdmin: MiddlewareFn<GraphQLContext> = async (
  { context },
  next
) => {
  if (!context.user || context.user.accountType !== AccountType.ADMIN) {
    throw new Error("Not authorized. You are not an admin!");
  }
  return next();
};
