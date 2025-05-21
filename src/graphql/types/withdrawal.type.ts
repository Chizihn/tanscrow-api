import {
  Field,
  Float,
  ID,
  InputType,
  ObjectType,
  registerEnumType,
} from "type-graphql";
import {
  BankWithdrawalStatus,
  PaymentCurrency,
} from "../../generated/prisma-client";
import { Decimal } from "../../generated/prisma-client/runtime/library";

registerEnumType(BankWithdrawalStatus, {
  name: "BankWithdrawalStatus",
  description: "The status of a bank withdrawal request",
});

@ObjectType()
export class BankWithdrawal {
  @Field(() => ID)
  id?: string;

  @Field(() => String)
  userId?: string;

  @Field(() => String)
  bankName?: string;

  @Field(() => String)
  accountNumber?: string;

  @Field(() => String)
  accountName?: string;

  @Field(() => String)
  bankCode?: string;

  @Field(() => Float)
  amount?: Decimal;

  @Field(() => PaymentCurrency)
  currency?: PaymentCurrency;

  @Field(() => String, { nullable: true })
  reference?: string;

  @Field(() => BankWithdrawalStatus)
  status?: BankWithdrawalStatus;

  @Field(() => String, { nullable: true })
  failureReason?: string | null;

  @Field(() => Date)
  createdAt?: Date;

  @Field(() => Date)
  updatedAt?: Date;
}

@InputType()
export class WithdrawToNigerianBankInput {
  @Field(() => String)
  bankName!: string;

  @Field(() => String)
  accountNumber!: string;

  @Field(() => String)
  accountName!: string;

  @Field(() => String)
  bankCode!: string;

  @Field(() => Float)
  amount!: Decimal;

  @Field(() => PaymentCurrency)
  currency!: PaymentCurrency;
}
