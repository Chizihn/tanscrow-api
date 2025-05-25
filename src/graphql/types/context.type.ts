import { Request } from "express";
import { User } from "@prisma/client";

export interface GraphQLContext {
  req: Request;
  user: Partial<User> | null;
}
