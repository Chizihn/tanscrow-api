// payment.type.ts

export interface TransferRecipient {
  accountNumber: string;
  bankCode: string;
  accountName: string;
}

export interface TransferResponse {
  success: boolean;
  error?: string;
  transferCode?: string;
  reference?: string;
}
