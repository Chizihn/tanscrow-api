// import { Arg, Ctx, ID, Mutation, Query, Resolver, UseMiddleware } from "type-graphql";
// import { Product, CreateProductInput, UpdateProductInput } from "../types/product.type";
// import { isAuthenticated } from "../middleware/auth";
// import { GraphQLContext } from "../types/context";
// import { ProductStatus } from "@prisma/client";
// import { prisma } from "../../config/db.config";

// @Resolver(() => Product)
// export class ProductResolver {
//   @Query(() => [Product])
//   async products(): Promise<Product[]> {
//     return prisma.product.findMany({
//       include: { seller: true },
//       orderBy: { createdAt: "desc" },
//     });
//   }

//   @Query(() => Product, { nullable: true })
//   async product(@Arg("id", () => ID) id: string): Promise<Product | null> {
//     return prisma.product.findUnique({
//       where: { id },
//       include: { seller: true },
//     });
//   }

//   @Mutation(() => Product)
//   @UseMiddleware(isAuthenticated)
//   async createProduct(
//     @Arg("input") input: CreateProductInput,
//     @Ctx() { user }: GraphQLContext
//   ): Promise<Product> {
//     return prisma.product.create({
//       data: {
//         ...input,
//         sellerId: user?.id,
//         status: ProductStatus.ACTIVE,
//       },
//       include: { seller: true },
//     });
//   }

//   @Mutation(() => Product)
//   @UseMiddleware(isAuthenticated)
//   async updateProduct(
//     @Arg("id", () => ID) id: string,
//     @Arg("input") input: UpdateProductInput,
//     @Ctx() { user }: GraphQLContext
//   ): Promise<Product> {
//     // Only allow seller or admin to update
//     const product = await prisma.product.findUnique({ where: { id } });
//     if (!product) throw new Error("Product not found");
//     if (product.sellerId !== user?.id && user?.accountType !== "ADMIN") {
//       throw new Error("Not authorized");
//     }
//     return prisma.product.update({
//       where: { id },
//       data: { ...input },
//       include: { seller: true },
//     });
//   }

//   @Mutation(() => Product)
//   @UseMiddleware(isAuthenticated)
//   async deleteProduct(
//     @Arg("id", () => ID) id: string,
//     @Ctx() { user }: GraphQLContext
//   ): Promise<Product> {
//     // Only allow seller or admin to delete
//     const product = await prisma.product.findUnique({ where: { id } });
//     if (!product) throw new Error("Product not found");
//     if (product.sellerId !== user?.id && user?.accountType !== "ADMIN") {
//       throw new Error("Not authorized");
//     }
//     return prisma.product.delete({ where: { id }, include: { seller: true } });
//   }
// }
