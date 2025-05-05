import { VerificationResolver } from "../../../graphql/resolvers/verification.resolver";
import { prisma } from "../../../config/db.config";
import { GraphQLContext } from "../../../graphql/types/context.type";

jest.mock("../../../config/db.config");

describe("VerificationResolver", () => {
  let verificationResolver: VerificationResolver;
  let mockContext: Partial<GraphQLContext>;

  beforeEach(() => {
    verificationResolver = new VerificationResolver();
    mockContext = {
      user: { id: "test-user-id" },
    };

    (prisma.verificationDocument.findMany as jest.Mock).mockReset();
    (prisma.verificationDocument.create as jest.Mock).mockReset();
    (prisma.verificationDocument.update as jest.Mock).mockReset();
    (prisma.user.update as jest.Mock).mockReset();
  });

  describe("myVerificationDocuments", () => {
    it("should return user verification documents ordered by submission date", async () => {
      const mockDocuments = [
        { id: "1", documentType: "ID", verificationStatus: "PENDING" },
        { id: "2", documentType: "ADDRESS", verificationStatus: "APPROVED" },
      ];

      (prisma.verificationDocument.findMany as jest.Mock).mockResolvedValue(
        mockDocuments
      );

      const result = await verificationResolver.myVerificationDocuments(
        mockContext as GraphQLContext
      );

      expect(result).toEqual(mockDocuments);
      expect(prisma.verificationDocument.findMany).toHaveBeenCalledWith({
        where: { userId: "test-user-id" },
        orderBy: { submittedAt: "desc" },
      });
    });
  });

  describe("pendingVerificationDocuments", () => {
    it("should return pending verification documents ordered by submission date", async () => {
      const mockPendingDocs = [
        { id: "1", documentType: "ID", verificationStatus: "PENDING" },
        { id: "2", documentType: "ADDRESS", verificationStatus: "PENDING" },
      ];

      (prisma.verificationDocument.findMany as jest.Mock).mockResolvedValue(
        mockPendingDocs
      );

      const result = await verificationResolver.pendingVerificationDocuments();

      expect(result).toEqual(mockPendingDocs);
      expect(prisma.verificationDocument.findMany).toHaveBeenCalledWith({
        where: { verificationStatus: "PENDING" },
        orderBy: { submittedAt: "asc" },
      });
    });
  });

  describe("submitVerificationDocument", () => {
    it("should create a new verification document", async () => {
      const mockInput = {
        documentType: "ID",
        documentUrl: "https://example.com/doc.pdf",
      };

      const mockCreatedDoc = {
        ...mockInput,
        id: "test-doc-id",
        userId: "test-user-id",
        verificationStatus: "PENDING",
      };

      (prisma.verificationDocument.create as jest.Mock).mockResolvedValue(
        mockCreatedDoc
      );

      const result = await verificationResolver.submitVerificationDocument(
        mockInput as any,
        mockContext as GraphQLContext
      );

      expect(result).toEqual(mockCreatedDoc);
      expect(prisma.verificationDocument.create).toHaveBeenCalledWith({
        data: {
          ...mockInput,
          userId: "test-user-id",
          verificationStatus: "PENDING",
        },
      });
    });
  });

  describe("reviewVerificationDocument", () => {
    const mockInput = {
      documentId: "test-doc-id",
      status: "APPROVED" as const,
      rejectionReason: "",
    };

    it("should update document status and user verification status when approved", async () => {
      const mockUpdatedDoc = {
        ...mockInput,
        id: "test-doc-id",
        userId: "test-user-id",
        verificationStatus: "APPROVED",
        verifiedAt: new Date(),
      };

      (prisma.verificationDocument.update as jest.Mock).mockResolvedValue(
        mockUpdatedDoc
      );
      (prisma.user.update as jest.Mock).mockResolvedValue({
        id: "test-user-id",
        verified: true,
      });

      const result = await verificationResolver.reviewVerificationDocument(
        mockInput
      );

      expect(result).toEqual(mockUpdatedDoc);
      expect(prisma.verificationDocument.update).toHaveBeenCalledWith({
        where: { id: "test-doc-id" },
        data: {
          verificationStatus: "APPROVED",
          rejectionReason: null,
          verifiedAt: expect.any(Date),
        },
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "test-user-id" },
        data: { verified: true },
      });
    });

    it("should update document status with rejection reason when rejected", async () => {
      const mockRejectedInput = {
        documentId: "test-doc-id",
        status: "REJECTED" as const,
        rejectionReason: "Document unclear",
      };

      const mockUpdatedDoc = {
        ...mockRejectedInput,
        id: "test-doc-id",
        userId: "test-user-id",
        verificationStatus: "REJECTED",
        verifiedAt: null,
      };

      (prisma.verificationDocument.update as jest.Mock).mockResolvedValue(
        mockUpdatedDoc
      );

      const result = await verificationResolver.reviewVerificationDocument(
        mockRejectedInput
      );

      expect(result).toEqual(mockUpdatedDoc);
      expect(prisma.verificationDocument.update).toHaveBeenCalledWith({
        where: { id: "test-doc-id" },
        data: {
          verificationStatus: "REJECTED",
          rejectionReason: "Document unclear",
          verifiedAt: null,
        },
      });

      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
