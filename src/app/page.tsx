import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth/session";

export default async function Home() {
  redirect((await getAuth()) ? "/dashboard" : "/login");
}
