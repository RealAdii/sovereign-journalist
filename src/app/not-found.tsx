import Link from "next/link";
import Header from "@/components/Header";

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="min-h-screen flex items-center justify-center px-6 pt-14">
        <div className="text-center">
          <div className="font-mono text-6xl text-neon-green glow-text mb-4">
            404
          </div>
          <h1 className="text-xl font-bold text-text-primary mb-2">
            Page Not Found
          </h1>
          <p className="text-sm text-text-muted mb-6 font-mono">
            {"// the requested resource does not exist"}
          </p>
          <Link href="/" className="btn-outline inline-block">
            Back to Feed
          </Link>
        </div>
      </main>
    </>
  );
}
