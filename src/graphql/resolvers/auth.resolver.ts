import { Arg, Ctx, Mutation, Resolver, UseMiddleware } from "type-graphql";
import { isAuthenticated } from "../middleware/auth.middleware";
import {
  AuthResponse,
  SignupWithEmailInput,
  SignupWithPhoneInput,
  SigninWithEmailInput,
  SigninWithPhoneInput,
  VerifyEmailInput,
  ResendVerificationEmailInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  RequestPhoneOtpInput,
  VerifyPhoneOtpInput,
} from "../types/auth.type";
import { GraphQLContext } from "../types/context.type";
import { User } from "../types/user.type";
import { prisma } from "../../config/db.config";
import { AccountType, ProviderType, TokenType } from "@prisma/client";
import { AuthService } from "../../services/auth.service";
import {
  sendEmail,
  sendNotification,
} from "../../services/notification.service";

const authService = new AuthService();

@Resolver()
export class AuthResolver {
  @Mutation(() => AuthResponse)
  async signupWithEmail(
    @Arg("input") input: SignupWithEmailInput,
    @Ctx() {}: GraphQLContext
  ): Promise<AuthResponse> {
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
    });
    if (existingUser) throw new Error("User with this email already exists");

    const hashedPassword = await authService.hashPassword(input.password);

    const user = await prisma.user.create({
      data: {
        email: input.email,
        password: hashedPassword,
        firstName: input.firstName,
        lastName: input.lastName,
        phoneNumber: input.phoneNumber,
        accountType: AccountType.USER,
        verified: false,

        providers: {
          create: { provider: ProviderType.EMAIL, providerId: input.email },
        },
      },
      include: { providers: true, verificationTokens: true },
    });

    // Automatically create wallet for new user
    await prisma.wallet.create({
      data: {
        userId: user.id,
        currency: "NGN",
        balance: 0,
        escrowBalance: 0,
        isActive: true,
      },
    });

    const token = await authService.generateVerificationToken(
      user?.id as string,
      TokenType.EMAIL_VERIFICATION,
      24
    );
    console.log(`Verification token: ${token}`);

    await sendEmail({
      to: user?.email as string,
      subject: "Verify your email address",
      body: `Hello ${
        user.firstName
      }, use this code ${token} t0 verify your email address. Note, it expires in ${
        user.verificationTokens?.[user.verificationTokens.length - 1]?.expiresAt
      } hour(s)`,
    });

    return {
      token: authService.generateJwt(user.id),
      user,
    };
  }

  @Mutation(() => AuthResponse)
  async signupWithPhone(
    @Arg("input") input: SignupWithPhoneInput,
    @Ctx() { req }: GraphQLContext
  ): Promise<AuthResponse> {
    const existingUser = await prisma.user.findUnique({
      where: { phoneNumber: input.phoneNumber },
    });
    if (existingUser)
      throw new Error("User with this phone number already exists");

    const hashedPassword = await authService.hashPassword(input.password);

    const user = await prisma.user.create({
      data: {
        email: input.email || "",
        password: hashedPassword,
        firstName: input.firstName,
        lastName: input.lastName,
        phoneNumber: input.phoneNumber,
        accountType: AccountType.USER,
        verified: false,
        providers: {
          create: {
            provider: ProviderType.PHONE,
            providerId: input.phoneNumber,
          },
        },
      },
      include: { providers: true },
    });

    // Automatically create wallet for new user
    await prisma.wallet.create({
      data: {
        userId: user.id,
        currency: "NGN",
        balance: 0,
        escrowBalance: 0,
        isActive: true,
      },
    });

    const otp = await authService.generateOtp(user.id, TokenType.PHONE_OTP, 15);
    console.log(`Phone signup OTP: ${otp}`);

    return {
      token: authService.generateJwt(user.id),
      user,
    };
  }

  @Mutation(() => AuthResponse)
  async signinWithEmail(
    @Arg("input") input: SigninWithEmailInput
  ): Promise<AuthResponse> {
    const provider = await prisma.provider.findFirst({
      where: { provider: ProviderType.EMAIL, providerId: input.email },
      include: {
        user: {
          include: {
            providers: true,
            verificationTokens: true, // optional
          },
        },
      },
    });

    if (!provider?.user) throw new Error("No such user exists");

    const isValid = await authService.comparePasswords(
      input.password,
      provider.user.password
    );
    if (!isValid) throw new Error("Invalid email or password");

    return {
      token: authService.generateJwt(provider.user.id),
      user: provider.user,
    };
  }

  @Mutation(() => AuthResponse)
  async signinWithPhone(
    @Arg("input") input: SigninWithPhoneInput
  ): Promise<AuthResponse> {
    const provider = await prisma.provider.findFirst({
      where: { provider: ProviderType.PHONE, providerId: input.phoneNumber },
      include: { user: true },
    });

    if (!provider?.user) throw new Error("Invalid phone number or password");

    const isValid = await authService.comparePasswords(
      input.password,
      provider.user.password
    );
    if (!isValid) throw new Error("Invalid phone number or password");

    const otp = await authService.generateOtp(
      provider.user.id,
      TokenType.PHONE_OTP,
      15
    );
    console.log(`Phone signin OTP: ${otp}`);

    return {
      token: authService.generateJwt(provider.user.id),
      user: provider.user,
    };
  }

  @Mutation(() => User)
  @UseMiddleware(isAuthenticated)
  async addEmailToAccount(
    @Arg("email") email: string,
    @Ctx() { user }: GraphQLContext
  ): Promise<User> {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new Error("This email is already in use");

    const currentUser = await prisma.user.findUnique({
      where: { id: user?.id },
      include: { providers: true },
    });
    if (!currentUser) throw new Error("User not found");

    if (
      currentUser.providers.some(
        (p: { provider: ProviderType }) => p.provider === ProviderType.EMAIL
      )
    ) {
      throw new Error("User already has an email provider");
    }

    return prisma.user.update({
      where: { id: user?.id },
      data: {
        email,
        providers: {
          create: {
            provider: ProviderType.EMAIL,
            providerId: email,
          },
        },
      },
      include: { providers: true },
    });
  }

  @Mutation(() => User)
  @UseMiddleware(isAuthenticated)
  async addPhoneToAccount(
    @Arg("phoneNumber") phoneNumber: string,
    @Ctx() { user }: GraphQLContext
  ): Promise<User> {
    const existing = await prisma.user.findUnique({ where: { phoneNumber } });
    if (existing) throw new Error("This phone number is already in use");

    const currentUser = await prisma.user.findUnique({
      where: { id: user?.id },
      include: { providers: true },
    });
    if (!currentUser) throw new Error("User not found");

    if (
      currentUser.providers.some(
        (p: { provider: ProviderType }) => p.provider === ProviderType.PHONE
      )
    ) {
      throw new Error("User already has a phone provider");
    }

    return prisma.user.update({
      where: { id: user?.id },
      data: {
        phoneNumber,
        providers: {
          create: {
            provider: ProviderType.PHONE,
            providerId: phoneNumber,
          },
        },
      },
      include: { providers: true },
    });
  }

  @Mutation(() => Boolean)
  async verifyEmail(
    @Arg("input") input: VerifyEmailInput,
    @Ctx() { user }: GraphQLContext
  ): Promise<boolean> {
    const tokenRecord = await authService.validateToken(
      input.token,
      TokenType.EMAIL_VERIFICATION
    );
    await authService.markUserAsVerified(tokenRecord.userId);

    // Send verification success notification
    await sendNotification({
      userId: tokenRecord.userId,
      title: "Email Verified",
      message:
        "Your email has been successfully verified. You can now access all features of your account.",
      type: "VERIFICATION",
      entityId: tokenRecord.userId,
      entityType: "User",
    });

    return true;
  }

  @Mutation(() => Boolean)
  async resendVerificationEmail(
    @Arg("input") input: ResendVerificationEmailInput
  ): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });
    if (!user) throw new Error("User not found");
    if (user.verified) throw new Error("Email is already verified");

    const token = await authService.generateVerificationToken(
      user.id,
      TokenType.EMAIL_VERIFICATION,
      24
    );

    await sendEmail({
      to: user?.email as string,
      subject: "Verify your email address",
      body: `Hello ${user.firstName}, use this code ${token} to verify your email address. Note, it expires in 24 hours.`,
    });

    await sendNotification({
      userId: user.id,
      title: "Verification Email Sent",
      message:
        "A new verification email has been sent to your email address. Please check your inbox.",
      type: "VERIFICATION",
      entityId: user.id,
      entityType: "User",
    });

    return true;
  }

  @Mutation(() => Boolean)
  async forgotPassword(
    @Arg("input") input: ForgotPasswordInput
  ): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });
    if (!user) return true;

    const token = await authService.generateVerificationToken(
      user.id,
      TokenType.PASSWORD_RESET,
      1
    );

    await sendEmail({
      to: user?.email as string,
      subject: "Reset Your Password",
      body: `Hello ${user.firstName}, use this code ${token} to reset your password. This code will expire in 1 hour.`,
    });

    await sendNotification({
      userId: user.id,
      title: "Password Reset Requested",
      message:
        "A password reset link has been sent to your email address. Please check your inbox.",
      type: "SECURITY",
      entityId: user.id,
      entityType: "User",
    });

    return true;
  }

  @Mutation(() => Boolean)
  async resetPassword(
    @Arg("input") input: ResetPasswordInput
  ): Promise<boolean> {
    const tokenRecord = await authService.validateToken(
      input.token,
      TokenType.PASSWORD_RESET
    );

    const hashed = await authService.hashPassword(input.newPassword);

    await prisma.user.update({
      where: { id: tokenRecord.userId },
      data: { password: hashed },
    });

    const user = await prisma.user.findUnique({
      where: { id: tokenRecord.userId },
    });

    if (user) {
      await sendEmail({
        to: user?.email as string,
        subject: "Password Reset Successful",
        body: `Hello ${user.firstName}, your password has been successfully reset. If you did not make this change, please contact support immediately.`,
      });

      await sendNotification({
        userId: user.id,
        title: "Password Reset Successful",
        message:
          "Your password has been successfully reset. If you did not make this change, please contact support immediately.",
        type: "SECURITY",
        entityId: user.id,
        entityType: "User",
      });
    }

    return true;
  }

  @Mutation(() => Boolean)
  async requestPhoneOtp(
    @Arg("input") input: RequestPhoneOtpInput
  ): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { phoneNumber: input.phoneNumber },
    });
    if (!user) throw new Error("User not found");

    const otp = await authService.generateOtp(user.id, TokenType.PHONE_OTP, 15);
    console.log(`Requested phone OTP: ${otp}`);
    return true;
  }

  @Mutation(() => Boolean)
  async verifyPhoneOtp(
    @Arg("input") input: VerifyPhoneOtpInput
  ): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { phoneNumber: input.phoneNumber },
    });
    if (!user) throw new Error("User not found");

    const otpToken = await prisma.verificationToken.findFirst({
      where: {
        userId: user.id,
        token: input.otp,
        type: TokenType.PHONE_OTP,
      },
    });

    if (!otpToken || otpToken.expiresAt < new Date()) {
      throw new Error("Invalid or expired OTP");
    }

    const tokenRecord = await authService.validateToken(
      input.otp,
      TokenType.PHONE_OTP
    );

    await authService.markUserAsVerified(user.id);

    await sendNotification({
      userId: tokenRecord.userId,
      title: "Phone Number Verified",
      message: "Your phone number has been successfully verified.",
      type: "VERIFICATION",
      entityId: user.id,
      entityType: "User",
    });

    return true;
  }
}
