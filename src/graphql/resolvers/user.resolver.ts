import {
  Arg,
  Ctx,
  Query,
  Resolver,
  UseMiddleware,
  Mutation,
} from "type-graphql";
import { User } from "../types/user.type";
import { GraphQLContext } from "../types/context.type";
import { prisma } from "../../config/db.config";
import { isAdmin, isAuthenticated } from "../middleware/auth.middleware";
import {
  UpdateProfileInput,
  ChangePasswordInput,
  AddEmailInput,
  AddPhoneInput,
} from "../types/profile.type";
import {
  Provider,
  ProviderType,
  TokenType,
} from "../../generated/prisma-client";
import bcrypt from "bcryptjs";

@Resolver()
export class UserResolver {
  @Query(() => User, { nullable: true, description: "Get current user" })
  @UseMiddleware(isAuthenticated)
  async me(@Ctx() { user }: GraphQLContext): Promise<User | null> {
    return user;
  }

  @Query(() => User, { nullable: true, description: "Find user by id" })
  async user(@Arg("id") id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  @Query(() => [User], { description: "Fetch all users" })
  @UseMiddleware(isAdmin)
  async users(): Promise<User[]> {
    return prisma.user.findMany();
  }

  @Mutation(() => User, { description: "User updating their profile" })
  @UseMiddleware(isAuthenticated)
  async updateProfile(
    @Arg("input") input: UpdateProfileInput,
    @Ctx() { user }: GraphQLContext
  ): Promise<User> {
    return prisma.user.update({
      where: { id: user?.id },
      data: input,
    });
  }

  @Mutation(() => User, { description: "User changing password" })
  @UseMiddleware(isAuthenticated)
  async changePassword(
    @Arg("input") input: ChangePasswordInput,
    @Ctx() { user }: GraphQLContext
  ): Promise<User> {
    const currentUser = await prisma.user.findUnique({
      where: { id: user?.id },
    });

    if (!currentUser) {
      throw new Error("User not found");
    }

    const isPasswordValid = await bcrypt.compare(
      input.currentPassword,
      currentUser.password
    );

    if (!isPasswordValid) {
      throw new Error("Current password is incorrect");
    }

    const hashedPassword = await bcrypt.hash(input.newPassword, 10);

    return prisma.user.update({
      where: { id: user?.id },
      data: { password: hashedPassword },
    });
  }

  @Mutation(() => User, {
    description: "Account create via phone number linking their email",
  })
  @UseMiddleware(isAuthenticated)
  async addEmailToPhoneAccount(
    @Arg("input") input: AddEmailInput,
    @Ctx() { user }: GraphQLContext
  ): Promise<User> {
    const currentUser = await prisma.user.findUnique({
      where: { id: user?.id },
      include: { providers: true },
    });

    if (!currentUser) {
      throw new Error("User not found");
    }

    // Check if user's primary provider is phone
    const hasPhoneProvider = currentUser.providers.some(
      (p: Provider) => p.provider === ProviderType.PHONE
    );

    if (!hasPhoneProvider) {
      throw new Error(
        "This operation is only available for phone-based accounts"
      );
    }

    // Check if email is already in use
    const existingEmail = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingEmail) {
      throw new Error("Email is already in use");
    }

    const hashedPassword = await bcrypt.hash(input.password, 10);

    // Add email provider and update user
    return prisma.user.update({
      where: { id: user?.id },
      data: {
        email: input.email,
        password: hashedPassword,
        providers: {
          create: {
            provider: ProviderType.EMAIL,
            providerId: input.email,
          },
        },
      },
      include: { providers: true },
    });
  }

  @Mutation(() => User, {
    description: "An account created with email linking phone number",
  })
  @UseMiddleware(isAuthenticated)
  async addPhoneToEmailAccount(
    @Arg("input") input: AddPhoneInput,
    @Ctx() { user }: GraphQLContext
  ): Promise<User> {
    const currentUser = await prisma.user.findUnique({
      where: { id: user?.id },
      include: { providers: true },
    });

    if (!currentUser) {
      throw new Error("User not found");
    }

    // Check if user's primary provider is email
    const hasEmailProvider = currentUser.providers.some(
      (p: Provider) => p.provider === ProviderType.EMAIL
    );

    if (!hasEmailProvider) {
      throw new Error(
        "This operation is only available for email-based accounts"
      );
    }

    // Check if phone is already in use
    const existingPhone = await prisma.user.findUnique({
      where: { phoneNumber: input.phoneNumber },
    });

    if (existingPhone) {
      throw new Error("Phone number is already in use");
    }

    const hashedPassword = await bcrypt.hash(input.password, 10);

    // Generate OTP for phone verification
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpToken = await prisma.verificationToken.create({
      data: {
        userId: user?.id as string,
        type: TokenType.PHONE_OTP,
        token: otp,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      },
    });

    // TODO: Send OTP via SMS
    console.log(`Phone verification OTP: ${otp}`);

    // Add phone provider and update user
    return prisma.user.update({
      where: { id: user?.id },
      data: {
        phoneNumber: input.phoneNumber,
        password: hashedPassword,
        providers: {
          create: {
            provider: ProviderType.PHONE,
            providerId: input.phoneNumber,
          },
        },
      },
      include: { providers: true },
    });
  }
}
