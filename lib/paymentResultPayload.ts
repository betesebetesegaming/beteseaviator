export type PaymentResultKind = 'success' | 'failure';

export interface PaymentResultPayload {
  kind: PaymentResultKind;
  title: string;
  message: string;
  amount?: number;
  method?: string;
  reference?: string;
}

export function buildDepositResult(
  status: 'Approved' | 'Rejected',
  amount: number,
  method: string,
  reference?: string,
): PaymentResultPayload {
  if (status === 'Approved') {
    return {
      kind: 'success',
      title: 'Deposit Successful!',
      message: 'Your wallet has been credited. You can place bets right away.',
      amount,
      method,
      reference,
    };
  }
  return {
    kind: 'failure',
    title: 'Deposit Failed',
    message: 'The payment provider did not confirm your deposit. No funds were added to your wallet.',
    amount,
    method,
    reference,
  };
}

export function buildWithdrawalResult(
  status: 'Completed' | 'Failed' | 'Canceled',
  amount: number,
  method?: string,
  reference?: string,
): PaymentResultPayload | null {
  if (status === 'Completed') {
    return {
      kind: 'success',
      title: 'Withdrawal Sent!',
      message: 'Your mobile money payout was confirmed by the provider.',
      amount,
      method: method || 'Mobile Money',
      reference,
    };
  }
  if (status === 'Failed') {
    return {
      kind: 'failure',
      title: 'Withdrawal Failed',
      message: 'The payout could not be completed. Your wallet balance has been restored if it was held.',
      amount,
      method: method || 'Mobile Money',
      reference,
    };
  }
  return null;
}
