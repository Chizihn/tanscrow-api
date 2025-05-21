import { Field, InputType, Float } from "type-graphql";
import { PaymentCurrency, PaymentGateway } from "../../generated/prisma-client";

@InputType()
export class FundWalletInput {
  @Field(() => Float)
  amount!: number;

  @Field(() => PaymentCurrency)
  currency!: PaymentCurrency;

  @Field(() => PaymentGateway)
  paymentGateway!: PaymentGateway;
}
