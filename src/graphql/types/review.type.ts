import { Field, ID, InputType, Int, ObjectType } from "type-graphql";

@ObjectType()
export class Review {
  @Field(() => ID)
  id?: string;

  @Field(() => ID)
  sellerId?: string;

  @Field(() => ID)
  reviewerId?: string;

  @Field(() => Int)
  rating?: number;

  @Field(() => String, { nullable: true })
  comment?: string | null;

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
