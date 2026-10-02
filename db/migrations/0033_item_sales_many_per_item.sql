-- An item can now have several sales — e.g. 3 of 10 units to one buyer
-- and the other 7 to another. 0029 made item_id unique (one sale per
-- item); drop that. The plain item_sales_item_idx from 0029 still
-- serves lookups by item.
--
-- That the units across an item's sales never exceed items.quantity
-- spans rows and tables, so (like the per-sale bound in 0032) it's
-- enforced in the UI rather than a constraint.
alter table item_sales drop constraint item_sales_item_id_key;
