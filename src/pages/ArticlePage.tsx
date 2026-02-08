import { Suspense } from "react"
import { useParams, Navigate } from "react-router-dom"
import { getArticleBySlug } from "@/data/articles"
import ArticleLayout from "@/components/articles/ArticleLayout"
import LoadingSpinner from "@/components/common/LoadingSpinner"

export default function ArticlePage() {
  const { slug } = useParams<{ slug: string }>()
  const article = slug ? getArticleBySlug(slug) : undefined

  if (!article) {
    return <Navigate to="/articles" replace />
  }

  const ArticleComponent = article.component

  return (
    <ArticleLayout article={article}>
      <Suspense fallback={<LoadingSpinner />}>
        <ArticleComponent />
      </Suspense>
    </ArticleLayout>
  )
}
