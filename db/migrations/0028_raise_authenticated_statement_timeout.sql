-- Every "timeout" chased in /match-compras this session (the proveedor
-- join, the gasto_notas embed, a plain single-sided monto range filter)
-- turned out fast once warm — sub-second to low-second, confirmed
-- directly and repeatedly against the database. What actually kills
-- them is Supabase's platform-default statement_timeout on the
-- `authenticated` role: 8 seconds, which a cold connection pool (this
-- project sees real idle gaps between sessions) can eat into on its
-- own before the query even starts running.
--
-- Raised for `authenticated` and `authenticator` (PostgREST's own login
-- role, which SET ROLEs into authenticated — raising only one left
-- ambiguity about which timeout actually governs a request) to 20s:
-- generous headroom for a cold-start admin query, still a real bound
-- against something genuinely runaway. `anon` (the public storefront)
-- is deliberately left at its conservative 3s — nothing slow lives on
-- a publicly-reachable table, no reason to loosen that.
alter role authenticated set statement_timeout = '20s';
alter role authenticator set statement_timeout = '20s';
