import { prisma } from "../config/db.config";
import { AuditLogService } from "./audit-log.service";
import {
  AuditCategory,
  TransactionStatus,
  EscrowStatus,
  AuditAction,
} from "@prisma/client";
import { Request } from "express";

export class TransactionAuditService {
  private auditLogService: AuditLogService;

  constructor() {
    this.auditLogService = new AuditLogService(prisma);
  }

  /**
   * Log transaction state changes with detailed audit information
   */
  private validateStateTransition(
    currentStatus: TransactionStatus,
    newStatus: TransactionStatus,
    currentEscrowStatus: EscrowStatus,
    newEscrowStatus: EscrowStatus
  ): boolean {
    // Validate transaction status transitions
    const validTransitions: Record<TransactionStatus, TransactionStatus[]> = {
      [TransactionStatus.PENDING]: [
        TransactionStatus.IN_PROGRESS,
        TransactionStatus.FAILED,
        TransactionStatus.CANCELED,
      ],
      [TransactionStatus.IN_PROGRESS]: [
        TransactionStatus.COMPLETED,
        TransactionStatus.DELIVERED,
        TransactionStatus.FAILED,
        TransactionStatus.DISPUTED,
      ],
      [TransactionStatus.COMPLETED]: [
        TransactionStatus.REFUND_REQUESTED,
        TransactionStatus.REFUNDED,
      ],
      [TransactionStatus.DELIVERED]: [
        TransactionStatus.COMPLETED,
        TransactionStatus.DISPUTED,
      ],
      [TransactionStatus.FAILED]: [],
      [TransactionStatus.DISPUTED]: [
        TransactionStatus.COMPLETED,
        TransactionStatus.FAILED,
        TransactionStatus.REFUNDED,
      ],
      [TransactionStatus.REFUND_REQUESTED]: [
        TransactionStatus.REFUNDED,
        TransactionStatus.COMPLETED,
      ],
      [TransactionStatus.CANCELED]: [],
      [TransactionStatus.REFUNDED]: [],
    };

    // Validate escrow status transitions
    const validEscrowTransitions: Record<EscrowStatus, EscrowStatus[]> = {
      [EscrowStatus.NOT_FUNDED]: [EscrowStatus.FUNDED],
      [EscrowStatus.FUNDED]: [
        EscrowStatus.RELEASED,
        EscrowStatus.REFUNDED,
        EscrowStatus.PARTIALLY_REFUNDED,
        EscrowStatus.DISPUTED,
      ],
      [EscrowStatus.RELEASED]: [],
      [EscrowStatus.REFUNDED]: [],
      [EscrowStatus.PARTIALLY_REFUNDED]: [
        EscrowStatus.REFUNDED,
        EscrowStatus.RELEASED,
      ],
      [EscrowStatus.DISPUTED]: [
        EscrowStatus.RELEASED,
        EscrowStatus.REFUNDED,
        EscrowStatus.PARTIALLY_REFUNDED,
      ],
    };

    const isValidTransactionTransition =
      validTransitions[currentStatus]?.includes(newStatus);
    const isValidEscrowTransition =
      validEscrowTransitions[currentEscrowStatus]?.includes(newEscrowStatus);

    return isValidTransactionTransition && isValidEscrowTransition;
  }

  public async logTransactionStateChange({
    transactionId,
    userId,
    previousStatus,
    newStatus,
    previousEscrowStatus,
    newEscrowStatus,
    action,
    details,
    ipAddress,
  }: {
    transactionId: string;
    userId: string;
    previousStatus: TransactionStatus;
    newStatus: TransactionStatus;
    previousEscrowStatus: EscrowStatus;
    newEscrowStatus: EscrowStatus;
    action: string;
    details: string;
    ipAddress: string;
  }) {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        buyer: true,
        seller: true,
        payment: true,
      },
    });

    if (!transaction) {
      throw new Error("Transaction not found");
    }

    // Validate state transition
    if (
      !this.validateStateTransition(
        previousStatus,
        newStatus,
        previousEscrowStatus,
        newEscrowStatus
      )
    ) {
      const errorMessage = `Invalid state transition: Transaction(${previousStatus}->${newStatus}), Escrow(${previousEscrowStatus}->${newEscrowStatus})`;
      await this.auditLogService.logSecurityEvent(
        AuditAction.REJECT,
        { message: errorMessage, ipAddress },
        userId
      );
      throw new Error(errorMessage);
    }

    // Log the state change in audit logs
    await this.auditLogService.log({
      userId,
      entityId: transactionId,
      entityType: "Transaction",
      action: AuditAction.UPDATE,
      category: AuditCategory.TRANSACTION,
      details: {
        details,
        previousStatus,
        newStatus,
        previousEscrowStatus,
        newEscrowStatus,
        transactionCode: transaction.transactionCode,
        amount: transaction.amount.toString(),
        buyerId: transaction.buyerId,
        sellerId: transaction.sellerId,
        paymentId: transaction.paymentId,
      },
      request: { ip: ipAddress } as Request,
    });

    // Create transaction log entry
    await prisma.transactionLog.create({
      data: {
        transactionId,
        action,
        status: newStatus,
        escrowStatus: newEscrowStatus,
        performedBy: userId,
        description: details,
      },
    });
  }

  /**
   * Monitor and log suspicious transaction patterns
   */
  public async monitorSuspiciousActivity(transactionId: string) {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        buyer: true,
        payment: true,
      },
    });

    if (!transaction) return;

    // Check for multiple failed transactions
    const failedTransactions = await prisma.transaction.count({
      where: {
        buyerId: transaction.buyerId,
        status: TransactionStatus.FAILED,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
    });
    if (failedTransactions >= 3) {
      await this.auditLogService.logSecurityEvent(
        AuditAction.BLOCK,
        {
          message: `Multiple failed transactions detected (${failedTransactions} in last 24h)`,
          ipAddress: "system",
        },
        transaction.buyerId
      );
    }

    // Check for unusual transaction amounts
    const averageAmount = await this.getAverageTransactionAmount(
      transaction.buyerId
    );
    if (averageAmount && transaction.amount.toNumber() > averageAmount * 3) {
      await this.auditLogService.logSecurityEvent(
        AuditAction.BLOCK,
        {
          message: `Transaction amount significantly higher than user average`,
          ipAddress: "system",
        },
        transaction.buyerId
      );
    }
  }

  /**
   * Calculate average transaction amount for a user
   */
  private async getAverageTransactionAmount(
    userId: string
  ): Promise<number | null> {
    const transactions = await prisma.transaction.findMany({
      where: {
        buyerId: userId,
        status: TransactionStatus.COMPLETED,
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        },
      },
      select: {
        amount: true,
      },
    });

    if (transactions.length === 0) return null;

    const total = transactions.reduce(
      (sum: number, t) => sum + t.amount.toNumber(),
      0
    );
    return total / transactions.length;
  }
}
