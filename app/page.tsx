import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { logout } from "./auth-actions";

export default async function Home() {
  const { scopes } = await requireViewer();
  if (scopes.length) redirect(`/${scopes[0].companyId}`);
  return (
    <main className="standalone content">
      <h1>Acesso indisponível</h1>
      <p>Sua conta está sem um vínculo ativo. Entre em contato com a administração da sua empresa.</p>
      <form action={logout}><button className="button" type="submit">Sair</button></form>
    </main>
  );
}
