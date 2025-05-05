import { Field, ID, ObjectType, registerEnumType } from "type-graphql";
import { User as PrismaUser, AccountType } from "../../generated/prisma-client";

// Register the AccountType enum for GraphQL
registerEnumType(AccountType, {
  name: "AccountType",
  description: "The type of user account",
});

@ObjectType()
export class User implements Partial<PrismaUser> {
  @Field(() => ID)
  id?: string;

  @Field(() => String, { nullable: true })
  email?: string | null;

  @Field(() => String)
  firstName?: string;

  @Field(() => String)
  lastName?: string;

  @Field(() => String, { nullable: true })
  phoneNumber?: string | null;

  @Field(() => String, { nullable: true })
  profileImageUrl?: string | null;

  @Field(() => AccountType)
  accountType?: AccountType;

  @Field(() => Boolean)
  verified?: boolean;

  @Field(() => Date)
  createdAt?: Date;

  @Field(() => Date)
  updatedAt?: Date;
}
