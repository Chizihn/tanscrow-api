import { MiddlewareFn } from "type-graphql";
import { GraphQLContext } from "../types/context.type";

export const isAuthenticated: MiddlewareFn<GraphQLContext> = async (
  { context },
  next
) => {
  if (!context.user) {
    throw new Error("Not authenticated");
  }
  return next();
};

export const isAdmin: MiddlewareFn<GraphQLContext> = async (
  { context },
  next
) => {
  if (!context.user || context.user.accountType !== "ADMIN") {
    throw new Error("Not authorized");
  }
  return next();
};
