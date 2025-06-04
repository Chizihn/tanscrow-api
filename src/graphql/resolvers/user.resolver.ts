import {
  Arg,
  Ctx,
  Query,
  Resolver,
  UseMiddleware,
  Mutation,
} from "type-graphql";
import { SearchUserInput, User } from "../types/user.type";
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
  AccountType,
  Provider,
  ProviderType,
  SearchUserType,
  TokenType,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { BadRequestException } from "../../utils/appError";
import { ErrorCodeEnum } from "../../enums/error-code.enum";

@Resolver()
export class UserResolver {
  // --- Queries ---
  @Query(() => User, { nullable: true, description: "Get current user" })
  @UseMiddleware(isAuthenticated)
  async me(@Ctx() { user }: GraphQLContext): Promise<User | null> {
    if (!user?.id) return null;

    const fullUser = await prisma.user.findUnique({
      where: { id: user?.id },
      include: {
        address: true,
        providers: true,
      },
    });

    return fullUser;
  }

  @Query(() => User, { nullable: true, description: "Find user by id" })
  async user(@Arg("id") id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  @Query(() => [User], { description: "Fetch all users" })
  @UseMiddleware(isAdmin)
  async users(): Promise<User[]> {
    return prisma.user.findMany();
  }

  // --- Mutations ---
  @Mutation(() => User, { description: "User updating their profile" })
  @UseMiddleware(isAuthenticated)
  async updateProfile(
    @Arg("input") input: UpdateProfileInput,
    @Ctx() { user }: GraphQLContext
  ): Promise<User> {
    const {
      firstName,
      lastName,
      phoneNumber,
      street,
      city,
      state,
      postalCode,
      country,
    } = input;

    // Extract address fields
    const addressFields = { street, city, state, postalCode, country };
    const hasAddressFields = Object.values(addressFields).some(
      (field) => field !== undefined
    );

    const updateData: any = {
      firstName,
      lastName,
      phoneNumber,
    };

    // Handle address update using nested operations
    if (hasAddressFields) {
      if (user?.addressId) {
        // Update existing address
        updateData.address = {
          update: addressFields,
        };
      } else {
        // Create new address
        updateData.address = {
          create: addressFields,
        };
      }
    }

    return prisma.user.update({
      where: { id: user?.id },
      data: updateData,
      include: {
        address: true,
      },
    });
  }

  @Mutation(() => User, { description: "Update user's profile image URL" })
  @UseMiddleware(isAuthenticated)
  async updateProfileImage(
    @Arg("profileImageUrl") profileImageUrl: string,
    @Ctx() { user }: GraphQLContext
  ): Promise<User> {
    return prisma.user.update({
      where: { id: user?.id },
      data: { profileImageUrl },
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

    if (!currentUser) throw new Error("User not found");

    const isPasswordValid = await bcrypt.compare(
      input.currentPassword,
      currentUser.password
    );

    if (!isPasswordValid) throw new Error("Current password is incorrect");

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

    if (!currentUser) throw new Error("User not found");

    const hasPhoneProvider = currentUser.providers.some(
      (p: Provider) => p.provider === ProviderType.PHONE
    );

    if (!hasPhoneProvider) {
      throw new Error(
        "This operation is only available for phone-based accounts"
      );
    }

    const existingEmail = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingEmail) throw new Error("Email is already in use");

    const hashedPassword = await bcrypt.hash(input.password, 10);

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

    if (!currentUser) throw new Error("User not found");

    const hasEmailProvider = currentUser.providers.some(
      (p: Provider) => p.provider === ProviderType.EMAIL
    );

    if (!hasEmailProvider) {
      throw new Error(
        "This operation is only available for email-based accounts"
      );
    }

    const existingPhone = await prisma.user.findUnique({
      where: { phoneNumber: input.phoneNumber },
    });

    if (existingPhone) throw new Error("Phone number is already in use");

    const hashedPassword = await bcrypt.hash(input.password, 10);

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await prisma.verificationToken.create({
      data: {
        userId: user?.id as string,
        type: TokenType.PHONE_OTP,
        token: otp,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    // Send OTP via SMS (integration pending)
    console.log(`Phone verification OTP: ${otp}`);

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

  @Query(() => User, {
    nullable: true,
    description: "Find user by email address or phone number",
  })
  async searchUser(
    @Arg("input") input: SearchUserInput,
    @Ctx() { user }: GraphQLContext
  ): Promise<User | null> {
    // 1. More robust input validation
    if (!input?.query?.trim()) {
      throw new BadRequestException(
        "Please enter either an email address or phone number!",
        ErrorCodeEnum.INVALID_INPUT
      );
    }

    const query = input.query.trim().toLowerCase();

    // 2. Email detection
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isEmail = emailRegex.test(query);

    // 3. Phone number validation
    if (!isEmail) {
      const phoneRegex = /^[\+]?[\d\s\-\(\)]+$/;
      if (!phoneRegex.test(query)) {
        throw new BadRequestException(
          "Invalid email or phone number format",
          ErrorCodeEnum.INVALID_INPUT
        );
      }
    }

    const existingUser = await prisma.user.findFirst({
      where: isEmail ? { email: query } : { phoneNumber: query },
    });

    if (!existingUser) return null;

    // 4. Prevent searching for Admins unless current user is also an Admin
    if (
      existingUser.accountType === AccountType.ADMIN &&
      user?.accountType !== AccountType.ADMIN
    ) {
      return null;
    }

    // 5. Prevent searching for yourself in a transaction context
    if (
      input.searchType === SearchUserType.TRANSACTION &&
      existingUser.id === user?.id
    ) {
      throw new BadRequestException(
        "You can't party yourself for a transaction!",
        ErrorCodeEnum.INVALID_ACTION
      );
    }

    return existingUser;
  }
}
