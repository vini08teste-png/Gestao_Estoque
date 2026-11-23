import Link from "next/link";
import { redirect } from "next/navigation";
import { changePassword, logout } from "@/app/auth-actions";
import { ActionForm } from "@/components/action-form";
import { loadViewer } from "@/lib/auth";

export default async function PasswordPage() {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");
  return <main className="content password-page">
    <header className="page-heading"><div>
      <h1>{viewer.mustChangePassword ? "Crie sua nova senha" : "Trocar senha"}</h1>
      <p>{viewer.mustChangePassword ? "Use a senha temporária no primeiro campo e escolha a nova senha para continuar."
        : "Ao salvar, entre novamente com a nova senha."}</p>
    </div>
    {viewer.mustChangePassword ? <form action={logout}><button className="button" type="submit">Sair</button></form>
      : <Link className="button" href="/">Voltar à área de trabalho</Link>}</header>
    <section className="panel editor">
      <ActionForm action={changePassword} label="Salvar nova senha">
        <label className="field">{viewer.mustChangePassword ? "Senha temporária" : "Senha atual"}
          <input name="currentPassword" type="password" autoComplete="current-password" maxLength={128} required />
        </label>
        <label className="field">Nova senha
          <input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
          <small>Use de 12 a 128 caracteres.</small>
        </label>
        <label className="field">Repita a nova senha
          <input name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
        </label>
      </ActionForm>
    </section>
  </main>;
}
