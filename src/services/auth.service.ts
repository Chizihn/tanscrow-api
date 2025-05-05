import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import config from "../config/app.config";
import { TokenType } from "../generated/prisma-client";
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
    // Remove previous tokens
    await prisma.verificationToken.deleteMany({
      where: { userId, type },
    });

    const token = crypto.randomBytes(32).toString("hex");

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + hours);

    await prisma.verificationToken.create({
      data: { userId, token, type, expiresAt },
    });

    return token;
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
    const record = await prisma.verificationToken.findFirst({
      where: { token, type },
    });

    if (!record) throw new Error("Invalid or expired token");

    if (record.expiresAt < new Date()) {
      throw new Error("Token has expired");
    }

    return record;
  }

  async markUserAsVerified(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { verified: true },
    });
  }

  async deleteToken(id: string): Promise<void> {
    await prisma.verificationToken.delete({ where: { id } });
  }
}
