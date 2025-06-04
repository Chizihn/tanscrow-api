import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import config from "../config/app.config";
import { TokenType } from "@prisma/client";
import { prisma } from "../config/db.config";

export class AuthService {
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  async comparePasswords(plain: string, hashed: string): Promise<boolean> {
    return bcrypt.compare(plain, hashed);
  }

  generateJwt(userId: string): string {
    return jwt.sign({ userId }, config.JWT_SECRET, { expiresIn: "7d" });
  }

  async generateVerificationToken(
    userId: string,
    type: TokenType,
    hours: number
  ): Promise<string> {
    return await prisma.$transaction(async (tx) => {
      // Remove previous tokens for this user
      await tx.verificationToken.deleteMany({
        where: { userId, type },
      });

      let token: string;
      let attempts = 0;
      const maxAttempts = 10;

      do {
        token = crypto.randomInt(100000, 999999).toString(); // 6-digit number
        attempts++;

        // Check if token already exists for this type (across all users)
        const existingToken = await tx.verificationToken.findFirst({
          where: { token, type },
        });

        if (!existingToken) break;

        if (attempts >= maxAttempts) {
          throw new Error(
            "Unable to generate unique token after multiple attempts"
          );
        }
      } while (attempts < maxAttempts);

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + hours);

      await tx.verificationToken.create({
        data: { userId, token, type, expiresAt },
      });

      return token;
    });
  }

  async generateOtp(
    userId: string,
    type: TokenType,
    expiryMinutes = 15
  ): Promise<string> {
    // Remove previous OTPs
    await prisma.verificationToken.deleteMany({
      where: { userId, type },
    });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    await prisma.verificationToken.create({
      data: {
        userId,
        token: otp,
        type,
        expiresAt,
      },
    });

    return otp;
  }

  async validateToken(token: string, type: TokenType) {
    return await prisma.$transaction(async (tx) => {
      const record = await tx.verificationToken.findFirst({
        where: {
          token,
          type,
          expiresAt: { gt: new Date() }, // Check expiry in the query
        },
      });

      if (!record) {
        throw new Error("Invalid or expired token");
      }

      // Immediately mark as used or delete to prevent reuse
      await tx.verificationToken.delete({
        where: { id: record.id },
      });

      return record;
    });
  }

  async markUserAsVerified(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { verified: true },
    });
  }
}
