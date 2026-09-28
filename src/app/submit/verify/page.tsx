import Header from "@/components/Header";
import StepIndicator from "@/components/StepIndicator";
import VerificationFlow from "@/components/VerificationFlow";

export default function VerifyPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen flex items-start justify-center px-4 sm:px-6 pt-24 pb-16 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-20 pointer-events-none" aria-hidden="true" />
        <div className="relative z-10 w-full animate-fade-in">
          <StepIndicator currentStep={1} />
          <VerificationFlow />
        </div>
      </main>
    </>
  );
}
