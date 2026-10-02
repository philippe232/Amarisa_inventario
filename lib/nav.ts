// The names of the screens in the drawer. The drawer's labels and the top
// bar's title both come from here, so what you tapped is what the bar says.
export const NAV_TITLES = {
  inicio: "Inicio",
  catalogo: "Catálogo",
  wishlist: "Mi lista",
  revision: "Revisión de Inventario",
  precios: "Precios de Compra",
  ventas: "Ventas",
} as const;

const ROUTE_TITLES: { path: string; title: string; exact?: boolean }[] = [
  { path: "/inicio", title: NAV_TITLES.inicio },
  // Exact: the catalog's own sub-pages (an article, its edit form) have
  // their own title or keep the brand.
  { path: "/items", title: NAV_TITLES.catalogo, exact: true },
  { path: "/wishlist", title: NAV_TITLES.wishlist },
  { path: "/revision", title: NAV_TITLES.revision },
  { path: "/match-compras", title: NAV_TITLES.precios },
  { path: "/ventas", title: NAV_TITLES.ventas },
];

// The drawer screen a path belongs to, or null for anything outside it
// (login, the article edit form...), which keeps the plain brand.
export function titleForPath(pathname: string): string | null {
  const hit = ROUTE_TITLES.find((r) => pathname === r.path || (!r.exact && pathname.startsWith(r.path + "/")));
  return hit?.title ?? null;
}
