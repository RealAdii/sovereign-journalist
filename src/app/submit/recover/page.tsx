import Header from "@/components/Header";
import RecoveryForm from "@/components/RecoveryForm";

export default function RecoverPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen px-4 sm:px-6 pt-24 pb-16">
        <RecoveryForm />
      </main>
    </>
  );
}
