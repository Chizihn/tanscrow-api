import {
  Resolver,
  Query,
  Mutation,
  Arg,
  Ctx,
  UseMiddleware,
} from "type-graphql";
import {
  Notification,
  MarkNotificationReadInput,
  UpdateNotificationPreferencesInput,
} from "../types/notification.type";
import { GraphQLContext } from "../types/context.type";
import { prisma } from "../../config/db.config";
import { isAuthenticated } from "../middleware/auth.middleware";

@Resolver(Notification)
export class NotificationResolver {
  @Query(() => [Notification])
  @UseMiddleware(isAuthenticated)
  async notifications(
    @Ctx() { user }: GraphQLContext
  ): Promise<Notification[]> {
    return prisma.notification.findMany({
      where: { userId: user?.id },
      orderBy: { createdAt: "desc" },
    });
  }

  @Query(() => [Notification])
  @UseMiddleware(isAuthenticated)
  async unreadNotifications(
    @Ctx() { user }: GraphQLContext
  ): Promise<Notification[]> {
    return prisma.notification.findMany({
      where: {
        userId: user?.id,
        isRead: false,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  @Mutation(() => Notification)
  @UseMiddleware(isAuthenticated)
  async markNotificationRead(
    @Arg("notificationId") notificationId: string,
    @Ctx() { user }: GraphQLContext
  ): Promise<Notification> {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new Error("Notification not found");
    }

    if (notification.userId !== user?.id) {
      throw new Error("Not authorized to update this notification");
    }

    return prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  @Mutation(() => Boolean)
  @UseMiddleware(isAuthenticated)
  async markAllNotificationsRead(
    @Ctx() { user }: GraphQLContext
  ): Promise<boolean> {
    await prisma.notification.updateMany({
      where: {
        userId: user?.id,
        isRead: false,
      },
      data: { isRead: true },
    });

    return true;
  }

  // @Mutation(() => Boolean)
  // @UseMiddleware(isAuthenticated)
  // async updateNotificationPreferences(
  //   @Arg("input") input: UpdateNotificationPreferencesInput,
  //   @Ctx() { user }: GraphQLContext
  // ): Promise<boolean> {
  //   await prisma.user.update({
  //     where: { id: user?.id },
  //     data: {
  //       notificationPreferences: {
  //         upsert: {
  //           create: {
  //             emailNotifications: input.emailNotifications ?? true,
  //             pushNotifications: input.pushNotifications ?? true,
  //             disabledTypes: input.disabledTypes ?? [],
  //           },
  //           update: {
  //             emailNotifications: input.emailNotifications,
  //             pushNotifications: input.pushNotifications,
  //             disabledTypes: input.disabledTypes,
  //           },
  //         },
  //       },
  //     },
  //   });

  //   return true;
  // }
}
