import { Request } from "express";
import jwt from "jsonwebtoken";
import config from "../config/app.config";
import { prisma } from "../config/db.config";
import { GraphQLContext } from "../graphql/types/context.type";

export const getUser = async (req: Request) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return null;
    }

    const decoded = jwt.verify(token, config.JWT_SECRET) as { userId: string };
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    return user;
  } catch (error) {
    return null;
  }
};

export const createGraphQLContext = async ({
  req,
}: {
  req: Request;
}): Promise<GraphQLContext> => {
  const user = await getUser(req);
  return { req, user };
};
