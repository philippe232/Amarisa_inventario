import { redirect } from "next/navigation";

// The real app starts at /items — nothing was ever built at the root
// route, so it was still showing the default create-next-app template.
export default function Home() {
  redirect("/items");
}
