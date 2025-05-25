import { ObjectType, Field, InputType } from "type-graphql";

@ObjectType()
export class Bank {
  @Field(() => String)
  name!: string;

  @Field(() => String)
  code!: string;

  @Field(() => Boolean)
  active!: boolean;
}

@ObjectType()
export class AccountDetails {
  @Field(() => String)
  accountNumber!: string;

  @Field(() => String)
  accountName!: string;

  @Field(() => String)
  bankCode!: string;
}

@InputType()
export class AccountResolveInput {
  @Field(() => String)
  accountNumber!: string;

  @Field(() => String)
  bankCode!: string;
}
