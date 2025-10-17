import { ObjectType, Field, ID } from "type-graphql";
import { User } from "./user.type";

@ObjectType()
export class TransactionDocument {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  url!: string;

  @Field(() => String)
  fileName!: string;

  @Field(() => String)
  fileType!: string;

  @Field(() => User)
  uploadedBy!: User;

  @Field(() => Date)
  uploadedAt!: Date;

  @Field(() => String, { nullable: true })
  description?: string;
} 