import {
  Resolver,
  Mutation,
  Arg,
  Ctx,
  Query,
  Field,
  ObjectType,
} from "type-graphql";
import { GraphQLContext } from "../types/context.type";
import { PaymentGateway } from "../../generated/prisma-client";
import { PaymentService } from "../../services/payment.service";
import { GraphQLJSONObject } from "graphql-type-json";
import logger from "../../utils/logger";
import { prisma } from "../../config/db.config";

// Response types for GraphQL
@ObjectType()
class PaymentInitiationResponse {
  @Field()
  success!: boolean;

  @Field({ nullable: true })
  redirectUrl?: string;

  @Field({ nullable: true })
  reference?: string;

  @Field({ nullable: true })
  error?: string;
}

@Resolver()
export class PaymentResolver {
  private paymentService = PaymentService.getInstance();

  /**
   * Verify payment via callback URL
   */
  @Query(() => Boolean)
  async verifyPayment(
    @Arg("reference") reference: string,
    @Arg("gateway", () => PaymentGateway) gateway: PaymentGateway
  ): Promise<boolean> {
    return this.paymentService.verifyPayment(reference, gateway);
  }

  /**
   * Get payment status (for admin or debugging purposes)
   */
  @Query(() => GraphQLJSONObject, { nullable: true })
  async getPaymentDetails(
    @Arg("reference") reference: string,
    @Ctx() { user }: GraphQLContext
  ): Promise<any> {
    try {
      if (!user?.id || user.accountType !== "ADMIN") {
        throw new Error("Unauthorized");
      }

      const payment = await prisma.payment.findFirst({
        where: { gatewayReference: reference },
        include: {
          transactions: {
            select: {
              id: true,
              transactionCode: true,
              status: true,
              buyerId: true,
              sellerId: true,
            },
          },
        },
      });

      if (!payment) {
        throw new Error("Payment not found");
      }

      return payment;
    } catch (error) {
      logger.error(`Error fetching payment details:`, error);
      throw error;
    }
  }
}
