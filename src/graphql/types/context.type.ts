import { Request } from "express";
import { User } from "../../../src/generated/prisma-client";

export interface GraphQLContext {
  req: Request;
  user: Partial<User> | null;
}
