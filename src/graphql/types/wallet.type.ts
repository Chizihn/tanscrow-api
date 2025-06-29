import {
  Field,
  ID,
  ObjectType,
  InputType,
  Float,
  registerEnumType,
} from "type-graphql";
import {
  WalletTransactionType,
  WalletTransactionStatus,
  PaymentCurrency,
} from "@prisma/client";
import { User } from "./user.type";
import { Decimal } from "@prisma/client/runtime/library";

// Register enums for GraphQL
registerEnumType(WalletTransactionType, {
  name: "WalletTransactionType",
  description: "The type of wallet transaction",
});

registerEnumType(WalletTransactionStatus, {
  name: "WalletTransactionStatus",
  description: "The status of wallet transaction",
});

registerEnumType(PaymentCurrency, {
  name: "PaymentCurrency",
  description: "The currency for payments",
});

@ObjectType()
export class Wallet {
  @Field(() => ID)
  id?: string;

  @Field(() => ID)
  userId?: string;

  @Field(() => PaymentCurrency)
  currency?: PaymentCurrency;

  @Field(() => Float)
  balance?: Decimal;

  @Field(() => Float)
  escrowBalance?: Decimal;

  @Field(() => Boolean)
  isActive?: boolean;

  @Field(() => Date)
  createdAt?: Date;

  @Field(() => Date)
  updatedAt?: Date;

  @Field(() => User)
  user?: User;

  @Field(() => [WalletTransaction])
  transactions?: WalletTransaction[];
}

@ObjectType({ description: "Details of a wallet transaction" })
export class WalletTransaction {
  @Field(() => ID)
  id?: string;

  @Field(() => ID)
  walletId?: string;

  @Field(() => Float)
  amount?: Decimal;

  @Field(() => PaymentCurrency)
  currency?: PaymentCurrency;

  @Field(() => WalletTransactionType)
  type?: WalletTransactionType;

  @Field(() => String)
  reference?: string;

  @Field(() => WalletTransactionStatus)
  status?: WalletTransactionStatus;

  @Field(() => String)
  description?: string;

  @Field(() => Float)
  balanceBefore?: Decimal;

  @Field(() => Float)
  balanceAfter?: Decimal;

  @Field(() => Date)
  createdAt?: Date;

  @Field(() => Date)
  updatedAt?: Date;

  @Field(() => Wallet)
  wallet?: Wallet;
}

@InputType()
export class CreateWalletInput {
  @Field(() => PaymentCurrency)
  currency?: PaymentCurrency;
}

// You'll also need this response type
@ObjectType()
export class PaymentInitiationResponse {
  @Field()
  success!: boolean;

  @Field({ nullable: true })
  redirectUrl?: string;

  @Field({ nullable: true })
  reference?: string;

  @Field({ nullable: true })
  error?: string;
}

@InputType()
export class WalletTransferInput {
  @Field(() => ID)
  transactionId!: string;

  @Field(() => Float)
  amount!: Decimal;

  @Field(() => PaymentCurrency)
  currency!: PaymentCurrency;

  @Field(() => WalletTransactionType)
  type!: WalletTransactionType;

  @Field(() => String, { nullable: true })
  description!: string;
}
