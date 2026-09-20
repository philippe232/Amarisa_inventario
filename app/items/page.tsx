import ItemsList from "./items-list";

export default function ItemsPage() {
  return (
    <div className="min-h-screen bg-white">
      <h1 className="px-3.5 pt-4 text-lg font-bold text-ink">Artículos</h1>
      <ItemsList />
    </div>
  );
}
