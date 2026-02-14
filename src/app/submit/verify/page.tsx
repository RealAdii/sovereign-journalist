import Header from "@/components/Header";
import StepIndicator from "@/components/StepIndicator";
import VerificationFlow from "@/components/VerificationFlow";

export default function VerifyPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen flex items-center justify-center px-6 pt-14 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-20 pointer-events-none" />
        <div
          className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(0,212,255,0.06) 0%, transparent 70%)",
          }}
        />
        <div className="relative z-10 w-full animate-fade-in">
          <StepIndicator currentStep={1} />
          <VerificationFlow />
        </div>
      </main>
    </>
  );
}
