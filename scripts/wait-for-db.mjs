// Menunggu port PostgreSQL dari DATABASE_URL dapat dihubungi (maks. 60 detik).
import net from "node:net";

const url = new URL(process.env.DATABASE_URL ?? "");
const host = url.hostname;
const port = Number(url.port || 5432);
const deadline = Date.now() + 60_000;

function attempt() {
  const s = net.connect({ host, port }, () => {
    s.end();
    process.exit(0);
  });
  s.on("error", () => {
    s.destroy();
    if (Date.now() > deadline) {
      console.error(`Database ${host}:${port} tidak dapat dihubungi.`);
      process.exit(1);
    }
    setTimeout(attempt, 1000);
  });
}
attempt();
