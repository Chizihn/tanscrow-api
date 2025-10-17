import { ObjectType, Field, ID } from "type-graphql";
import { User } from "./user.type";
import { Chat } from "./chat.type";

@ObjectType()
export class Attachment {
  @Field(() => ID)
  id?: string;

  @Field(() => String, { nullable: true })
  url?: string;

  @Field(() => String, { nullable: true })
  fileType?: string;

  @Field(() => String, { nullable: true })
  fileName?: string;
}

@ObjectType()
export class Message {
  @Field(() => ID)
  id?: string;

  @Field(() => Chat)
  chat?: Chat;

  @Field(() => User)
  sender?: User;

  @Field(() => String, { nullable: true })
  content?: string | null;

  @Field(() => [Attachment], { nullable: true })
  attachments?: Attachment[];

  @Field(() => [User], { nullable: true })
  readBy?: User[];

  @Field(() => Date)
  createdAt?: Date;

  @Field(() => Date)
  updatedAt?: Date;

  @Field(() => String)
  chatId?: string;

  @Field(() => String)
  senderId?: string;
}
