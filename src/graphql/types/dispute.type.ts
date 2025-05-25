import {
  Field,
  ID,
  InputType,
  ObjectType,
  registerEnumType,
} from "type-graphql";
// import { DisputeStatus } from "@prisma/client";
import { User } from "./user.type";
import { Transaction } from "./transaction.type";
import { DisputeStatus } from "@prisma/client";

registerEnumType(DisputeStatus, {
  name: "DisputeStatus",
  description: "Status of a dispute",
});

@ObjectType()
export class DisputeEvidence {
  @Field(() => ID)
  id?: string;

  @Field(() => String)
  evidenceType?: string | null;

  @Field(() => String)
  evidenceUrl?: string | null;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => String)
  submittedBy!: string | null;

  @Field()
  createdAt?: Date;
}

@ObjectType()
export class Dispute {
  @Field(() => ID)
  id?: string;

  @Field(() => Transaction)
  transaction?: Partial<Transaction>;

  @Field(() => User)
  initiator?: User | null;

  @Field(() => User, { nullable: true })
  moderator?: User | null;

  @Field(() => DisputeStatus)
  status?: DisputeStatus;

  @Field(() => String)
  reason?: string | null;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => String, { nullable: true })
  resolution?: string | null;

  @Field(() => [DisputeEvidence])
  evidence?: DisputeEvidence[];

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => Date, { nullable: true })
  resolvedAt?: Date | null;
}

@InputType()
export class OpenDisputeInput {
  @Field()
  transactionId!: string;

  @Field(() => String)
  reason!: string;

  @Field(() => String)
  description!: string;
}

@InputType()
export class AddDisputeEvidenceInput {
  @Field()
  disputeId!: string;

  @Field(() => String)
  evidenceType!: string;

  @Field(() => String)
  evidenceUrl!: string;

  @Field({ nullable: true })
  description?: string;
}

@InputType()
export class ResolveDisputeInput {
  @Field()
  disputeId!: string;

  @Field(() => DisputeStatus)
  resolution!: DisputeStatus;

  @Field(() => String)
  resolutionDetails!: string;
}
