import { Helmet } from "react-helmet-async"
import JsonLd from "@/components/seo/JsonLd"
import { buildBreadcrumbSchema } from "@/utils/schema"
import { articles } from "@/data/articles"
import { ArticleCard } from "@/components/articles/ArticleLayout"

const BASE_URL = "https://deadonfilm.com"

const sortedArticles = [...articles].sort((a, b) =>
  b.publishedDate.localeCompare(a.publishedDate)
)

export default function ArticlesListPage() {
  return (
    <>
      <Helmet>
        <title>Articles - Dead on Film</title>
        <meta
          name="description"
          content="Analysis and insights about cast mortality in movies and TV shows. Explore mortality rates, historical trends, and franchise comparisons."
        />
        <meta property="og:title" content="Articles - Dead on Film" />
        <meta
          property="og:description"
          content="Analysis and insights about cast mortality in movies and TV shows."
        />
        <meta property="og:type" content="website" />
        <link rel="canonical" href={`${BASE_URL}/articles`} />
      </Helmet>
      <JsonLd
        data={buildBreadcrumbSchema([
          { name: "Home", url: BASE_URL },
          { name: "Articles", url: `${BASE_URL}/articles` },
        ])}
      />

      <div data-testid="articles-list-page" className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <h1 className="mb-2 font-display text-3xl text-brown-dark">Articles</h1>
          <p className="text-text-muted">
            Analysis and insights about cast mortality in movies and TV shows
          </p>
        </div>

        <div className="space-y-4">
          {sortedArticles.map((article) => (
            <ArticleCard key={article.slug} article={article} />
          ))}
        </div>
      </div>
    </>
  )
}
