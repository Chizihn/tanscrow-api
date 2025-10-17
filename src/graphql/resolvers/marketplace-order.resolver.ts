// import { Arg, Mutation, Query, Resolver, UseMiddleware } from "type-graphql";
// import { Ctx } from "type-graphql";
// import { PaymentService } from "../../services/payment.service";
// import { MarketplaceOrder } from "../types/marketplace-order.type";
// import { isAuthenticated } from "../middleware/auth.middleware";
// import { PaymentGateway } from "@prisma/client";
// import { GraphQLContext } from "../types/context.type";
// import { prisma } from "../../config/db.config";

// const paymentService = new PaymentService();

// @Resolver()
// export class MarketplaceOrderResolver {
//   @Query(() => MarketplaceOrder, { description: "Get a marketplace order by ID" })
//   async getMarketplaceOrder(@Arg("id") id: string): Promise<MarketplaceOrder | null> {
//     return await MarketplaceOrder.findUnique({ where: { id } });
//   }

//   @Mutation(() => String, { description: "Initiate escrow funding for a marketplace order and get payment URL" })
//   @UseMiddleware(isAuthenticated)
//   async initiateMarketplaceOrderPayment(
//     @Arg("orderId") orderId: string,
//     @Arg("gateway", () => PaymentGateway) gateway: PaymentGateway,
//     @Ctx() { user }: GraphQLContext
//   ): Promise<string> {
//     // Fetch order and check permissions
//     const order = await prisma.marketplaceOrder.findUnique({
//       where: { id: orderId },
//       include: { buyer: { select: { email: true } } },
//     });
//     if (!order) throw new Error("Order not found");
//     if (order.buyerId !== user!.id) throw new Error("Not authorized");
//     if (order.status !== "PENDING") throw new Error("Order is not pending payment");
//     // Create Payment record
//     const payment = await prisma.payment.create({
//       data: {
//         amount: order.amount,
//         fee: 0,
//         totalAmount: order.amount,
//         paymentCurrency: "NGN",
//         paymentGateway: gateway,
//         gatewayReference: undefined, // Will be set after gateway init
//         status: "PENDING",
//         marketplaceOrderId: order.id,
//       },
//     });
//     // Initiate payment with gateway
//     const paymentServiceResult = await paymentService.initiatePayment({
//       transactionId: order.id,
//       totalAmount: Number(order.amount),
//       email: order.buyer.email || "buyer@example.com",
//       gateway,
//       existingReference: payment.id,
//       platform: "WEB",
//     });
//     if (!paymentServiceResult.success || !paymentServiceResult.redirectUrl) {
//       throw new Error(paymentServiceResult.error || "Failed to initiate payment");
//     }
//     // Update payment with gateway reference
//     await prisma.payment.update({
//       where: { id: payment.id },
//       data: { gatewayReference: paymentServiceResult.reference },
//     });
//     return paymentServiceResult.redirectUrl;
//   }

//   @Mutation(() => MarketplaceOrder, { description: "Confirm delivery and release escrow for a marketplace order" })
//   @UseMiddleware(isAuthenticated)
//   async confirmMarketplaceOrderDelivery(
//     @Arg("orderId") orderId: string,
//     @Ctx() { user }: GraphQLContext
//   ): Promise<MarketplaceOrder> {
//     // Fetch order and check permissions
//     const order = await prisma.marketplaceOrder.findUnique({ where: { id: orderId } });
//     if (!order) throw new Error("Order not found");
//     if (order.buyerId !== user!.id) throw new Error("Not authorized");
//     if (order.status !== "PAID" || order.escrowStatus !== "FUNDED") {
//       throw new Error("Order is not eligible for delivery confirmation");
//     }
//     // Release funds to seller (credit wallet)
//     await prisma.$transaction(async (tx) => {
//       // Update order status and escrow
//       await tx.marketplaceOrder.update({
//         where: { id: orderId },
//         data: {
//           status: "COMPLETED",
//           escrowStatus: "RELEASED",
//           completedAt: new Date(),
//         },
//       });
//       // Credit seller's wallet
//       let sellerWallet = await tx.wallet.findUnique({ where: { userId: order.sellerId } });
//       if (!sellerWallet) {
//         sellerWallet = await tx.wallet.create({ data: { userId: order.sellerId, balance: 0, escrowBalance: 0, currency: "NGN" } });
//       }
//       const newBalance = sellerWallet.balance.plus(order.amount);
//       await tx.wallet.update({
//         where: { id: sellerWallet.id },
//         data: { balance: newBalance },
//       });
//       // Optionally, create a wallet transaction record here
//       // Notify both buyer and seller
//       await sendNotification({
//         userId: order.sellerId,
//         title: "Order Completed",
//         message: `Funds have been released to your wallet for a completed order.`,
//         type: "PAYMENT",
//         entityId: orderId,
//         entityType: "MarketplaceOrder",
//       });
//       await sendNotification({
//         userId: order.buyerId,
//         title: "Order Completed",
//         message: `You have confirmed delivery. Escrow has been released to the seller.`,
//         type: "PAYMENT",
//         entityId: orderId,
//         entityType: "MarketplaceOrder",
//       });
//     });
//     // Return updated order
//     return prisma.marketplaceOrder.findUnique({ where: { id: orderId } });
//   }

//   @Mutation(() => String, { description: "Open a dispute for a marketplace order" })
//   @UseMiddleware(isAuthenticated)
//   async openMarketplaceOrderDispute(
//     @Arg("orderId") orderId: string,
//     @Arg("reason") reason: string,
//     @Arg("description") description: string,
//     @Ctx() { user }: GraphQLContext
//   ): Promise<string> {
//     // Fetch order and check permissions
//     const order = await prisma.marketplaceOrder.findUnique({ where: { id: orderId } });
//     if (!order) throw new Error("Order not found");
//     if (order.buyerId !== user!.id && order.sellerId !== user!.id) {
//       throw new Error("Not authorized to open dispute for this order");
//     }
//     if (order.status === "DISPUTED") {
//       throw new Error("Dispute already exists for this order");
//     }
//     // Create dispute and update order status
//     await prisma.$transaction(async (tx) => {
//       // Create a new Dispute record (extend your Dispute model if needed)
//       await tx.dispute.create({
//         data: {
//           marketplaceOrderId: orderId,
//           initiatorId: user!.id,
//           reason,
//           description,
//           status: "OPENED",
//         },
//       });
//       await tx.marketplaceOrder.update({
//         where: { id: orderId },
//         data: { status: "DISPUTED" },
//       });
//       // Notify the counterparty
//       const notifyUserId = order.buyerId === user!.id ? order.sellerId : order.buyerId;
//       await sendNotification({
//         userId: notifyUserId,
//         title: "Marketplace Order Dispute Opened",
//         message: `A dispute has been opened for your order.`,
//         type: "DISPUTE",
//         entityId: orderId,
//         entityType: "MarketplaceOrder",
//       });
//     });
//     return "Dispute opened successfully";
//   }
// }
