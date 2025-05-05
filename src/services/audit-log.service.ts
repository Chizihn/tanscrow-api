import { Request } from "express";
import {
  AuditAction,
  AuditCategory,
  PrismaClient,
} from "../generated/prisma-client";

export interface AuditLogData {
  userId?: string;
  entityId?: string;
  entityType: string;
  action: AuditAction;
  category: AuditCategory;
  details?: Record<string, any>;
  request?: Request;
}

export class AuditLogService {
  constructor(private prisma: PrismaClient) {}

  async log(data: AuditLogData): Promise<void> {
    const { userId, entityId, entityType, action, category, details, request } =
      data;

    await this.prisma.auditLog.create({
      data: {
        userId,
        entityId,
        entityType,
        action,
        category,
        details,
        ipAddress: request?.ip,
        userAgent: request?.headers["user-agent"],
      },
    });
  }

  async logUserAction(
    userId: string,
    action: AuditAction,
    details?: Record<string, any>,
    request?: Request
  ): Promise<void> {
    await this.log({
      userId,
      entityId: userId,
      entityType: "User",
      action,
      category: AuditCategory.USER,
      details,
      request,
    });
  }

  async logSecurityEvent(
    action: AuditAction,
    details: Record<string, any>,
    userId?: string,
    request?: Request
  ): Promise<void> {
    await this.log({
      userId,
      entityType: "Security",
      action,
      category: AuditCategory.SECURITY,
      details,
      request,
    });
  }

  async logSystemChange(
    action: AuditAction,
    details: Record<string, any>,
    userId?: string,
    request?: Request
  ): Promise<void> {
    await this.log({
      userId,
      entityType: "System",
      action,
      category: AuditCategory.SYSTEM,
      details,
      request,
    });
  }

  async logAdminAction(
    adminId: string,
    action: AuditAction,
    details: Record<string, any>,
    entityId?: string,
    entityType?: string,
    request?: Request
  ): Promise<void> {
    await this.log({
      userId: adminId,
      entityId,
      entityType: entityType || "Admin",
      action,
      category: AuditCategory.ADMIN,
      details,
      request,
    });
  }
}
