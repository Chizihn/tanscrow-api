import { customAlphabet } from "nanoid";

// Create a custom nanoid generator with only uppercase letters and numbers
const nanoid = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 10);

/**
 * Generates a unique transaction code
 * Format: TRX-XXXXXXXXXX (where X is an uppercase letter or number)
 */
export function generateTransactionCode(): string {
  return `TRX-${nanoid()}`;
}
