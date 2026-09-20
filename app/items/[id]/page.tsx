import ItemDetail from "./item-detail";

// A dynamic segment with no generateStaticParams isn't statically
// prerendered by default, but this is explicit for the same reason
// app/items/page.tsx and app/wishlist/page.tsx are: nothing here should
// ever run outside a real browser session.
export const dynamic = "force-dynamic";

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ItemDetail id={id} />;
}
