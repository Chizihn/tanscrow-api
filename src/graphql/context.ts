import { Request } from "express";
import { GraphQLContext } from "./types/context.type";
import { getUser } from "../middleware/auth.middleware";

export const createContext = async ({
  req,
}: {
  req: Request;
}): Promise<GraphQLContext> => {
  const user = await getUser(req);
  return { req, user };
};
