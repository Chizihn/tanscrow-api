import { MiddlewareFn } from "type-graphql";
import { GraphQLContext } from "../types/context.type";
import { NextFunction } from "express";

export const isVerified: MiddlewareFn<GraphQLContext> = async (
  { context },
  next: NextFunction
) => {
  if (!context.user) {
    throw new Error("Not authenticated");
  }

  if (!context.user.verified) {
    throw new Error(
      "User not verified. Please complete the verification process."
    );
  }

  return next();
};
