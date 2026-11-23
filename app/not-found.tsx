import Link from "next/link";

export default function NotFound() {
  return (
    <main className="standalone content">
      <h1>Página indisponível</h1>
      <p>Confira o endereço ou retorne à sua área de trabalho.</p>
      <Link className="button" href="/">Ir para a área de trabalho</Link>
    </main>
  );
}
