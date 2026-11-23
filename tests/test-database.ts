export function testDatabaseUrl() {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) throw new Error("Configure TEST_DATABASE_URL com um banco PostgreSQL separado para os testes.");
  const test = new URL(value);
  const configured = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
  const endpoint = (url: URL) => [url.hostname, url.port || "5432", url.pathname].join("/");
  if (!test.pathname || test.pathname === "/" || (configured && endpoint(test) === endpoint(configured))) {
    throw new Error("TEST_DATABASE_URL deve apontar para um banco separado do DATABASE_URL.");
  }
  return value;
}
