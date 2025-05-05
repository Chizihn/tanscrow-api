import { Field, InputType } from "type-graphql";

@InputType()
export class UpdateProfileInput {
  @Field(() => String, { nullable: true })
  firstName?: string;

  @Field(() => String, { nullable: true })
  lastName?: string;

  @Field(() => String, { nullable: true })
  profileImageUrl?: string;
}

@InputType()
export class ChangePasswordInput {
  @Field(() => String)
  currentPassword!: string;

  @Field(() => String)
  newPassword!: string;
}

@InputType()
export class AddEmailInput {
  @Field(() => String)
  email!: string;

  @Field(() => String)
  password!: string;
}

@InputType()
export class AddPhoneInput {
  @Field(() => String)
  phoneNumber!: string;

  @Field(() => String)
  password!: string;
}
