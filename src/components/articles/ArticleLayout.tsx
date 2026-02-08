import { ReactNode } from "react"
import { Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import JsonLd from "@/components/seo/JsonLd"
import { buildBreadcrumbSchema, buildArticleSchema } from "@/utils/schema"
import { ArticleMeta, CATEGORY_LABELS, getReadingTime, getRelatedArticles } from "@/data/articles"

const BASE_URL = "https://deadonfilm.com"

/**
 * Format a YYYY-MM-DD date string to long display format (e.g. "January 15, 2026").
 * Returns the raw string if parsing fails.
 */
function formatArticleDate(dateString: string): string {
  try {
    const date = new Date(dateString + "T00:00:00")
    if (isNaN(date.getTime())) return dateString
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  } catch {
    return dateString
  }
}

/**
 * Convert a YYYY-MM-DD date to full ISO-8601 for Open Graph meta tags.
 * Returns empty string if the date is invalid.
 */
function toISOTimestamp(dateString: string): string {
  const date = new Date(dateString + "T00:00:00Z")
  if (isNaN(date.getTime())) return ""
  return date.toISOString()
}

interface ArticleLayoutProps {
  article: ArticleMeta
  children: ReactNode
}

export function ArticleCard({ article }: { article: ArticleMeta }) {
  return (
    <Link
      to={`/articles/${article.slug}`}
      data-testid={`article-card-${article.slug}`}
      className="block rounded-lg border border-brown-medium/20 bg-surface-elevated p-5 transition-shadow hover:shadow-md"
    >
      <span className="mb-2 inline-block rounded-full bg-brown-medium/10 px-2.5 py-0.5 text-xs font-medium text-brown-dark">
        {CATEGORY_LABELS[article.category]}
      </span>
      <h2 className="mb-2 font-display text-lg text-brown-dark">{article.title}</h2>
      <p className="mb-3 text-sm leading-relaxed text-text-muted">{article.description}</p>
      <div className="flex items-center gap-3 text-xs text-text-muted">
        <time dateTime={article.publishedDate}>{formatArticleDate(article.publishedDate)}</time>
        <span aria-label="reading time">{getReadingTime(article.wordCount)} min read</span>
      </div>
    </Link>
  )
}

export default function ArticleLayout({ article, children }: ArticleLayoutProps) {
  const readingTime = getReadingTime(article.wordCount)
  const relatedArticles = getRelatedArticles(article)
  const publishedDisplay = formatArticleDate(article.publishedDate)
  const updatedDisplay = article.updatedDate ? formatArticleDate(article.updatedDate) : null

  return (
    <>
      <Helmet>
        <title>{article.title} - Dead on Film</title>
        <meta name="description" content={article.description} />
        <meta property="og:title" content={`${article.title} - Dead on Film`} />
        <meta property="og:description" content={article.description} />
        <meta property="og:type" content="article" />
        {toISOTimestamp(article.publishedDate) && (
          <meta property="article:published_time" content={toISOTimestamp(article.publishedDate)} />
        )}
        {article.updatedDate && toISOTimestamp(article.updatedDate) && (
          <meta property="article:modified_time" content={toISOTimestamp(article.updatedDate)} />
        )}
        <link rel="canonical" href={`${BASE_URL}/articles/${article.slug}`} />
      </Helmet>
      <JsonLd
        data={buildBreadcrumbSchema([
          { name: "Home", url: BASE_URL },
          { name: "Articles", url: `${BASE_URL}/articles` },
          { name: article.title, url: `${BASE_URL}/articles/${article.slug}` },
        ])}
      />
      <JsonLd
        data={buildArticleSchema({
          title: article.title,
          description: article.description,
          slug: article.slug,
          publishedDate: article.publishedDate,
          updatedDate: article.updatedDate,
          wordCount: article.wordCount,
          author: article.author,
        })}
      />

      <article data-testid="article-page" className="mx-auto max-w-3xl">
        <div className="mb-8">
          <Link
            to="/articles"
            className="mb-4 inline-block text-sm text-text-muted transition-colors hover:text-brown-dark"
          >
            &larr; All Articles
          </Link>

          <div className="mb-3">
            <span className="inline-block rounded-full bg-brown-medium/10 px-2.5 py-0.5 text-xs font-medium text-brown-dark">
              {CATEGORY_LABELS[article.category]}
            </span>
          </div>

          <h1 className="mb-3 font-display text-3xl text-brown-dark">{article.title}</h1>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-muted">
            <span>{article.author}</span>
            <time dateTime={article.publishedDate}>{publishedDisplay}</time>
            {updatedDisplay && <span data-testid="updated-date">Updated {updatedDisplay}</span>}
            <span aria-label="reading time">{readingTime} min read</span>
          </div>
        </div>

        <div className="space-y-6">{children}</div>

        {relatedArticles.length > 0 && (
          <section
            data-testid="related-articles"
            className="mt-12 border-t border-brown-medium/20 pt-8"
          >
            <h2 className="mb-4 font-display text-xl text-brown-dark">Related Articles</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {relatedArticles.map((related) => (
                <ArticleCard key={related.slug} article={related} />
              ))}
            </div>
          </section>
        )}

        <div className="mt-8 text-center">
          <Link to="/articles" className="text-sm text-accent underline hover:text-brown-dark">
            Browse all articles
          </Link>
        </div>
      </article>
    </>
  )
}
