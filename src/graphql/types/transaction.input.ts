import { Field, ID, InputType } from "type-graphql";
import { DeliveryMethod } from "../../generated/prisma-client";

@InputType()
export class UpdateDeliveryInput {
  @Field(() => ID)
  transactionId!: string;

  @Field(() => DeliveryMethod)
  deliveryMethod!: DeliveryMethod;

  @Field(() => String, { nullable: true })
  trackingInfo?: string;

  @Field(() => Date, { nullable: true })
  expectedDeliveryDate?: Date;
}

@InputType()
export class ConfirmDeliveryInput {
  @Field(() => ID)
  transactionId!: string;
}

@InputType()
export class ReleaseEscrowInput {
  @Field(() => ID)
  transactionId!: string;
}

@InputType()
export class CancelTransactionInput {
  @Field(() => ID)
  transactionId!: string;

  @Field(() => String)
  reason!: string;
}

@InputType()
export class RequestRefundInput {
  @Field(() => ID)
  transactionId!: string;

  @Field(() => String)
  reason!: string;
}
