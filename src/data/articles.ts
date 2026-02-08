import { ComponentType } from "react"
import { lazyWithRetry } from "@/utils/lazyWithRetry"

export type ArticleCategory = "analysis" | "lists" | "explainer" | "history"

export const CATEGORY_LABELS: Record<ArticleCategory, string> = {
  analysis: "Analysis",
  lists: "Lists",
  explainer: "Explainer",
  history: "History",
}

export interface ArticleMeta {
  slug: string
  title: string
  description: string
  category: ArticleCategory
  publishedDate: string
  updatedDate?: string
  author: string
  tags: string[]
  relatedSlugs: string[]
  component: React.LazyExoticComponent<ComponentType>
  wordCount: number
}

const WORDS_PER_MINUTE = 238

export function getReadingTime(wordCount: number): number {
  return Math.ceil(wordCount / WORDS_PER_MINUTE)
}

export const articles: ArticleMeta[] = [
  {
    slug: "deadliest-horror-franchises",
    title: "The Deadliest Horror Franchises: Cast Mortality Rates Compared",
    description:
      "Which horror franchises have lost the most cast members? We compare mortality rates across major horror series using actuarial data.",
    category: "analysis",
    publishedDate: "2026-02-08",
    author: "Dead on Film",
    tags: ["horror", "franchises", "mortality-rates", "analysis"],
    relatedSlugs: [],
    component: lazyWithRetry(() => import("../pages/articles/DeadliestHorrorFranchisesArticle")),
    wordCount: 1200,
  },
]

export function getArticleBySlug(slug: string): ArticleMeta | undefined {
  return articles.find((a) => a.slug === slug)
}

export function getRelatedArticles(article: ArticleMeta): ArticleMeta[] {
  return article.relatedSlugs
    .map((slug) => articles.find((a) => a.slug === slug))
    .filter((a): a is ArticleMeta => a !== undefined)
}
