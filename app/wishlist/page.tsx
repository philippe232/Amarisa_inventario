import Link from "next/link";
import WishlistList from "./wishlist-list";

export default function WishlistPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="flex items-center justify-between px-3.5 pt-4">
        <h1 className="text-lg font-bold text-ink">Mi lista</h1>
        <Link href="/items" className="text-sm text-ink-soft">
          Seguir viendo artículos →
        </Link>
      </div>
      <WishlistList />
    </div>
  );
}
