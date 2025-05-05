/**
 * Calculates the escrow fee for a transaction
 * @param amount The transaction amount
 * @returns The escrow fee
 */
export function calculateEscrowFee(amount: number): number {
  // Calculate fee as 2.5% of the transaction amount
  const feePercentage = 0.025;
  const fee = amount * feePercentage;

  // Round to 2 decimal places
  return Math.round(fee * 100) / 100;
}
