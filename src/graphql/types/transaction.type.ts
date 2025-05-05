import {
  Field,
  ID,
  ObjectType,
  InputType,
  registerEnumType,
  Float,
} from "type-graphql";
import {
  Transaction as PrismaTransaction,
  TransactionStatus,
  EscrowStatus,
  DeliveryMethod,
  TransactionType,
  PaymentGateway,
  PaymentStatus,
  PaymentCurrency,
} from "../../generated/prisma-client";
import { User } from "./user.type";
import { Decimal } from "../../generated/prisma-client/runtime/library";
import { GraphQLJSONObject } from "graphql-type-json";

// Register enums for GraphQL
registerEnumType(TransactionStatus, {
  name: "TransactionStatus",
  description: "The status of a transaction",
});

registerEnumType(EscrowStatus, {
  name: "EscrowStatus",
  description: "The status of escrow funds",
});

registerEnumType(DeliveryMethod, {
  name: "DeliveryMethod",
  description: "The method of delivery for the transaction",
});

registerEnumType(TransactionType, {
  name: "TransactionType",
  description: "The type of transaction",
});

registerEnumType(PaymentGateway, {
  name: "PaymentGateway",
  description: "The payment gateway used",
});

registerEnumType(PaymentStatus, {
  name: "PaymentStatus",
  description: "The status of the payment",
});

@ObjectType()
export class Payment {
  @Field(() => ID)
  id?: string;

  @Field(() => PaymentCurrency)
  paymentCurrency?: PaymentCurrency;

  @Field(() => Float)
  amount?: Decimal;

  @Field(() => Float)
  fee?: Decimal;

  @Field(() => Float)
  totalAmount?: Decimal;

  @Field(() => PaymentGateway)
  paymentGateway?: PaymentGateway;

  @Field(() => String)
  gatewayReference?: string;

  @Field(() => GraphQLJSONObject, { nullable: true })
  gatewayResponse?: any;

  @Field(() => PaymentStatus)
  status?: PaymentStatus;

  @Field(() => Date)
  createdAt?: Date;

  @Field(() => Date)
  updatedAt?: Date;
}

@ObjectType()
export class TransactionLog {
  @Field(() => ID)
  id?: string;

  @Field(() => Transaction)
  transaction?: PrismaTransaction;

  @Field(() => String)
  action?: string;

  @Field(() => TransactionStatus)
  status?: TransactionStatus;

  @Field(() => EscrowStatus)
  escrowStatus?: EscrowStatus;

  @Field(() => String)
  performedBy?: string | null;

  @Field(() => String)
  description?: string;

  @Field(() => Date)
  createdAt?: Date;
}

@ObjectType()
export class Transaction implements Partial<PrismaTransaction> {
  @Field(() => ID)
  id?: string;

  @Field(() => String)
  transactionCode?: string;

  @Field(() => User)
  seller?: User;

  @Field(() => User)
  buyer?: User;

  @Field(() => String)
  title?: string;

  @Field(() => String)
  description?: string;

  @Field(() => String)
  paymentCurrency?: PaymentCurrency;

  @Field(() => Float)
  amount?: Decimal;

  @Field(() => Float)
  escrowFee?: Decimal;

  @Field(() => Float)
  totalAmount?: Decimal;

  @Field(() => String, { nullable: true })
  paymentReference?: string | null;

  @Field(() => TransactionStatus)
  status?: TransactionStatus;

  @Field(() => EscrowStatus)
  escrowStatus?: EscrowStatus;

  @Field(() => DeliveryMethod, { nullable: true })
  deliveryMethod?: DeliveryMethod | null;

  @Field(() => String, { nullable: true })
  trackingInfo?: string | null;

  @Field(() => Date, { nullable: true })
  expectedDeliveryDate?: Date | null;

  @Field(() => Date, { nullable: true })
  actualDeliveryDate?: Date | null;

  @Field(() => Boolean)
  isPaid?: boolean;

  @Field(() => TransactionType)
  type?: TransactionType;

  @Field(() => Date)
  createdAt?: Date;

  @Field(() => Date)
  updatedAt?: Date;

  @Field(() => Date, { nullable: true })
  completedAt?: Date | null;

  @Field(() => Date, { nullable: true })
  canceledAt?: Date | null;

  @Field(() => Date, { nullable: true })
  refundedAt?: Date | null;

  @Field(() => Payment, { nullable: true })
  payment?: Payment | null;

  @Field(() => [TransactionLog])
  logs?: TransactionLog[];
}

@InputType()
export class CreateTransactionInput {
  @Field(() => ID)
  sellerId!: string;

  @Field(() => String)
  title!: string;

  @Field(() => String)
  description!: string;

  @Field(() => String)
  paymentCurrency!: string;

  @Field(() => Float)
  amount!: Decimal;

  @Field(() => DeliveryMethod, { nullable: true })
  deliveryMethod?: DeliveryMethod;

  @Field(() => Date, { nullable: true })
  expectedDeliveryDate?: Date;

  @Field(() => TransactionType)
  type!: TransactionType;
}

@InputType()
export class ProcessPaymentInput {
  @Field(() => ID)
  transactionId!: string;

  @Field(() => PaymentGateway)
  paymentGateway!: PaymentGateway;

  @Field(() => String)
  gatewayReference!: string;
}
