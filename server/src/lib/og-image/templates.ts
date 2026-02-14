/**
 * OG image templates for Satori.
 *
 * Each template returns a Satori-compatible element tree (plain objects)
 * for rendering movie, actor, and show social sharing images (1200x630).
 */

export const OG_WIDTH = 1200
export const OG_HEIGHT = 630

const DARK_BG = "#1a1a2e"
const TEXT_PRIMARY = "#f0ece2"
const TEXT_SECONDARY = "#b0aaa0"
const ACCENT = "#c2956b"

export interface MovieOgData {
  title: string
  year: number | null
  posterUrl: string | null
  posterBase64: string | null
  deceasedCount: number
  totalCast: number
}

export interface ActorOgData {
  name: string
  profileUrl: string | null
  profileBase64: string | null
  birthYear: string | null
  deathYear: string | null
  causeOfDeath: string | null
  isDeceased: boolean
}

export interface ShowOgData {
  name: string
  year: number | null
  posterUrl: string | null
  posterBase64: string | null
  deceasedCount: number
  totalCast: number
}

function branding() {
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              fontSize: 20,
              fontWeight: 700,
              color: ACCENT,
              letterSpacing: 2,
            },
            children: "DEAD ON FILM",
          },
        },
      ],
    },
  }
}

function posterImage(base64: string | null, alt: string) {
  if (!base64) {
    return {
      type: "div",
      props: {
        style: {
          width: 280,
          height: 420,
          backgroundColor: "#2a2a3e",
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        },
        children: {
          type: "div",
          props: {
            style: { fontSize: 48, color: TEXT_SECONDARY },
            children: "🎬",
          },
        },
      },
    }
  }

  return {
    type: "img",
    props: {
      src: base64,
      alt,
      width: 280,
      height: 420,
      style: {
        borderRadius: 12,
        objectFit: "cover" as const,
        flexShrink: 0,
      },
    },
  }
}

function profileImage(base64: string | null) {
  if (!base64) {
    return {
      type: "div",
      props: {
        style: {
          width: 280,
          height: 420,
          backgroundColor: "#2a2a3e",
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        },
        children: {
          type: "div",
          props: {
            style: { fontSize: 48, color: TEXT_SECONDARY },
            children: "👤",
          },
        },
      },
    }
  }

  return {
    type: "img",
    props: {
      src: base64,
      alt: "Profile",
      width: 280,
      height: 420,
      style: {
        borderRadius: 12,
        objectFit: "cover" as const,
        flexShrink: 0,
      },
    },
  }
}

function mortalityStats(deceased: number, total: number) {
  const percentage = total > 0 ? Math.round((deceased / total) * 100) : 0
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        flexDirection: "column" as const,
        gap: 8,
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              fontSize: 56,
              fontWeight: 700,
              color: TEXT_PRIMARY,
              lineHeight: 1.1,
            },
            children: `${percentage}%`,
          },
        },
        {
          type: "div",
          props: {
            style: {
              fontSize: 24,
              color: TEXT_SECONDARY,
              lineHeight: 1.3,
            },
            children: `${deceased} of ${total} cast members have passed away`,
          },
        },
      ],
    },
  }
}

export function movieTemplate(data: MovieOgData) {
  const yearStr = data.year ? ` (${data.year})` : ""

  return {
    type: "div",
    props: {
      style: {
        width: OG_WIDTH,
        height: OG_HEIGHT,
        display: "flex",
        backgroundColor: DARK_BG,
        padding: 60,
        gap: 48,
      },
      children: [
        posterImage(data.posterBase64, data.title),
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              flexDirection: "column" as const,
              justifyContent: "space-between",
              flex: 1,
              minWidth: 0,
            },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    flexDirection: "column" as const,
                    gap: 16,
                  },
                  children: [
                    {
                      type: "div",
                      props: {
                        style: {
                          fontSize: 44,
                          fontWeight: 700,
                          color: TEXT_PRIMARY,
                          lineHeight: 1.15,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        },
                        children: `${data.title}${yearStr}`,
                      },
                    },
                    mortalityStats(data.deceasedCount, data.totalCast),
                  ],
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    justifyContent: "flex-end",
                  },
                  children: branding(),
                },
              },
            ],
          },
        },
      ],
    },
  }
}

