import Header from "@/components/Header";
import StepIndicator from "@/components/StepIndicator";
import ChatInterface from "@/components/ChatInterface";
import { aiInfo } from "@/lib/ai";

export const dynamic = "force-dynamic";

export default function InterviewPage() {
  return (
    <>
      <Header />
      <main className="pt-14">
        <div className="pt-4 px-4 sm:px-6">
          <StepIndicator currentStep={3} />
        </div>
        <ChatInterface ai={aiInfo()} />
      </main>
    </>
  );
}
