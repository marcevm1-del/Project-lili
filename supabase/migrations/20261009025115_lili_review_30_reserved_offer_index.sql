-- Advisor: lili_items.reserved_offer (migration 22) is a foreign key with no
-- covering index, so deleting or expiring an offer scans every listing to
-- clear the reservation. Partial: almost every row has no reservation.
create index if not exists lili_items_reserved_offer_idx
  on public.lili_items (reserved_offer) where reserved_offer is not null;
