import {
  Arg,
  Ctx,
  Mutation,
  Query,
  Resolver,
  UseMiddleware,
} from "type-graphql";
import { Review, CreateReviewInput } from "../types/review.type";
import { GraphQLContext } from "../types/context.type";
import { isAuthenticated } from "../middleware/auth.middleware";
import { PrismaClient } from "../../generated/prisma-client";

const prisma = new PrismaClient();

@Resolver(() => Review)
export class ReviewResolver {
  @Query(() => [Review])
  async getSellerReviews(@Arg("sellerId") sellerId: string) {
    return prisma.review.findMany({
      where: { sellerId },
      orderBy: { createdAt: "desc" },
    });
  }

  @Mutation(() => Review)
  @UseMiddleware(isAuthenticated)
  async createReview(
    @Arg("input") input: CreateReviewInput,
    @Ctx() ctx: GraphQLContext
  ) {
    const { user } = ctx;

    // Check if the seller exists
    const seller = await prisma.user.findUnique({
      where: { id: input.sellerId },
    });

    if (!seller) {
      throw new Error("Seller not found");
    }

    // Create the review
    return prisma.review.create({
      data: {
        ...input,
        reviewerId: user?.id as string,
      },
    });
  }
}
