ALTER TABLE "Company" ADD COLUMN "alertDays" INTEGER[] NOT NULL DEFAULT ARRAY[7, 15, 30]::INTEGER[];
ALTER TABLE "Company" ADD CONSTRAINT "Company_sorted_alert_days" CHECK (
    cardinality("alertDays") = 3
    AND "alertDays"[1] BETWEEN 1 AND 365
    AND "alertDays"[1] < "alertDays"[2]
    AND "alertDays"[2] < "alertDays"[3]
    AND "alertDays"[3] <= 365
);
