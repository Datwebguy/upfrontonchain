import { BaseError, ContractFunctionRevertedError, InsufficientFundsError, UserRejectedRequestError } from "viem";
import { links } from "@config/networks";
import { network } from "./network";

/** What a person sees when something fails: a plain reason, and what to do next (DESIGN.md §4 "Errors"). */
export interface PlainError {
  message: string;
  next?: string;
  link?: { label: string; href: string };
  /** Set when the fix is to approve a token first, so the screen can offer an Approve button. */
  needsApproval?: boolean;
}

/** The contract's own errors, in words. The keys are the custom error names in packages/contracts/src/Errors.sol. */
const CONTRACT_ERRORS: Record<string, PlainError> = {
  OfferChanged: { message: "The offer changed while you were looking.", next: "Refresh to see the new offer." },
  HistoryTooShort: { message: "This pool is too new for an offer.", next: "Check back after it has traded for a few days." },
  EarningsTooLow: { message: "This pool hasn't earned enough yet.", next: "Offers are based on its weakest recent period." },
  SettleFirst: { message: "The last repayment needs to be sent first.", next: "Send the repayment, then try again." },
  AdvancesPaused: { message: "New offers are paused for now.", next: "Your earnings and claims are not affected." },
  AdvanceOpen: { message: "That can't change while an advance is open.", next: "It unlocks once the advance is repaid." },
  NotPoolOwner: { message: "Only the pool's owner can do this." },
  NothingToClaim: { message: "There's nothing to claim yet.", next: "Earnings appear as trades land." },
  NothingToSettle: { message: "There's no new repayment to send yet." },
  FeeNotLower: { message: "The new fee has to be lower than the current one.", next: "A pool's fee can only go down." },
  FeeAboveMax: { message: "That fee is above the maximum.", next: "Choose a lower fee." },
  InvalidShares: { message: "The split has to add up to 100%.", next: "Adjust the bar." },
  MissingAddress: { message: "An address is missing.", next: "Add the app's address, or give the app a 0% share." },
  VaultLiquidityLow: { message: "The lender vault doesn't have that much free right now.", next: "Try a smaller amount later." },
  ERC4626ExceededMaxWithdraw: {
    message: "That's more than is free to withdraw right now.",
    next: "Some of the money is out on advances. Try a smaller amount.",
  },
  ERC20InsufficientBalance: {
    message: "Not enough USDG.",
    link: isTestnet() ? { label: "Get test USDG", href: links.paxosFaucet } : undefined,
  } as PlainError,
  ERC20InsufficientAllowance: { message: "Approve USDG first.", needsApproval: true },
};

function isTestnet(): boolean {
  return network.faucetUrl !== null;
}

const FALLBACK: PlainError = { message: "That didn't go through. Nothing was sent.", next: "Try again in a moment." };

/** Turns anything a wallet or node throws into words. The raw error never reaches the screen. */
export function plainError(error: unknown): PlainError {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) {
      return { message: "You cancelled in your wallet.", next: "Try again when you're ready." };
    }
    if (error.walk((e) => e instanceof InsufficientFundsError)) {
      return {
        message: "Not enough ETH to pay network fees.",
        link: network.faucetUrl ? { label: "Get test ETH", href: network.faucetUrl } : undefined,
      };
    }
    const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      if (name && CONTRACT_ERRORS[name]) return CONTRACT_ERRORS[name];
    }
  }
  return FALLBACK;
}
