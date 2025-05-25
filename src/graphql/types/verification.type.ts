import { Field, ObjectType, InputType, registerEnumType } from "type-graphql";
import { DocumentType, VerificationStatus } from "@prisma/client";

registerEnumType(DocumentType, {
  name: "DocumentType",
  description: "Types of documents accepted for verification",
});

registerEnumType(VerificationStatus, {
  name: "VerificationStatus",
  description: "Status of verification document review",
});

@ObjectType()
export class VerificationDocument {
  @Field()
  id?: string;

  @Field()
  userId?: string;

  @Field(() => DocumentType)
  documentType?: DocumentType;

  @Field(() => String)
  documentNumber?: string;

  @Field(() => String)
  documentUrl?: string;

  @Field(() => VerificationStatus)
  verificationStatus?: VerificationStatus;

  @Field()
  submittedAt?: Date;

  @Field({ nullable: true })
  verifiedAt?: Date;

  @Field({ nullable: true })
  rejectionReason?: string;

  @Field()
  createdAt?: Date;

  @Field()
  updatedAt?: Date;
}

@InputType()
export class SubmitVerificationDocumentInput {
  @Field(() => DocumentType)
  documentType!: DocumentType;

  @Field(() => String)
  documentNumber!: string;

  @Field(() => String)
  documentUrl!: string;
}

@InputType()
export class ReviewVerificationDocumentInput {
  @Field()
  documentId?: string;

  @Field(() => VerificationStatus)
  status?: VerificationStatus;

  @Field({ nullable: true })
  rejectionReason?: string;
}