export function actorTemplate(data: ActorOgData) {
  const lifeSpan = data.isDeceased
    ? `${data.birthYear || "?"} – ${data.deathYear || "?"}`
    : data.birthYear
      ? `Born ${data.birthYear}`
      : ""

  const statusText = data.isDeceased ? "Deceased" : "Living"
  const statusColor = data.isDeceased ? "#e74c3c" : "#2ecc71"

  return {
    type: "div",
    props: {
      style: {
        width: OG_WIDTH,
        height: OG_HEIGHT,
        display: "flex",
        backgroundColor: DARK_BG,
        padding: 60,
        gap: 48,
      },
      children: [
        profileImage(data.profileBase64),
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              flexDirection: "column" as const,
              justifyContent: "space-between",
              flex: 1,
              minWidth: 0,
            },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    flexDirection: "column" as const,
                    gap: 16,
                  },
                  children: [
                    {
                      type: "div",
                      props: {
                        style: {
                          fontSize: 52,
                          fontWeight: 700,
                          color: TEXT_PRIMARY,
                          lineHeight: 1.15,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        },
                        children: data.name,
                      },
                    },
                    lifeSpan
                      ? {
                          type: "div",
                          props: {
                            style: {
                              fontSize: 28,
                              color: TEXT_SECONDARY,
                            },
                            children: lifeSpan,
                          },
                        }
                      : null,
                    {
                      type: "div",
                      props: {
                        style: {
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                        },
                        children: [
                          {
                            type: "div",
                            props: {
                              style: {
                                width: 12,
                                height: 12,
                                borderRadius: 6,
                                backgroundColor: statusColor,
                              },
                              children: "",
                            },
                          },
                          {
                            type: "div",
                            props: {
                              style: {
                                fontSize: 24,
                                color: statusColor,
                                fontWeight: 700,
                              },
                              children: statusText,
                            },
                          },
                        ],
                      },
                    },
                    data.causeOfDeath
                      ? {
                          type: "div",
                          props: {
                            style: {
                              fontSize: 22,
                              color: TEXT_SECONDARY,
                              lineHeight: 1.4,
                              marginTop: 8,
                            },
                            children: `Cause of death: ${data.causeOfDeath}`,
                          },
                        }
                      : null,
                  ].filter(Boolean),
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    justifyContent: "flex-end",
                  },
                  children: branding(),
                },
              },
            ],
          },
        },
      ],
    },
  }
}

export function showTemplate(data: ShowOgData) {
  const yearStr = data.year ? ` (${data.year})` : ""

  return {
    type: "div",
    props: {
      style: {
        width: OG_WIDTH,
        height: OG_HEIGHT,
        display: "flex",
        backgroundColor: DARK_BG,
        padding: 60,
        gap: 48,
      },
      children: [
        posterImage(data.posterBase64, data.name),
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              flexDirection: "column" as const,
              justifyContent: "space-between",
              flex: 1,
              minWidth: 0,
            },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    flexDirection: "column" as const,
                    gap: 16,
                  },
                  children: [
                    {
                      type: "div",
                      props: {
                        style: {
                          fontSize: 44,
                          fontWeight: 700,
                          color: TEXT_PRIMARY,
                          lineHeight: 1.15,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        },
                        children: `${data.name}${yearStr}`,
                      },
                    },
                    {
                      type: "div",
                      props: {
                        style: {
                          fontSize: 18,
                          color: ACCENT,
                          fontWeight: 700,
                          letterSpacing: 1,
                        },
                        children: "TV SERIES",
                      },
                    },
                    mortalityStats(data.deceasedCount, data.totalCast),
                  ],
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    justifyContent: "flex-end",
                  },
                  children: branding(),
                },
              },
            ],
          },
        },
      ],
    },
  }
}
