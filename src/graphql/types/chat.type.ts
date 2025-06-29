import { ObjectType, Field, ID } from "type-graphql";
import { User } from "./user.type";
import { Message } from "./message.type";

@ObjectType()
export class LastMessage {
  @Field(() => String, { nullable: true })
  content?: string | null;

  @Field(() => User, { nullable: true })
  sender?: User;

  @Field(() => Boolean, { nullable: true })
  isRead?: boolean;

  @Field(() => Date, { nullable: true })
  createdAt?: Date;

  // @Field(() => String, { nullable: true })
  // messageType?: string | null; 
}


@ObjectType()
export class Chat {
  @Field(() => ID)
  id?: string;

  @Field(() => [User])
  participants!: User[];

  @Field(() => [Message], {nullable: true})
  messages?: Message[];

  @Field(() => LastMessage, { nullable: true })
  lastMessage?: LastMessage | null;

  // @Field(() => Date, { nullable: true })
  // lastMessageAt?: Date;

  @Field(() => Date)
  createdAt?: Date;

  @Field(() => Date)
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
