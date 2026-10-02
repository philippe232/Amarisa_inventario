import { redirect } from "next/navigation";

// The site opens on the welcome page; the catalog is one tap away from
// there (and in the drawer).
export default function Home() {
  redirect("/inicio");
}
