import { ReviewResolver } from "../../../graphql/resolvers/review.resolver";
import { PrismaClient } from "@prisma/client";
import { GraphQLContext } from "../../../graphql/types/context.type";

// Create proper mock type for PrismaClient
type MockPrismaClient = {
  review: {
    findMany: jest.Mock;
    create: jest.Mock;
  };
  user: {
    findUnique: jest.Mock;
  };
};

jest.mock("../../../generated/prisma-client");

describe("ReviewResolver", () => {
  let reviewResolver: ReviewResolver;
  let mockPrismaClient: MockPrismaClient;
  let mockContext: Partial<GraphQLContext>;

  beforeEach(() => {
    // Create the mock with the correct structure
    mockPrismaClient = {
      review: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };

    // Set the mocked prisma client
    (PrismaClient as jest.MockedClass<typeof PrismaClient>).mockImplementation(
      () => mockPrismaClient as unknown as PrismaClient
    );

    mockContext = {
      user: { id: "test-user-id" },
    };

    reviewResolver = new ReviewResolver();
  });

  describe("getSellerReviews", () => {
    it("should return seller reviews ordered by creation date", async () => {
      const mockReviews = [
        { id: "1", rating: 5, comment: "Great seller!" },
        { id: "2", rating: 4, comment: "Good experience" },
      ];

      mockPrismaClient.review.findMany.mockResolvedValue(mockReviews);

      const result = await reviewResolver.getSellerReviews("test-seller-id");

      expect(result).toEqual(mockReviews);
      expect(mockPrismaClient.review.findMany).toHaveBeenCalledWith({
        where: { sellerId: "test-seller-id" },
        orderBy: { createdAt: "desc" },
      });
    });
  });

  describe("createReview", () => {
    const mockInput = {
      sellerId: "test-seller-id",
      rating: 5,
      comment: "Excellent service!",
    };

    it("should throw error if seller does not exist", async () => {
      mockPrismaClient.user.findUnique.mockResolvedValue(null);

      await expect(
        reviewResolver.createReview(mockInput, mockContext as GraphQLContext)
      ).rejects.toThrow("Seller not found");

      expect(mockPrismaClient.review.create).not.toHaveBeenCalled();
    });

    it("should create review successfully", async () => {
      const mockSeller = { id: "test-seller-id" };
      const mockCreatedReview = {
        ...mockInput,
        id: "test-review-id",
        reviewerId: "test-user-id",
      };

      mockPrismaClient.user.findUnique.mockResolvedValue(mockSeller);
      mockPrismaClient.review.create.mockResolvedValue(mockCreatedReview);

      const result = await reviewResolver.createReview(
        mockInput,
        mockContext as GraphQLContext
      );

      expect(result).toEqual(mockCreatedReview);
      expect(mockPrismaClient.review.create).toHaveBeenCalledWith({
        data: {
          ...mockInput,
          reviewerId: "test-user-id",
        },
      });
    });
  });
});
