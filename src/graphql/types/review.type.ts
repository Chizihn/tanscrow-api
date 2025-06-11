import { Field, ID, InputType, Int, ObjectType } from "type-graphql";
import { User } from "./user.type";

@ObjectType()
export class Review {
  @Field(() => ID)
  id?: string;

  @Field(() => Number)
  rating?: Number;

  @Field(() => String)
  comment?: string | null;

  @Field(() => User)
  reviewer?: User;

  @Field(() => User)
  seller?: User;

  @Field(() => Date)
  createdAt?: Date;

  @Field(() => Date)
  updatedAt?: Date;
}

@InputType()
export class CreateReviewInput {
  @Field(() => ID)
  sellerId!: string;

  @Field(() => Int)
  rating!: number;

  @Field(() => String, { nullable: true })
  comment!: string;
}
