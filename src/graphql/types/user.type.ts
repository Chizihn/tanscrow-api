import { Field, ID, ObjectType, registerEnumType } from "type-graphql";
import {
  User as PrismaUser,
  AccountType,
  ProviderType,
  Provider as PrismaProvider,
  Address as PrismaAdress,
} from "../../generated/prisma-client";

// Register the AccountType enum for GraphQL
registerEnumType(AccountType, {
  name: "AccountType",
  description: "The type of user account",
});

// Register the ProviderType enum for GraphQL
registerEnumType(ProviderType, {
  name: "ProviderType",
  description: "The type of authentication provider",
});

//Address
@ObjectType()
export class Address implements Partial<PrismaAdress> {
  @Field(() => ID)
  id?: string;

  @Field(() => String)
  street?: string;

  @Field(() => String)
  city?: string;

  @Field(() => String)
  state?: string;

  @Field(() => String)
  postalCode?: string;

  @Field(() => String)
  country?: string;

  @Field(() => Date)
  createdAt?: Date;

  @Field(() => Date)
  updatedAt?: Date;
}

//Provider
@ObjectType()
export class Provider implements Partial<PrismaProvider> {
  @Field(() => ID)
  id?: string;

  @Field(() => ProviderType)
  provider?: ProviderType;

  @Field(() => String)
  providerId?: string;

  @Field(() => String, { nullable: true })
  refreshToken?: string | null;

  @Field(() => Date, { nullable: true })
  tokenExpiry?: Date | null;

  @Field(() => String)
  userId?: string;

  @Field(() => Date)
  createdAt?: Date;
}

// User
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

  @Field(() => String, { nullable: true })
  addressId?: string | null;

  @Field(() => [Provider])
  providers?: Provider[];

  @Field(() => Address, { nullable: true })
  address?: Address;

  // @Field(() => [VerificationDocument])
  // verificationDocuments?: VerificationDocument[];
}
