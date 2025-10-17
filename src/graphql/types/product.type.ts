import { Field, ID, ObjectType, InputType, registerEnumType, Float } from "type-graphql";
import { ProductStatus } from "@prisma/client";
import { User } from "./user.type";

registerEnumType(ProductStatus, {
  name: "ProductStatus",
  description: "Status of a marketplace product/listing",
});

@ObjectType()
export class Product {
  @Field(() => ID)
  id?: string;

  @Field(() => User)
  seller?: User;

  @Field(() => String)
  title?: string;

  @Field(() => String)
  description?: string;

  @Field(() => Float)
  price?: number;

  @Field(() => String)
  imageUrl?: string;

  @Field(() => ProductStatus)
  status?: ProductStatus;

  @Field(() => Date)
  createdAt?: Date;

  @Field(() => Date)
  updatedAt?: Date;
}

@InputType()
export class CreateProductInput {
  @Field(() => String)
  title!: string;

  @Field(() => String)
  description!: string;

  @Field(() => Float)
  price!: number;

  @Field(() => String)
  imageUrl!: string;
}

@InputType()
export class UpdateProductInput {
  @Field(() => String, { nullable: true })
  title?: string;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => Float, { nullable: true })
  price?: number;

  @Field(() => String, { nullable: true })
  imageUrl?: string;

  @Field(() => ProductStatus, { nullable: true })
  status?: ProductStatus;
} 