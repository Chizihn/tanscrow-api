import { Field, ObjectType } from "type-graphql";

@ObjectType()
export class UserPresence {
  @Field()
  userId!: string;

  @Field()
  isOnline!: boolean;

  @Field(() => Date)
  lastSeen!: Date;
}

@ObjectType()
export class UserPresencePayload {
  @Field(() => UserPresence)
  userPresenceChanged!: UserPresence;
}
