import Link from "next/link";
import type { PublishedArticleSummary } from "@/lib/types";

interface Props {
  article: PublishedArticleSummary;
}

export default function ArticleCard({ article }: Props) {
  return (
    <Link href={`/article/${article.articleId}`} className="block no-underline">
      <article className="card-hover group h-full">
        <div className="flex items-center justify-between mb-3">
          <span className="font-mono text-[10px] text-neon-green">credential proven</span>
          <span className="font-mono text-[10px] text-text-muted">allegation reported</span>
        </div>
        <h3 className="text-base font-semibold text-text-primary mb-2 group-hover:text-neon-green transition-colors">
          {article.title}
        </h3>
        {article.subtitle && (
          <p className="text-xs text-text-muted leading-relaxed mb-3 line-clamp-3">{article.subtitle}</p>
        )}
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] text-text-muted">read from Starknet Sepolia</span>
          <time className="font-mono text-[10px] text-text-muted" dateTime={new Date(article.publishedAt * 1000).toISOString()}>
            {new Date(article.publishedAt * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </time>
        </div>
      </article>
    </Link>
  );
}
