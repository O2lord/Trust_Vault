use anchor_lang::prelude::*;

#[error_code]
pub enum TrustExpressError {
    #[msg("Custom error message")]
    CustomError,
    #[msg("The requested withdrawal amount exceeds the trust express balance.")]
    InsufficientFunds,
    #[msg("The withdrawal amount is invalid.")]
    InvalidWithdrawAmount,
    #[msg("Invalid amount specified.")]
    InvalidAmount,
    #[msg("Invalid price specified.")]
    InvalidPrice,
    #[msg("Currency code must be exactly 3 characters.")]
    InvalidCurrency,
    #[msg("Payment instructions must be 100 characters or less.")]
    PaymentInstructionsTooLong,
    #[msg("There is an active reservation.")]
    ActiveReservationsExist,
    #[msg("Maker's associated token account is missing.")]
    MissingMakerAta,
    #[msg("The reservation amount is invalid.")]
    CannotReduceBelowReserved,
    #[msg("Insufficient tokens available in the trust express.")]
    InsufficientTokens,
    #[msg("Calculation error occurred.")]
    CalculationError,
    #[msg("Invalid reservation index.")]
    InvalidReservationIndex,
    #[msg("Invalid maker.")]
    InvalidMaker,
    #[msg("You are not authorized to perform this action.")]
    Unauthorized,
    #[msg("Reservation is not in pending status.")]
    ReservationNotPending,
    #[msg("Mint is not invalid.")]
    InvalidMint,
    #[msg("Arithemetic overflow.")]
    ArithmeticOverflow,
    #[msg("Invalid taker for this reservation.")]
    InvalidTaker,
    #[msg("Invalid fee destination for this reservation.")]
    InvalidFeeDestination,
    #[msg("Invalid program ID .")]
    InvalidProgramId,
    #[msg("Invalid comment.")]
    InvalidComment,
    #[msg("Invalid resolution status.")]
    InvalidResolution,
    #[msg("Cannot withdraw funds with pending reservations.")]
    PendingReservationsExist,
    #[msg("Cannot dispute a completed or cancelled transaction")]
    CannotDisputeCompletedTransaction,
    #[msg("Only the maker or taker can dispute a transaction")]
    UnauthorizedDisputer,
    #[msg("Only an authorized resolver can resolve a dispute")]
    UnauthorizedResolver,
    #[msg("Transaction is not in disputed status")]
    NotDisputed,
    #[msg("No payment instructions provided")]
    InvalidPaymentInstructions,
    #[msg("Too many active reservations for this trust express.")]
    TooManyReservations,
    #[msg("Invalid trust express type")]
    InvalidTrustExpressType,
    #[msg("Payment not sent")]
    PaymentNotSent,
    #[msg("There is an active token deposit")]
    ActiveTokenDepositsExist,
    #[msg("All buyer orders are filled")]
    NoUnreservedTokens,
    #[msg("Reservation not found for the given taker and payout reference")]
    ReservationNotFound,
    #[msg("Reservation has already been processed and cannot be modified")]
    ReservationAlreadyProcessed,
    #[msg("Fee destination ATA is required when fee amount is greater than zero")]
    MissingFeeDestinationAta,
    #[msg("Taker ATA is required for refunds when payout fails")]
    MissingTakerAtaForRefund,
    #[msg("The provided maker ATA does not belong to the maker")]
    InvalidMakerAtaAuthority,
    #[msg("Invalid Flutterwave credential ID: must be between 1 and 64 characters")]
    InvalidCredentialId,
    #[msg("Limit reached, use another order or wait")]
    ReservationLimitReached,
    #[msg("Invalide Escrow Type")]
    InvalidEscrowType,
    #[msg("Invalide Taker Authority")]
    InvalidTakerAtaAuthority,
    #[msg("Missing Taker ATA")]
    MissingTakerAta,
    #[msg("Invalid Payment Mode")]
    InvalidPaymentMode,
    #[msg("Insufficient Amount")]
    InsufficientAmount,
    #[msg("Invalid Payout Reference")]
    InvalidPayoutReference,
    #[msg("Buy orders and reservations are currently paused by admin")]
    BuyOrdersPaused,
    #[msg("Sell orders and reservations are currently paused by admin")]
    SellOrdersPaused,
    #[msg("Invalid fee percentage: must be between 0 and 1000 basis points (0-10%)")]
    InvalidFeePercentage,

    // ── Validator consensus errors ────────────────────────────────────────────
    #[msg("Signer is not a registered validator")]
    UnauthorizedValidator,
    #[msg("This validator has already cast a vote for this reservation")]
    AlreadyVoted,
    #[msg("Vote has already been executed")]
    VoteAlreadyExecuted,
    #[msg("Vote window has expired — use finalize_expired_vote")]
    VoteExpired,
    #[msg("Vote has not yet expired")]
    VoteNotYetExpired,
    #[msg("All 5 validator slots are occupied")]
    ValidatorSlotsFull,
    #[msg("Validator pubkey not found in registry")]
    ValidatorNotFound,
    #[msg("Validator is already registered")]
    ValidatorAlreadyRegistered,
    #[msg("All vote slots are occupied (max 5 voters)")]
    VoteSlotsFull,
    #[msg("Required votes must be between 1 and 5")]
    InvalidVoteThreshold,
    #[msg("Threshold cannot exceed the number of registered validators")]
    ThresholdExceedsValidators,
    #[msg("Invalid Pool Authority")]
    InvalidPoolAuthority,
    #[msg("Nothing to claim")]
    NothingToClaim,
    #[msg("Insufficient pool balance")]
    InsufficientPoolBalance,
    #[msg("Reference hash does not match keccak256(payout_reference)")]
    InvalidReferenceHash,
    #[msg("Cannot remove validator while votes are in progress")]
    ActiveVotesInProgress,
    #[msg("Vote has not yet been executed")]
    VoteNotYetExecuted,
}
