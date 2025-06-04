import { buildSchema } from "type-graphql";
import { AuthResolver } from "./resolvers/auth.resolver";
import { UserResolver } from "./resolvers/user.resolver";
import { TransactionResolver } from "./resolvers/transaction.resolver";
import { ReviewResolver } from "./resolvers/review.resolver";
import { VerificationResolver } from "./resolvers/verification.resolver";
import { DisputeResolver } from "./resolvers/dispute.resolver";
import { WalletResolver } from "./resolvers/wallet.resolver";
import { NotificationResolver } from "./resolvers/notification.resolver";
import { PaymentResolver } from "./resolvers/payment.resolver";
import { WithdrawalResolver } from "./resolvers/withdrawal.resolver";
import { AuditLogResolver } from "./resolvers/audit-log.resolver";
import { AdminResolver } from "./resolvers/admin.resolver";
import { ReportResolver } from "./resolvers/report.resolver";
import { DashboardResolver } from "./resolvers/dashboard.resolver";

export const createSchema = async () => {
  return buildSchema({
    resolvers: [
      AuthResolver,
      UserResolver,
      TransactionResolver,
      ReviewResolver,
      VerificationResolver,
      DisputeResolver,
      WalletResolver,
      NotificationResolver,
      PaymentResolver,
      WithdrawalResolver,
      AuditLogResolver,
      AdminResolver,
      ReportResolver,
      DashboardResolver,
    ],
    validate: false,
    emitSchemaFile: true,
  });
};
