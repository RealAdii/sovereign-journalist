import Header from "@/components/Header";

export default function ArticleLoading() {
  return (
    <>
      <Header />
      <main className="min-h-screen pt-14">
        <div className="max-w-3xl mx-auto px-6 py-12 animate-pulse">
          <div className="h-3 w-20 bg-bg-elevated rounded mb-6" />
          <div className="h-8 w-3/4 bg-bg-elevated rounded mb-4" />
          <div className="flex gap-3 mb-8">
            <div className="h-5 w-32 bg-bg-elevated rounded" />
            <div className="h-5 w-20 bg-bg-elevated rounded" />
          </div>
          <div className="h-12 w-full bg-bg-elevated rounded mb-8" />
          <div className="space-y-3">
            <div className="h-4 w-full bg-bg-elevated rounded" />
            <div className="h-4 w-5/6 bg-bg-elevated rounded" />
            <div className="h-4 w-4/5 bg-bg-elevated rounded" />
            <div className="h-4 w-full bg-bg-elevated rounded" />
            <div className="h-4 w-3/4 bg-bg-elevated rounded" />
          </div>
        </div>
      </main>
    </>
  );
}
