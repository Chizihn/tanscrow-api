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
import { sendNotification } from "../../services/notification.service";

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

  @Query(() => [Review], { description: "Fetch reviews received by user" })
  @UseMiddleware(isAuthenticated)
  async userReviewsReceived(
    @Ctx() { user }: GraphQLContext
  ): Promise<Review[]> {
    return prisma.review.findMany({ where: { sellerId: user?.id } });
  }

  @Query(() => [Review], { description: "Fetch reviews given by user" })
  @UseMiddleware(isAuthenticated)
  async userReviewsGiven(@Ctx() { user }: GraphQLContext): Promise<Review[]> {
    return prisma.review.findMany({ where: { reviewerId: user?.id } });
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
    const review = await prisma.review.create({
      data: {
        ...input,
        reviewerId: user?.id as string,
      },
    });

    // Send notification to seller about new review
    await sendNotification({
      userId: input.sellerId,
      title: "New Review Received",
      message: `You have received a new ${review.rating}-star review from a buyer`,
      type: "REVIEW",
      entityId: review.id,
      entityType: "Review",
    });

    return review;
  }
}
