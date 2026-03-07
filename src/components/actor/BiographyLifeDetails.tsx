import type { BiographyDetails } from "@/types/actor"
import PersonIcon from "@/components/icons/PersonIcon"
import HeartIcon from "@/components/icons/HeartIcon"
import StarIcon from "@/components/icons/StarIcon"
import SparkleIcon from "@/components/icons/SparkleIcon"

interface BiographyLifeDetailsProps {
  biographyDetails: BiographyDetails
}

interface DetailField {
  key: keyof BiographyDetails
  label: string
  icon: React.ReactNode
}

const FIELDS: DetailField[] = [
  {
    key: "birthplaceDetails",
    label: "Birthplace & Upbringing",
    icon: (
      <svg
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    key: "familyBackground",
    label: "Family",
    icon: <PersonIcon className="h-4 w-4" />,
  },
  {
    key: "education",
    label: "Education",
    icon: (
      <svg
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
        />
      </svg>
    ),
  },
  {
    key: "preFameLife",
    label: "Before Fame",
    icon: <StarIcon className="h-4 w-4" />,
  },
  {
    key: "fameCatalyst",
    label: "Rise to Fame",
    icon: <SparkleIcon className="h-4 w-4" />,
  },
  {
    key: "personalStruggles",
    label: "Personal Struggles",
    icon: <HeartIcon className="h-4 w-4" />,
  },
  {
    key: "relationships",
    label: "Relationships",
    icon: <HeartIcon className="h-4 w-4" />,
  },
]

/**
 * Displays structured biography detail fields (birthplace, family, education, etc.)
 * below the narrative when expanded. Only renders non-null fields.
 */
export default function BiographyLifeDetails({ biographyDetails }: BiographyLifeDetailsProps) {
  const visibleFields = FIELDS.filter((f) => {
    const value = biographyDetails[f.key]
    return typeof value === "string" && value.trim().length > 0
  })

  if (visibleFields.length === 0) return null

  return (
    <div
      className="border-border-subtle mt-4 space-y-3 border-t pt-4"
      data-testid="biography-life-details"
    >
      {visibleFields.map((field) => (
        <div key={field.key} className="flex gap-2">
          <span className="mt-0.5 shrink-0 text-brown-medium">{field.icon}</span>
          <div>
            <span className="text-sm font-medium text-brown-dark">{field.label}: </span>
            <span className="text-sm text-text-primary">
              {biographyDetails[field.key] as string}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
