import { Field, Float, Int, ObjectType, registerEnumType } from "type-graphql";
import {
  DateRangeOutput,
  ReportDateRangeInput,
  TransactionStatusCount,
} from "./report.type";
import { TransactionStatus } from "@prisma/client";

registerEnumType(TransactionStatusCount, {
  name: "TransactionStatusCount",
  description: "tatys",
});

@ObjectType()
export class UserDashboardSummary {
  @Field(() => Int)
  totalTransactions?: number;

  @Field(() => Int)
  activeTransactions?: number;

  @Field(() => Int)
  completedTransactions?: number;

  @Field(() => Int)
  disputedTransactions?: number;

  @Field(() => Int)
  canceledTransactions?: number;

  @Field(() => Float)
  totalAmount?: number;

  @Field(() => Float)
  totalAmountAsBuyer?: number;

  @Field(() => Float)
  totalAmountAsSeller?: number;

  @Field(() => Float)
  totalFeesPaid?: number;

  @Field(() => Float)
  averageTransactionAmount?: number;

  @Field(() => Int)
  transactionsAsBuyer?: number;

  @Field(() => Int)
  transactionsAsSeller?: number;

  @Field(() => [TransactionStatusCount])
  statusBreakdown?: TransactionStatusCount[];

  @Field(() => [RecentTransaction])
  recentTransactions?: RecentTransaction[];

  @Field(() => DateRangeOutput)
  dateRange?: DateRangeOutput;
}

@ObjectType()
export class RecentTransaction {
  @Field(() => String)
  id?: string;

  @Field(() => String)
  title?: string;

  @Field(() => Float)
  amount?: number;

  @Field(() => TransactionStatus)
  status?: TransactionStatus;

  @Field(() => Date)
  createdAt?: Date;

  @Field(() => String)
  role?: string; // 'BUYER' or 'SELLER'

  @Field(() => String)
  counterparty?: string; // Other party's name
}

@ObjectType()
export class UserWalletSummary {
  @Field(() => Float)
  availableBalance?: number;

  @Field(() => Float)
  escrowBalance?: number;

  @Field(() => Float)
  totalBalance?: number;

  @Field(() => String)
  currency?: string;

  @Field(() => [RecentWalletTransaction])
  recentTransactions?: RecentWalletTransaction[];
}

@ObjectType()
export class RecentWalletTransaction {
  @Field(() => String)
  id?: string;

  @Field(() => String)
  type?: string;

  @Field(() => Float)
  amount?: number;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => Date)
  createdAt?: Date;
}
