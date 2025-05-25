import { Field, ObjectType, InputType, registerEnumType } from "type-graphql";
import { User } from "./user.type";
import { TokenType } from "@prisma/client";

// Register the TokenType enum for GraphQL
registerEnumType(TokenType, {
  name: "TokenType",
  description: "The type of verification token",
});

@ObjectType()
export class AuthResponse {
  @Field(() => String)
  token?: string;

  @Field(() => User)
  user?: User;
}

// Email-based authentication inputs
@InputType()
export class SignupWithEmailInput {
  @Field(() => String)
  email!: string;

  @Field(() => String)
  password!: string;

  @Field(() => String)
  firstName!: string;

  @Field(() => String)
  lastName!: string;

  @Field(() => String, { nullable: true })
  phoneNumber?: string;
}

@InputType()
export class SigninWithEmailInput {
  @Field(() => String)
  email!: string;

  @Field(() => String)
  password!: string;
}

// Phone-based authentication inputs
@InputType()
export class SignupWithPhoneInput {
  @Field(() => String)
  phoneNumber!: string;

  @Field(() => String)
  password!: string;

  @Field(() => String)
  firstName!: string;

  @Field(() => String)
  lastName!: string;

  @Field(() => String, { nullable: true })
  email?: string;
}

@InputType()
export class SigninWithPhoneInput {
  @Field(() => String)
  phoneNumber!: string;

  @Field(() => String)
  password!: string;
}

// Legacy inputs (for backward compatibility)
@InputType()
export class LoginInput {
  @Field(() => String)
  email?: string;

  @Field(() => String)
  password?: string;
}

@InputType()
export class RegisterInput {
  @Field(() => String)
  email?: string;

  @Field(() => String)
  password!: string;

  @Field(() => String)
  firstName!: string;

  @Field(() => String)
  lastName!: string;

  @Field(() => String, { nullable: true })
  phoneNumber?: string;
}

// Email verification inputs
@InputType()
export class VerifyEmailInput {
  @Field(() => String)
  token!: string;
}

@InputType()
export class ResendVerificationEmailInput {
  @Field(() => String)
  email!: string;
}

// Password reset inputs
@InputType()
export class ForgotPasswordInput {
  @Field(() => String)
  email!: string;
}

@InputType()
export class ResetPasswordInput {
  @Field(() => String)
  token!: string;

  @Field(() => String)
  newPassword!: string;
}

// Phone OTP inputs
@InputType()
export class RequestPhoneOtpInput {
  @Field(() => String)
  phoneNumber!: string;
}

@InputType()
export class VerifyPhoneOtpInput {
  @Field(() => String)
  phoneNumber!: string;

  @Field(() => String)
  otp!: string;
}
