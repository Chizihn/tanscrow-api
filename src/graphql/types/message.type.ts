import { ObjectType, Field, ID } from "type-graphql";
import { User } from "./user.type";
import { Chat } from "./chat.type";

@ObjectType()
export class Attachment {
  @Field(() => ID)
  id?: string;

  @Field()
  url?: string;

  @Field()
  fileType?: string;

  @Field()
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

  @Field(() => [Attachment])
  attachments?: Attachment[];

  @Field(() => Boolean)
  isRead?: boolean;

  @Field(() => Date)
  createdAt?: Date;
}
