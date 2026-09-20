import ItemEditForm from "./item-edit-form";

export const dynamic = "force-dynamic";

export default async function ItemEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ItemEditForm id={id} />;
}
