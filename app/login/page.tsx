import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { logout, login } from "@/app/auth-actions";
import { ActionForm } from "@/components/action-form";
import { Brand } from "@/components/brand";
import { loadViewer } from "@/lib/auth";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ senha?: string }> }) {
  const viewer = await loadViewer();
  if (viewer?.scopes.length) redirect("/");
  return (
    <main className="login-shell">
      <section className="login-intro">
        <div className="login-brands">
          <Brand company="tsa" variant="color" />
          <Brand company="lynx" variant="color" />
        </div>
        <div>
          <h1>Gestão de EPIs</h1>
          <p>Portal interno do Grupo TSA</p>
        </div>
      </section>
      <section className="login-panel">
        <h2>Entrar</h2>
        <p>Use as credenciais da sua conta para acessar o portal.</p>
        {(await searchParams).senha === "alterada" && <p className="feedback success" role="status">Senha alterada. Entre com a nova senha.</p>}
        <ActionForm action={login} label="Entrar">
          <label className="field">E-mail
            <input name="email" type="email" autoComplete="username" maxLength={254} required />
          </label>
          <label className="field">Senha
            <input name="password" type="password" autoComplete="current-password" maxLength={128} required />
          </label>
        </ActionForm>
        <details className="password-help">
          <summary>Esqueci minha senha</summary>
          <p>Peça ao administrador da sua empresa uma senha temporária. Ao entrar com ela, o sistema pedirá uma nova senha.</p>
        </details>
        {viewer && <form className="mt-4" action={logout}><button className="button" type="submit">Encerrar sessão anterior</button></form>}
      </section>
    </main>
  );
}
