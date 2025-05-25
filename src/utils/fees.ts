/**
 * Calculates the escrow fee for a transaction
 * @param amount The transaction amount
 * @returns The escrow fee
 */
// export function calculateEscrowFee(amount: number): Decimal {
//   const feePercentage = 0.025;
//   const fee = amount * feePercentage;

import { Decimal } from "@prisma/client/runtime/library";

//   const roundedFee = Math.round(fee * 100) / 100;

//   return new Decimal(roundedFee);
// }

export function calculateEscrowFee(amount: Decimal | number): Decimal {
  const decimalAmount = new Decimal(amount); // safe whether it's already Decimal or just number
  const fee = decimalAmount.mul(0.015);
  return fee.toDecimalPlaces(2);
}

// export function toDecimal(value: unknown): Decimal {
//   return new Decimal(value);
// }
