import {
  Field,
  ID,
  ObjectType,
  InputType,
  registerEnumType,
} from "type-graphql";
import {
  NotificationType,
  NotificationType as PrismaNotificationType,
} from "../../generated/prisma-client";

registerEnumType(PrismaNotificationType, {
  name: "NotificationType",
  description: "Types of notifications in the system",
});

@ObjectType()
export class Notification {
  @Field(() => ID)
  id?: string;

  @Field(() => String)
  userId?: string;

  @Field(() => String)
  title?: string;

  @Field(() => String)
  message?: string;

  @Field(() => NotificationType)
  type?: PrismaNotificationType;

  @Field()
  isRead?: boolean;

  @Field(() => String, { nullable: true })
  relatedEntityId?: string | null;

  @Field(() => String, { nullable: true })
  relatedEntityType?: string | null;

  @Field(() => Date)
  createdAt?: Date | null;

  @Field(() => Date)
  updatedAt?: Date | null;
}

@InputType()
export class MarkNotificationReadInput {
  @Field(() => ID)
  notificationId?: string;
}

@InputType()
export class UpdateNotificationPreferencesInput {
  @Field(() => Boolean, { nullable: true })
  emailNotifications?: boolean;

  @Field(() => Boolean, { nullable: true })
  pushNotifications?: boolean;

  @Field(() => [NotificationType], { nullable: true })
  disabledTypes?: PrismaNotificationType[];
}
