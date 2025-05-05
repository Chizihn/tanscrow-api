import { isVerified } from "../../../graphql/middleware/verification.middleware";
import { GraphQLContext } from "../../../graphql/types/context.type";

describe("Verification Middleware", () => {
  let mockContext: Partial<GraphQLContext>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockNext = jest.fn();
  });

  it("should throw error when user is not authenticated", async () => {
    mockContext = { user: null };

    await expect(
      isVerified({ context: mockContext } as any, mockNext)
    ).rejects.toThrow("Not authenticated");

    expect(mockNext).not.toHaveBeenCalled();
  });

  it("should throw error when user is not verified", async () => {
    mockContext = {
      user: { verified: false },
    };

    await expect(
      isVerified({ context: mockContext } as any, mockNext)
    ).rejects.toThrow(
      "User not verified. Please complete the verification process."
    );

    expect(mockNext).not.toHaveBeenCalled();
  });

  it("should call next middleware when user is verified", async () => {
    mockContext = {
      user: { verified: true },
    };

    await isVerified({ context: mockContext } as any, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});
