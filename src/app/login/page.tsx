import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth/session";
import { Logo } from "@/components/layout/logo";
import { Footer } from "@/components/layout/footer";
import { LoginForm } from "./login-form";

export const metadata = { title: "Masuk" };

export default async function LoginPage() {
  if (await getAuth()) redirect("/dashboard");
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-white via-white to-brand-50">
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-6 flex justify-center">
            <Logo className="h-auto w-64 sm:w-72" priority />
          </div>
          <div className="card p-6 sm:p-8">
            <h1 className="text-lg font-bold text-slate-900">Masuk ke Aplikasi Warga</h1>
            <p className="mb-5 mt-1 text-sm text-slate-500">Gunakan akun yang diberikan oleh pengurus perumahan.</p>
            <LoginForm />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
