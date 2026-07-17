ALTER TABLE "PaymentIntent"
  ADD CONSTRAINT "PaymentIntent_positive_total_check" CHECK ("totalAmountMinor" > 0);

ALTER TABLE "PaymentAllocation"
  ADD CONSTRAINT "PaymentAllocation_nonnegative_amounts_check" CHECK (
    "grossAmountMinor" > 0 AND
    "platformFeeMinor" >= 0 AND
    "netAmountMinor" >= 0
  ),
  ADD CONSTRAINT "PaymentAllocation_balanced_check" CHECK (
    "grossAmountMinor" = "platformFeeMinor" + "netAmountMinor"
  );

ALTER TABLE "FinancialLedgerEntry"
  ADD CONSTRAINT "FinancialLedgerEntry_positive_amount_check" CHECK ("amountMinor" > 0),
  ADD CONSTRAINT "FinancialLedgerEntry_distinct_accounts_check" CHECK ("debitAccount" <> "creditAccount");

CREATE OR REPLACE FUNCTION prevent_financial_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Financial ledger entries are immutable';
END;
$$;

CREATE TRIGGER "FinancialLedgerEntry_immutable"
BEFORE UPDATE OR DELETE ON "FinancialLedgerEntry"
FOR EACH ROW
EXECUTE FUNCTION prevent_financial_ledger_mutation();
