import { MiddlewareFn } from "type-graphql";
import { GraphQLContext } from "../types/context.type";
import { NextFunction } from "express";

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
    throw new Error("Not authorized");
  }
  return next();
};

// export const isDocumentVerified: MiddlewareFn<GraphQLContext> = async (
//   { context },
//   next
// ) => {
//   if (!context.user || context.user.) {
//     throw new Error("Not authorized");
//   }
//   return next();
// };

export const isAdmin: MiddlewareFn<GraphQLContext> = async (
  { context },
  next
) => {
  if (!context.user || context.user.accountType !== "ADMIN") {
    throw new Error("Not authorized");
  }
  return next();
};
