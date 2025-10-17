// import { Field, ID, ObjectType, InputType, registerEnumType, Float } from "type-graphql";
// import { MarketplaceOrderStatus, EscrowStatus } from "@prisma/client";
// import { Product } from "./product.type";
// import { User } from "./user.type";

// registerEnumType(MarketplaceOrderStatus, {
//   name: "MarketplaceOrderStatus",
//   description: "Status of a marketplace order",
// });

// registerEnumType(EscrowStatus, {
//   name: "EscrowStatus",
//   description: "Status of escrow for an order",
// });

// @ObjectType()
// export class MarketplaceOrder {
//   @Field(() => ID)
//   id?: string;

//   @Field(() => Product)
//   product?: Product;

//   @Field(() => User)
//   buyer?: User;

//   @Field(() => User)
//   seller?: User;

//   @Field(() => Float)
//   amount?: number;

//   @Field(() => MarketplaceOrderStatus)
//   status?: MarketplaceOrderStatus;

//   @Field(() => EscrowStatus)
//   escrowStatus?: EscrowStatus;

//   @Field(() => String, { nullable: true })
//   paymentReference?: string | null;

//   @Field(() => Date)
//   createdAt?: Date;

//   @Field(() => Date)
//   updatedAt?: Date;

//   @Field(() => Date, { nullable: true })
//   completedAt?: Date | null;

//   @Field(() => Date, { nullable: true })
//   canceledAt?: Date | null;

//   @Field(() => Date, { nullable: true })
//   refundedAt?: Date | null;
// }

// @InputType()
// export class CreateMarketplaceOrderInput {
//   @Field(() => ID)
//   productId!: string;
// }

// @InputType()
// export class UpdateMarketplaceOrderStatusInput {
//   @Field(() => ID)
//   orderId!: string;

//   @Field(() => MarketplaceOrderStatus)
//   status!: MarketplaceOrderStatus;

//   @Field(() => String, { nullable: true })
//   paymentReference?: string;
// } 