import { ObjectType, Field, ID } from "type-graphql";
import { User } from "./user.type";
import { Message } from "./message.type";

@ObjectType()
export class Chat {
  @Field(() => ID)
  id?: string;

  @Field(() => User)
  user1?: User;

  @Field(() => User)
  user2?: User;

  @Field(() => [Message])
  messages?: Message[];

  @Field()
  lastMessageAt?: Date;

  @Field()
  createdAt?: Date;

  @Field()
  updatedAt?: Date;
}

// Subscription Payloads
@ObjectType()
export class MessageSubscriptionPayload {
  @Field(() => Message)
  message?: Message;

  @Field(() => String)
  type?: "NEW_MESSAGE" | "MESSAGE_READ" | "MESSAGE_DELETED";

  @Field(() => User)
  recipient?: User;
}

@ObjectType()
export class ChatSubscriptionPayload {
  @Field(() => Chat)
  chat?: Chat;

  @Field(() => String)
  type?: "CHAT_CREATED" | "CHAT_UPDATED";

  @Field(() => User)
  otherUser?: User;
}

@ObjectType()
export class TypingPayload {
  @Field(() => ID)
  chatId?: string;

  @Field(() => User)
  user?: User;

  @Field(() => Boolean)
  isTyping?: boolean;
}
