import Header from "@/components/Header";
import StepIndicator from "@/components/StepIndicator";
import ChatInterface from "@/components/ChatInterface";

export default function InterviewPage() {
  return (
    <>
      <Header />
      <main className="pt-14">
        <div className="pt-4 px-6">
          <StepIndicator currentStep={2} />
        </div>
        <ChatInterface />
      </main>
    </>
  );
}
