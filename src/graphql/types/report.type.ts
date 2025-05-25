import { Field, ObjectType, InputType, Float, Int } from "type-graphql";
import { TransactionStatus, EscrowStatus } from "@prisma/client";

@ObjectType()
export class TransactionReport {
  @Field(() => Int)
  totalTransactions!: number;

  @Field(() => Float)
  totalAmount!: number;

  @Field(() => Float)
  totalEscrowFees!: number;

  @Field(() => Int)
  completedTransactions!: number;

  @Field(() => Int)
  canceledTransactions!: number;

  @Field(() => Int)
  disputedTransactions!: number;

  @Field(() => Float)
  averageTransactionAmount!: number;

  @Field(() => [TransactionStatusCount])
  statusBreakdown!: TransactionStatusCount[];
}

@ObjectType()
export class TransactionStatusCount {
  @Field(() => TransactionStatus)
  status!: TransactionStatus;

  @Field(() => Int)
  count!: number;
}

@ObjectType()
export class DisputeReport {
  @Field(() => Int)
  totalDisputes!: number;

  @Field(() => Int)
  resolvedDisputes!: number;

  @Field(() => Int)
  pendingDisputes!: number;

  @Field(() => Float)
  averageResolutionTime!: number;

  @Field(() => Float)
  disputeRate!: number;
}

@ObjectType()
export class UserActivityReport {
  @Field(() => Int)
  totalUsers!: number;

  @Field(() => Int)
  activeUsers!: number;

  @Field(() => Int)
  newUsers!: number;

  @Field(() => Int)
  totalTransactions!: number;

  @Field(() => Float)
  averageTransactionsPerUser!: number;
}

@ObjectType()
export class FinancialSummary {
  @Field(() => Float)
  totalRevenue!: number;

  @Field(() => Float)
  totalEscrowFees!: number;

  @Field(() => Float)
  totalProcessingFees!: number;

  @Field(() => Float)
  averageTransactionValue!: number;

  @Field(() => [CurrencyBreakdown])
  currencyBreakdown!: CurrencyBreakdown[];
}

@ObjectType()
export class CurrencyBreakdown {
  @Field(() => String)
  currency!: string;

  @Field(() => Float)
  totalAmount!: number;

  @Field(() => Int)
  transactionCount!: number;
}

@InputType()
export class ReportDateRangeInput {
  @Field(() => Date)
  startDate!: Date;

  @Field(() => Date)
  endDate!: Date;
}
