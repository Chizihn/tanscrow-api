import { Field, ID, ObjectType, InputType, Int, Float } from "type-graphql";

@ObjectType()
export class AdminDashboardStats {
  @Field(() => Int)
  totalUsers!: number;

  @Field(() => Int)
  totalTransactions!: number;

  @Field(() => Int)
  activeDisputes!: number;

  @Field(() => Float)
  totalTransactionVolume!: number;
}

@InputType()
export class UserManagementInput {
  @Field(() => ID)
  userId!: string;

  @Field(() => Boolean, { nullable: true })
  verified?: boolean;

  @Field(() => String, { nullable: true })
  accountType?: string;
}

@InputType()
export class TransactionFilterInput {
  @Field(() => String, { nullable: true })
  status?: string;

  @Field(() => String, { nullable: true })
  escrowStatus?: string;

  @Field(() => Date, { nullable: true })
  startDate?: Date;

  @Field(() => Date, { nullable: true })
  endDate?: Date;

  @Field(() => Int, { nullable: true })
  page?: number;

  @Field(() => Int, { nullable: true })
  limit?: number;
}

@InputType()
export class DisputeManagementInput {
  @Field(() => ID)
  disputeId!: string;

  @Field(() => String)
  resolution!: string;

  @Field(() => String)
  status!: string;
}

@InputType()
export class SystemConfigInput {
  @Field(() => String)
  key!: string;

  @Field(() => String)
  value!: string;

  @Field(() => String, { nullable: true })
  description?: string;
}

@ObjectType()
export class SystemConfig {
  @Field(() => ID)
  id?: string;

  @Field(() => String)
  key?: string;

  @Field(() => String)
  value?: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => Date)
  createdAt?: Date;

  @Field(() => Date)
  updatedAt?: Date;
}
