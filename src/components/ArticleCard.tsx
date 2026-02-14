import Link from "next/link";
import type { PublishedArticle } from "@/lib/types";

interface Props {
  article: PublishedArticle;
}

export default function ArticleCard({ article }: Props) {
  const confidenceColor =
    article.confidenceScore >= 70
      ? "text-neon-green"
      : article.confidenceScore >= 40
        ? "text-warning"
        : "text-error";

  return (
    <Link href={`/article/${article.cid}`} className="block no-underline">
      <div className="card-hover group">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-neon-green shadow-[0_0_6px_#00FF88]" />
            <span className="font-mono text-[10px] text-neon-green">
              verified source
            </span>
          </div>
          <span className={`font-mono text-[10px] ${confidenceColor}`}>
            {article.confidenceScore}%
          </span>
        </div>

        <h3 className="text-base font-semibold text-text-primary mb-2 group-hover:text-neon-green transition-colors">
          {article.title}
        </h3>

        {article.subtitle && (
          <p className="text-xs text-text-muted leading-relaxed mb-3 line-clamp-2">
            {article.subtitle}
          </p>
        )}

        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-1.5">
            {article.tags?.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-bg-elevated text-text-muted"
              >
                {tag}
              </span>
            ))}
          </div>
          <span className="font-mono text-[10px] text-text-muted">
            {new Date(article.publishedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
      </div>
    </Link>
  );
}
