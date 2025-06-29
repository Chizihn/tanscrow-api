import {
  Field,
  ID,
  InputType,
  Int,
  ObjectType,
  registerEnumType,
} from "type-graphql";
import {
  AccountType,
  ProviderType,
  Provider as PrismaProvider,
  SearchUserType,
} from "@prisma/client";
import { Review } from "./review.type";

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

registerEnumType(SearchUserType, {
  name: "SearchUserType",
  description: "The type for using the search user query",
});

//Address
@ObjectType()
export class Address {
  @Field(() => ID)
  id?: string;

  @Field(() => String)
  street?: string;

  @Field(() => String)
  city?: string;

  @Field(() => String)
  state?: string;

  @Field(() => String)
  postalCode?: string | null;

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
export class User {
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

  @Field(() => [Provider], { nullable: true })
  providers?: Provider[];

  @Field(() => Address, { nullable: true })
  address?: Address | null;

  @Field(() => [Review], { nullable: true })
  reviewsReceived?: Review[];

  @Field(() => [Review], { nullable: true })
  reviewsGiven?: Review[];
}

@InputType()
export class SearchUserInput {
  @Field(() => String)
  query!: string;

  @Field(() => SearchUserType)
  searchType!: SearchUserType;
}


@InputType()
export class UserFiltersInput {
  @Field(() => String, { nullable: true })
  email?: string;

  @Field(() => String, { nullable: true })
  firstName?: string;

  @Field(() => String, { nullable: true })
  lastName?: string;

  @Field(() => String, { nullable: true })
  phoneNumber?: string;

  @Field(() => AccountType, { nullable: true })
  accountType?: AccountType;

  @Field(() => Boolean, { nullable: true })
  verified?: boolean;

  @Field(() => String, { nullable: true })
  city?: string;

  @Field(() => String, { nullable: true })
  state?: string;

  @Field(() => String, { nullable: true })
  country?: string;

  @Field(() => Date, { nullable: true })
  createdAfter?: Date;

  @Field(() => Date, { nullable: true })
  createdBefore?: Date;
}

@InputType()
export class PaginationInput {
  @Field(() => Int, { nullable: true, defaultValue: 1 })
  page?: number;

  @Field(() => Int, { nullable: true, defaultValue: 10 })
  limit?: number;

  @Field(() => String, { nullable: true })
  sortBy?: string; // e.g., "createdAt", "firstName", "lastName"

  @Field(() => String, { nullable: true, defaultValue: "desc" })
  sortOrder?: "asc" | "desc";
}

@InputType()
export class GetUsersInput {
  @Field(() => PaginationInput, { nullable: true })
  pagination?: PaginationInput;

  @Field(() => UserFiltersInput, { nullable: true })
  filters?: UserFiltersInput;
}

@ObjectType()
export class UsersResponse {
  @Field(() => [User])
  users!: User[];

  @Field(() => Int)
  totalCount!: number;

  @Field(() => Int)
  totalPages!: number;

  @Field(() => Int)
  currentPage!: number;

  @Field(() => Boolean)
  hasNextPage!: boolean;

  @Field(() => Boolean)
  hasPreviousPage!: boolean;
}