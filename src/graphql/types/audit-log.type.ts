import { Field, ObjectType, registerEnumType } from "type-graphql";
import { GraphQLJSONObject } from "graphql-type-json";
import { AuditAction, AuditCategory } from "@prisma/client";
registerEnumType(AuditAction, {
  name: "AuditAction",
  description: "Types of audit actions that can be performed",
});

registerEnumType(AuditCategory, {
  name: "AuditCategory",
  description: "Categories of audit logs",
});

@ObjectType()
export class AuditLog {
  @Field()
  id?: string;

  @Field(() => String, { nullable: true })
  userId?: string | null;

  @Field(() => String, { nullable: true })
  entityId?: string | null;

  @Field(() => String)
  entityType?: string | null;

  @Field(() => AuditAction)
  action?: AuditAction;

  @Field(() => AuditCategory)
  category?: AuditCategory;

  @Field(() => GraphQLJSONObject, { nullable: true })
  details!: any | null;

  @Field(() => String, { nullable: true })
  ipAddress?: string | null;

  @Field(() => String, { nullable: true })
  userAgent?: string | null;

  @Field()
  createdAt?: Date;
}
