// import { PrismaClient,  } from '@prisma/client'; // Import Prisma client and types
// import bcrypt from 'bcryptjs'; // If you're using bcrypt for password hashing
// import jwt from 'jsonwebtoken'; // For generating tokens
// import { ProviderType } from '../generated/prisma-client';

// const prisma = new PrismaClient();

// class UserService {
//   // Method to create a user (including linking a provider)
//   async registerUser(email: string, password: string, firstName: string, lastName: string, providerType: ProviderType, providerId: string) {
//     // Hash the password
//     const hashedPassword = await bcrypt.hash(password, 10);

//     // Create the user
//     const user = await prisma.user.create({
//       data: {
//         email,
//         password: hashedPassword,
//         firstName,
//         lastName,
//         providers: {
//           create: {
//             provider: providerType,
//             providerId,
//           },
//         },
//       },
//     });

//     // Send a verification email (optional)
//     sendVerificationEmail(user.email);

//     return user;
//   }

//   // Method to login a user using a provider (e.g., phone, email, Google)
//   async loginUser(providerType: ProviderType, providerId: string) {
//     // Find the user by the provider (e.g., phone, email, or OAuth provider ID)
//     const provider = await prisma.provider.findUnique({
//       where: {
//         providerId_provider: {
//           providerId,
//           provider: providerType,
//         },
//       },
//       include: {
//         user: true,
//       },
//     });

//     if (!provider) {
//       throw new Error('User not found');
//     }

//     const user = provider.user;

//     // Generate a JWT token (for session or authentication purposes)
//     const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

//     return { user, token };
//   }

//   // Method to update user information (e.g., email, name, etc.)
//   async updateUser(userId: string, updateData: Partial<User>) {
//     // Update user information in the database
//     const updatedUser = await prisma.user.update({
//       where: { id: userId },
//       data: updateData,
//     });

//     return updatedUser;
//   }

//   // Method to link a new provider to the user (e.g., add a Google or Facebook login)
//   async linkProvider(userId: string, providerType: ProviderType, providerId: string) {
//     const user = await prisma.user.findUnique({ where: { id: userId } });
//     if (!user) {
//       throw new Error('User not found');
//     }

//     // Check if the provider already exists for the user
//     const existingProvider = await prisma.provider.findUnique({
//       where: {
//         providerId_provider: {
//           providerId,
//           provider: providerType,
//         },
//       },
//     });

//     if (existingProvider) {
//       throw new Error('Provider already linked');
//     }

//     // Link the provider to the user
//     const provider = await prisma.provider.create({
//       data: {
//         provider: providerType,
//         providerId,
//         userId,
//       },
//     });

//     return provider;
//   }

//   // Method to unlink a provider from a user
//   async unlinkProvider(userId: string, providerType: ProviderType, providerId: string) {
//     // Find and delete the provider
//     const provider = await prisma.provider.findUnique({
//       where: {
//         providerId_provider: {
//           providerId,
//           provider: providerType,
//         },
//       },
//     });

//     if (!provider || provider.userId !== userId) {
//       throw new Error('Provider not found or does not belong to this user');
//     }

//     await prisma.provider.delete({
//       where: {
//         id: provider.id,
//       },
//     });

//     return { message: 'Provider unlinked successfully' };
//   }

//   // Method to reset password
//   async resetPassword(email: string, newPassword: string) {
//     // Hash the new password
//     const hashedPassword = await bcrypt.hash(newPassword, 10);

//     // Find and update the user's password
//     const user = await prisma.user.update({
//       where: { email },
//       data: { password: hashedPassword },
//     });

//     return user;
//   }

//   // Method to verify a user's email (assuming you send a verification link)
//   async verifyEmail(userId: string, verificationToken: string) {
//     // Validate token (you would generate this token and send it in a real app)
//     try {
//       const decoded = jwt.verify(verificationToken, process.env.JWT_SECRET);
//       if (decoded.userId !== userId) {
//         throw new Error('Invalid token');
//       }

//       // Update the user's email verification status
//       const user = await prisma.user.update({
//         where: { id: userId },
//         data: { verified: true },
//       });

//       return user;
//     } catch (error) {
//       throw new Error('Invalid or expired token');
//     }
//   }
// }

// export default new UserService();
