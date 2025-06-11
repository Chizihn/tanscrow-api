import {
  Resolver,
  Subscription,
  Root,
  Arg,
  Mutation,
  Query,
  Ctx,
} from "type-graphql";
import { PubSub as GraphQLPubSub, PubSubEngine } from "graphql-subscriptions";
import {
  Chat,
  ChatSubscriptionPayload,
  MessageSubscriptionPayload,
  TypingPayload,
} from "../types/chat.type";
import { GraphQLContext } from "../types/context.type";
import { prisma } from "../../config/db.config";
import { Message } from "../types/message.type";

const SUBSCRIPTION_TOPICS = {
  NEW_MESSAGE: "NEW_MESSAGE",
  CHAT_UPDATED: "CHAT_UPDATED",
  USER_TYPING: "USER_TYPING",
  MESSAGE_READ: "MESSAGE_READ",
  MESSAGE_DELETED: "MESSAGE_DELETED",
} as const;

@Resolver()
export class ChatSubscriptionResolver {
  constructor(private pubSub: PubSubEngine = new GraphQLPubSub()) {}

  // Subscriptions
  @Subscription(() => MessageSubscriptionPayload, {
    topics: ({ args }) => `${SUBSCRIPTION_TOPICS.NEW_MESSAGE}_${args.chatId}`,
  })
  messageUpdates(
    @Arg("chatId") chatId: string,
    @Root() payload: MessageSubscriptionPayload
  ): MessageSubscriptionPayload {
    return payload;
  }

  @Subscription(() => ChatSubscriptionPayload, {
    topics: ({ context }) =>
      `${SUBSCRIPTION_TOPICS.CHAT_UPDATED}_${context.userId}`,
  })
  chatUpdates(
    // @Ctx() context: Context,
    @Root() payload: ChatSubscriptionPayload
  ): ChatSubscriptionPayload {
    return payload;
  }

  @Subscription(() => TypingPayload, {
    topics: ({ args }) => `${SUBSCRIPTION_TOPICS.USER_TYPING}_${args.chatId}`,
    filter: ({ payload, context }) => {
      // Don't send typing events to the user who is typing
      return payload.user.id !== context.userId;
    },
  })
  userTyping(
    @Arg("chatId") chatId: string,
    // @Ctx() context: Context,
    @Root() payload: TypingPayload
  ): TypingPayload {
    return payload;
  }

  // Mutations that trigger subscriptions
  @Mutation(() => Message)
  async sendMessage(
    @Arg("chatId") chatId: string,
    @Arg("content", { nullable: true }) content: string,
    @Arg("attachmentIds", () => [String], { defaultValue: [] })
    attachmentIds: string[],
    @Ctx() { user }: GraphQLContext
  ): Promise<Message> {
    // Create the message
    const message = await prisma.message.create({
      data: {
        chatId,
        senderId: user?.id as string,
        content,
        attachments: {
          connect: attachmentIds.map((id) => ({ id })),
        },
      },
      include: {
        sender: true,
        attachments: true,
      },
    });

    // Update chat's updatedAt
    await prisma.chat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    });

    // Publish to subscribers
    await this.pubSub.publish(`${SUBSCRIPTION_TOPICS.NEW_MESSAGE}_${chatId}`, {
      message,
      type: "NEW_MESSAGE",
    });

    return message;
  }

  @Mutation(() => Boolean)
  async setTyping(
    @Arg("chatId") chatId: string,
    @Arg("isTyping") isTyping: boolean,
    @Ctx() { user: contextUser }: GraphQLContext
  ): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: contextUser?.id as string },
    });

    if (!user) {
      throw new Error("User not found");
    }

    // Publish typing status
    await this.pubSub.publish(`${SUBSCRIPTION_TOPICS.USER_TYPING}_${chatId}`, {
      chatId,
      user,
      isTyping,
    });

    return true;
  }

  @Mutation(() => Chat)
  async createChat(
    @Arg("participantIds", () => [String]) participantIds: string[],
    @Ctx() { user }: GraphQLContext
  ): Promise<Chat> {
    // Include the current user in participants
    const allParticipantIds = [...new Set([user?.id, ...participantIds])];

    const chat = await prisma.chat.create({
      data: {
        participants: {
          connect: allParticipantIds.map((id) => ({ id })),
        },
      },
      include: {
        participants: true,
        messages: {
          include: {
            sender: true,
            attachments: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    // Notify all participants about the new chat
    for (const participantId of allParticipantIds) {
      await this.pubSub.publish(
        `${SUBSCRIPTION_TOPICS.CHAT_UPDATED}_${participantId}`,
        {
          chat,
          type: "CHAT_CREATED",
        }
      );
    }

    return chat;
  }

  @Mutation(() => Boolean)
  async markMessageAsRead(
    @Arg("messageId") messageId: string,
    @Ctx() { user }: GraphQLContext
  ): Promise<boolean> {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: true,
        attachments: true,
      },
    });

    if (!message) {
      throw new Error("Message not found");
    }

    // Publish read status update
    await this.pubSub.publish(
      `${SUBSCRIPTION_TOPICS.NEW_MESSAGE}_${message.chatId}`,
      {
        message,
        type: "MESSAGE_READ",
      }
    );

    return true;
  }

  @Mutation(() => Boolean)
  async deleteMessage(
    @Arg("messageId") messageId: string,
    @Ctx() { user }: GraphQLContext
  ): Promise<boolean> {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: true,
        attachments: true,
      },
    });

    if (!message) {
      throw new Error("Message not found");
    }

    // Check if user owns the message
    if (message.senderId !== (user?.id as string)) {
      throw new Error("Not authorized to delete this message");
    }

    await prisma.message.delete({
      where: { id: messageId },
    });

    // Publish deletion update
    await this.pubSub.publish(
      `${SUBSCRIPTION_TOPICS.NEW_MESSAGE}_${message.chatId}`,
      {
        message,
        type: "MESSAGE_DELETED",
      }
    );

    return true;
  }

  // Queries
  @Query(() => [Chat])
  async myChats(@Ctx() { user }: GraphQLContext): Promise<Chat[]> {
    return prisma.chat.findMany({
      where: {
        participants: {
          some: { id: user?.id as string },
        },
      },
      include: {
        participants: true,
        messages: {
          include: {
            sender: true,
            attachments: true,
          },
          orderBy: { createdAt: "desc" },
          take: 1, // Get only the latest message for chat list
        },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  @Query(() => Chat, { nullable: true })
  async chat(
    @Arg("id") id: string,
    @Ctx() { user }: GraphQLContext
  ): Promise<Chat | null> {
    const chat = await prisma.chat.findFirst({
      where: {
        id,
        participants: {
          some: { id: user?.id as string },
        },
      },
      include: {
        participants: true,
        messages: {
          include: {
            sender: true,
            attachments: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return chat;
  }
}
